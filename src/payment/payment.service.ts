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
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import axiosRetry from 'axios-retry';

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
  ) {
    axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });
  }

  async startPayment(createPaymentDto: CreatePaymentDto, userId: number) {
    this.logger.log(`To‘lov boshlanmoqda: userId=${userId}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`);

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
      throw new NotFoundException('Ushbu kursga bu kategoriya tegishli emas');
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
    this.logger.log(`To‘lov yaratildi: paymentId=${savedPayment.id}, transactionId=${transactionId}`);

    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    const customerCode = this.configService.get<string>('TOCHKA_CUSTOMER_CODE');
    const clientId = this.configService.get<string>('TOCHKA_CLIENT_ID');

    if (!token || !customerCode || !clientId) {
      this.logger.error(`Tochka sozlamalari yetishmayapti: token=${!!token}, customerCode=${customerCode}, clientId=${clientId}`);
      throw new BadRequestException('Tochka JWT token, customerCode yoki clientId topilmadi');
    }

    try {
      this.logger.log(`Tochka API payments endpointiga so‘rov yuborilmoqda: https://enter.tochka.com/uapi/acquiring/v1.0/payments`);
      const paymentResponse = await axios.post(
        'https://enter.tochka.com/uapi/acquiring/v1.0/payments',
        {
          amount: category.price,
          currency: 'RUB',
          customerCode,
          clientId,
          description: `Kurs: ${course.name}, Kategoriya: ${category.name}, Daraja: ${degree}`,
          orderId: transactionId,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            CustomerCode: customerCode,
          },
        },
      );

      const paymentUrl = paymentResponse.data.Data?.paymentLink || paymentResponse.data.Data?.qrUrl || paymentResponse.data.paymentLink || paymentResponse.data.qrUrl;
      if (!paymentUrl) {
        this.logger.error(`To‘lov havolasi topilmadi: response=${JSON.stringify(paymentResponse.data)}`);
        throw new BadRequestException('To‘lov havolasi bank javobida topilmadi');
      }

      this.logger.log(`To‘lov havolasi qabul qilindi: paymentId=${savedPayment.id}, paymentUrl=${paymentUrl}`);
      return {
        paymentUrl,
        paymentId: savedPayment.id,
        purchaseId: purchase.id,
        transactionId,
      };
    } catch (err) {
      const status = err.response?.status || 'unknown';
      const responseData = JSON.stringify(err.response?.data || {});
      this.logger.error(`To‘lov havolasi qabul qilishda xato: status=${status}, response=${responseData}, message=${err.message}`);
      throw new BadRequestException(`To‘lov havolasi qabul qilishda xato: ${err.message}, status=${status}, response=${responseData}`);
    }
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
      throw new BadRequestException('Tochka public key .env faylida topilmadi');
    }

    let decoded: any;
    try {
      decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
      this.logger.log(`Webhook JWT muvaffaqiyatli tekshirildi: event=${decoded.event}`);
    } catch (err) {
      this.logger.error(`Webhook JWT tekshiruvi xato: ${err.message}`);
      throw new BadRequestException(`Webhook JWT tekshiruvi xato: ${err.message}`);
    }

    const { event, data } = decoded;
    this.logger.log(`Webhook event: ${event}, data: ${JSON.stringify(data)}`);

    if (event === 'acquiringInternetPayment' || event === 'sbpPayment') {
      const payment = await this.paymentRepository.findOne({
        where: { transactionId: data.operationId },
        relations: ['purchase', 'purchase.user', 'purchase.course', 'purchase.category'],
      });
      if (!payment) {
        this.logger.error(`To‘lov topilmadi: operationId=${data.operationId}`);
        throw new NotFoundException('To‘lov topilmadi');
      }

      this.logger.log(`To‘lov topildi: paymentId=${payment.id}, purchaseId=${payment.purchaseId}, purchase=${JSON.stringify(payment.purchase)}`);

      if (!payment.purchase) {
        this.logger.error(`Xarid topilmadi: purchaseId=${payment.purchaseId}`);
        throw new NotFoundException(`Xarid topilmadi: purchaseId=${payment.purchaseId}`);
      }

      if (data.status === 'Accepted' || data.status === 'SUCCESS') {
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
        this.logger.log(`To‘lov tasdiqlandi: paymentId=${payment.id}, purchaseId=${payment.purchaseId}`);
        return { status: 'OK' };
      } else if (['Rejected', 'DECLINED', 'CANCELLED', 'TIMEOUT', 'ERROR'].includes(data.status)) {
        payment.status = 'failed';
        await this.paymentRepository.save(payment);
        this.logger.log(`To‘lov rad etildi: paymentId=${payment.id}, status=${data.status}`);
        return { status: 'OK' };
      } else {
        this.logger.warn(`Noma’lum to‘lov statusi: ${data.status}`);
        throw new BadRequestException(`Noma’lum to‘lov statusi: ${data.status}`);
      }
    }

    this.logger.error(`Noma’lum webhook event turi: ${event}`);
    throw new BadRequestException(`Noma’lum webhook event turi: ${event}`);
  }
}