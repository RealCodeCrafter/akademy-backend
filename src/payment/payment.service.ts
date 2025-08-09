import { Injectable, NotFoundException, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UsersService } from '../user/user.service';
import { CoursesService } from '../course/course.service';
import { CategoryService } from '../category/category.service';
import { PurchasesService } from '../purchases/purchases.service';
import { LevelService } from '../level/level.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import axiosRetry from 'axios-retry';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly TOCHKA_PAYMENTS_URL = 'https://enter.tochka.com/uapi/acquiring/v1.0/payments';
  private readonly TOCHKA_CONSENTS_URL = 'https://enter.tochka.com/uapi/consent/v1.0/consents';

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private usersService: UsersService,
    private coursesService: CoursesService,
    private categoryService: CategoryService,
    private purchasesService: PurchasesService,
    private levelService: LevelService,
    private configService: ConfigService,
  ) {
    axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });
  }

  // --- helper: consentsni oladi va kerakli permissionlarni tekshiradi
  private async fetchConsents(token: string) {
    try {
      const res = await axios.get<any>(this.TOCHKA_CONSENTS_URL, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      return res.data?.Data?.Consent || [];
    } catch (err) {
      this.logger.error(`Consentsni olishda xato: ${err?.message || err}`);
      return [];
    }
  }

  private findBestConsent(consents: any[], preferredClientId?: string) {
    if (!consents || consents.length === 0) return null;
    if (preferredClientId) {
      const found = consents.find(c => c.clientId === preferredClientId);
      if (found) return found;
    }
    // agar preferred topilmadi — avvalgisini qaytar
    return consents[0];
  }

  private async ensureAcquiringPermission(token: string, desiredPermissions: string[] = ['MakeAcquiringOperation']) {
    const consents = await this.fetchConsents(token);
    if (!consents || consents.length === 0) {
      throw new BadRequestException('Token uchun hech qanday consent topilmadi. Iltimos, sayt egasidan consent yaratilishini so‘rang.');
    }

    // tokenning iss (clientId) ni tekshirish
    const decoded = jwt.decode(token) as any;
    const tokenIss = decoded?.iss;

    const consent = this.findBestConsent(consents, tokenIss);
    if (!consent) {
      throw new BadRequestException('Token bilan mos consent topilmadi. Iltimos, sayt egasidan tekshirib bering.');
    }

    const permissions: string[] = consent.permissions || [];
    const missing = desiredPermissions.filter(p => !permissions.includes(p));
    return {
      consent,
      missing,
    };
  }

  async startPayment(createPaymentDto: CreatePaymentDto, userId: number) {
    this.logger.log(`To‘lov boshlanmoqda: userId=${userId}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`);

    // 1) Validatsiya: user, course, category, level
    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    const course = await this.coursesService.findOne(createPaymentDto.courseId);
    if (!course) throw new NotFoundException('Kurs topilmadi');

    const category = await this.categoryService.findOne(createPaymentDto.categoryId);
    if (!category) throw new NotFoundException('Kategoriya topilmadi');

    const isCategoryLinked = course.categories?.some(cat => cat.id === category.id);
    if (!isCategoryLinked) throw new BadRequestException('Ushbu kursga bu kategoriya tegishli emas');

    let degree: string;
    if (createPaymentDto.levelId) {
      const level = await this.levelService.findOne(createPaymentDto.levelId);
      if (!level) throw new NotFoundException('Daraja topilmadi');
      const isLevelLinked = await this.categoryService.isLevelLinkedToCategory(createPaymentDto.categoryId, createPaymentDto.levelId);
      if (!isLevelLinked) throw new BadRequestException('Ushbu daraja bu kategoriyaga tegishli emas');
      degree = level.name;
    } else {
      degree = category.name;
    }

    // 2) Purchase & Payment yozuvlari
    const purchase = await this.purchasesService.create(createPaymentDto, userId);
    this.logger.log(`Xarid yaratildi: purchaseId=${purchase.id}`);

    const transactionId = `txn_${Date.now()}`;
    const payment = this.paymentRepository.create({
      amount: category.price,
      transactionId,
      status: 'pending',
      user,
      purchaseId: purchase.id,
      purchase,
    });
    const savedPayment = await this.paymentRepository.save(payment);
    this.logger.log(`To‘lov yozuvi yaratildi: paymentId=${savedPayment.id}, transactionId=${transactionId}`);

    // 3) Konfiguratsiya va konsent tekshiruvi
    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    let clientId = this.configService.get<string>('TOCHKA_CLIENT_ID');
    let customerCode = this.configService.get<string>('TOCHKA_CUSTOMER_CODE');
    const paymentMethodsEnv = this.configService.get<string>('TOCHKA_PAYMENT_METHODS') || 'card';
    const paymentMethods = paymentMethodsEnv.split(',').map(p => p.trim()).filter(Boolean);

    if (!token) throw new InternalServerErrorException('Tochka JWT token topilmadi');

    // consentsni tekshiring va kerakli permission borligini aniqlang
    const { consent, missing } = await this.ensureAcquiringPermission(token, ['MakeAcquiringOperation']);
    this.logger.debug(`Consent topildi: ${JSON.stringify(consent)}`);

    // Agar consent.topilgan clientId yoki customerCode farq qilsa — shu qiymatlardan foydalanishni tavsiya qilamiz
    if (consent.clientId && consent.clientId !== clientId) {
      this.logger.warn(`Envdagi clientId (${clientId}) consent.clientId (${consent.clientId}) bilan mos emas — consentdagi qiymat ishlatiladi.`);
      clientId = consent.clientId;
    }
    if (consent.customerCode && consent.customerCode !== customerCode) {
      this.logger.warn(`Envdagi customerCode (${customerCode}) consent.customerCode (${consent.customerCode}) bilan mos emas — consentdagi qiymat ishlatiladi.`);
      customerCode = consent.customerCode;
    }

    if (missing && missing.length > 0) {
      this.logger.error(`Kerakli permissionlar yetishmayapti: ${missing.join(', ')}`);
      throw new BadRequestException(`Token uchun kerakli permissionlar yetishmayapti: ${missing.join(', ')}. Iltimos, sayt egasiga murojaat qiling.`);
    }

    // 4) So'rov body — Data wrapper bilan
    const amountStr = Number(category.price).toFixed(2);
    const body = {
      Data: {
        amount: amountStr,
        currency: 'RUB',
        customerCode,
        clientId,
        orderId: transactionId,
        purpose: `Kurs: ${course.name}, Kategoriya: ${category.name}, Daraja: ${degree}`,
        paymentMode: paymentMethods,
        description: `Kurs: ${course.name} | Kategoriya: ${category.name}`,
      },
    };

    try {
      this.logger.log(`Tochka APIga so‘rov yuborilmoqda: ${this.TOCHKA_PAYMENTS_URL}, orderId=${transactionId}`);
      this.logger.debug(`Request body: ${JSON.stringify(body)}`);

      const response = await axios.post(this.TOCHKA_PAYMENTS_URL, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Client-Id': clientId,
          'CustomerCode': customerCode,
        },
        timeout: 15000,
        validateStatus: status => status < 500,
      });

      this.logger.debug(`Tochka response status=${response.status} data=${JSON.stringify(response.data)}`);

      if (response.status === 200 || response.status === 201) {
        const paymentUrl =
          response.data?.Data?.paymentLink ||
          response.data?.Data?.qrUrl ||
          response.data?.Data?.redirectUrl ||
          response.data?.paymentLink ||
          response.data?.qrUrl ||
          response.data?.redirectUrl;

        if (!paymentUrl) {
          this.logger.error(`To‘lov havolasi bank javobida topilmadi: ${JSON.stringify(response.data)}`);
          throw new BadRequestException('Bankdan to‘lov havolasi olinmadi');
        }

        // remoteId saqlash (agar kerak bo'lsa)
        try {
          const remoteId = response.data?.Data?.paymentId || response.data?.paymentId || null;
          if (remoteId) {
            (savedPayment as any).remoteId = remoteId;
            await this.paymentRepository.save(savedPayment);
          }
        } catch (e) {
          this.logger.warn(`Remote id saqlashda xatolik: ${e?.message || e}`);
        }

        return {
          paymentUrl,
          paymentId: savedPayment.id,
          purchaseId: purchase.id,
          transactionId,
        };
      } else {
        const errData = response.data || {};
        this.logger.error(`To‘lov so‘rovi rad etildi: status=${response.status}, data=${JSON.stringify(errData)}`);
        throw new BadRequestException(`Bank so‘rovi rad etildi: status=${response.status}, message=${JSON.stringify(errData)}`);
      }
    } catch (err) {
      this.logger.error(`To‘lov havolasi olishda xato: ${err?.message || err}`, err?.stack);
      const status = err.response?.status || 'unknown';
      const responseData = JSON.stringify(err.response?.data || {});
      throw new BadRequestException(`To‘lov havolasi olishda xato: ${err?.message || err}, status=${status}, response=${responseData}`);
    }
  }


  async handleCallback(callbackData: string) {
    this.logger.log('Webhook keldi');

    if (!callbackData) {
      this.logger.error('callbackData parametri taqdim etilmadi');
      throw new BadRequestException('callbackData parametri taqdim etilmadi');
    }

    const publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY');
    if (!publicKey) {
      this.logger.error('Tochka public key .env faylida topilmadi');
      throw new InternalServerErrorException('Tochka public key topilmadi');
    }

    let decoded: any;
    try {
      decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
      this.logger.log(`Webhook JWT muvaffaqiyatli tekshirildi: event=${decoded?.event || 'unknown'}`);
    } catch (err) {
      this.logger.error(`Webhook JWT tekshiruvida xato: ${err?.message || err}`);
      throw new BadRequestException(`Webhook JWT tekshiruvida xato: ${err?.message || err}`);
    }

    const { event, data } = decoded;
    this.logger.debug(`Webhook payload event=${event}, data=${JSON.stringify(data)}`);

    if (!event || !data) {
      this.logger.error('Webhook payloadda event yoki data mavjud emas');
      throw new BadRequestException('Webhook payload noto‘g‘ri formatda');
    }

    const operationId = data.operationId || data.paymentId || data.orderId || data.id;
    if (!operationId) {
      this.logger.error('Webhook data ichida operationId/paymentId/orderId topilmadi');
      throw new BadRequestException('Webhook data ichida operationId/paymentId/orderId topilmadi');
    }

    const payment = await this.paymentRepository.findOne({
      where: { transactionId: operationId },
      relations: ['purchase', 'purchase.user', 'purchase.course', 'purchase.category'],
    });

    if (!payment) {
      this.logger.error(`To‘lov topilmadi: operationId=${operationId}`);
      throw new NotFoundException('To‘lov topilmadi');
    }

    this.logger.log(`To‘lov topildi: paymentId=${payment.id}, operationId=${operationId}`);

    const statusFromBank = (data.status || '').toString();
    if (['Accepted', 'SUCCESS', 'COMPLETED'].includes(statusFromBank)) {
      payment.status = 'completed';
      await this.paymentRepository.save(payment);
      await this.purchasesService.confirmPurchase(payment.purchaseId);
      this.logger.log(`To‘lov tasdiqlandi: paymentId=${payment.id}, purchaseId=${payment.purchaseId}`);
      return { status: 'OK' };
    } else if (['Rejected', 'DECLINED', 'CANCELLED', 'TIMEOUT', 'ERROR', 'FAILED'].includes(statusFromBank)) {
      payment.status = 'failed';
      await this.paymentRepository.save(payment);
      this.logger.log(`To‘lov rad etildi: paymentId=${payment.id}, status=${statusFromBank}`);
      return { status: 'OK' };
    } else {
      this.logger.warn(`Noma’lum to‘lov statusi bankdan kelgan: ${statusFromBank}`);
      return { status: 'OK', note: `Unknown bank status: ${statusFromBank}` };
    }
  }
}
