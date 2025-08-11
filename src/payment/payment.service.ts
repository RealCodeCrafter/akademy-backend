import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
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
import * as jwt from 'jsonwebtoken';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private usersService: UsersService,
    private coursesService: CoursesService,
    private categoryService: CategoryService,
    private purchasesService: PurchasesService,
    private levelService: LevelService,
    private configService: ConfigService,
  ) {}

  async startPayment(createPaymentDto: CreatePaymentDto, userId: number) {
    this.logger.log(`To‘lov boshlanmoqda: userId=${userId}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`);

    // 1) Validatsiya: user, course, category, level
    const user = await this.usersService.findOne(userId);
    if (!user) {
      this.logger.error(`Foydalanuvchi topilmadi: userId=${userId}`);
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const course = await this.coursesService.findOne(createPaymentDto.courseId);
    if (!course) {
      this.logger.error(`Kurs topilmadi: courseId=${createPaymentDto.courseId}`);
      throw new NotFoundException('Kurs topilmadi');
    }

    const category = await this.categoryService.findOne(createPaymentDto.categoryId);
    if (!category) {
      this.logger.error(`Kategoriya topilmadi: categoryId=${createPaymentDto.categoryId}`);
      throw new NotFoundException('Kategoriya topilmadi');
    }

    const isCategoryLinked = course.categories?.some(cat => cat.id === category.id);
    if (!isCategoryLinked) {
      this.logger.error(`Ushbu kursga bu kategoriya tegishli emas: courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}`);
      throw new BadRequestException('Ushbu kursga bu kategoriya tegishli emas');
    }

    let degree: string;
    if (createPaymentDto.levelId) {
      const level = await this.levelService.findOne(createPaymentDto.levelId);
      if (!level) {
        this.logger.error(`Daraja topilmadi: levelId=${createPaymentDto.levelId}`);
        throw new NotFoundException('Daraja topilmadi');
      }
      const isLevelLinked = await this.categoryService.isLevelLinkedToCategory(createPaymentDto.categoryId, createPaymentDto.levelId);
      if (!isLevelLinked) {
        this.logger.error(`Ushbu daraja bu kategoriyaga tegishli emas: categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`);
        throw new BadRequestException('Ushbu daraja bu kategoriyaga tegishli emas');
      }
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

    // 3) Konfiguratsiya tekshiruvi
    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    const clientId = this.configService.get<string>('TOCHKA_CLIENT_ID');
    const paymentUrl = this.configService.get<string>('TOCHKA_PAYMENT_URL');

    if (!token || !clientId || !paymentUrl) {
      this.logger.error(`Tochka sozlamalari yetishmayapti: token=${!!token}, clientId=${clientId}, paymentUrl=${paymentUrl}`);
      throw new BadRequestException('Tochka JWT token, clientId yoki paymentUrl topilmadi');
    }

    // 4) JWT tokenni tekshirish
    let decoded: any;
    try {
      decoded = jwt.decode(token);
      if (!decoded || decoded.iss !== clientId) {
        this.logger.error(`JWT token noto‘g‘ri: iss=${decoded?.iss}, clientId=${clientId}`);
        throw new BadRequestException('JWT token bilan clientId mos emas');
      }
    } catch (err) {
      this.logger.error(`JWT token dekodlashda xato: ${err.message}`);
      throw new BadRequestException(`JWT token dekodlashda xato: ${err.message}`);
    }

    // 5) Statik to‘lov havolasini qaytarish
    this.logger.log(`Statik to‘lov havolasi qaytarilmoqda: paymentUrl=${paymentUrl}, paymentId=${savedPayment.id}`);
    return {
      paymentUrl,
      paymentId: savedPayment.id,
      purchaseId: purchase.id,
      transactionId,
    };
  }

  async handleCallback(callbackData: string) {
    this.logger.log(`Webhook keldi: ${callbackData}`);

    if (!callbackData) {
      this.logger.error('callbackData parametri taqdim etilmadi');
      throw new BadRequestException('callbackData parametri taqdim etilmadi');
    }

    const publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY');
    if (!publicKey) {
      this.logger.error('Tochka public key .env faylida topilmadi');
      throw new BadRequestException('Tochka public key topilmadi');
    }

    let decoded: any;
    try {
      decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
      this.logger.log(`Webhook JWT muvaffaqiyatli tekshirildi: event=${decoded?.event || 'unknown'}`);
    } catch (err) {
      this.logger.error(`Webhook JWT tekshiruvida xato: ${err.message}`);
      throw new BadRequestException(`Webhook JWT tekshiruvida xato: ${err.message}`);
    }

    const { event, data } = decoded;
    this.logger.debug(`Webhook payload: event=${event}, data=${JSON.stringify(data)}`);

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

    this.logger.log(`To‘lov topildi: paymentId=${payment.id}, purchaseId=${payment.purchaseId}`);

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
      this.logger.warn(`Noma’lum to‘lov statusi: ${statusFromBank}`);
      return { status: 'OK', note: `Unknown bank status: ${statusFromBank}` };
    }
  }
}