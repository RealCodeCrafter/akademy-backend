import { Injectable } from '@nestjs/common';
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
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class PaymentsService {
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
    console.log('Starting payment for user:', userId, createPaymentDto);
    const user = await this.usersService.findOne(userId);
    if (!user) {
      console.error('Foydalanuvchi topilmadi:', userId);
      return { ok: false, error: 'Foydalanuvchi topilmadi' };
    }

    const course = await this.coursesService.findOne(createPaymentDto.courseId);
    if (!course) {
      console.error('Kurs topilmadi:', createPaymentDto.courseId);
      return { ok: false, error: 'Kurs topilmadi' };
    }

    const category = await this.categoryService.findOne(createPaymentDto.categoryId);
    if (!category) {
      console.error('Kategoriya topilmadi:', createPaymentDto.categoryId);
      return { ok: false, error: 'Kategoriya topilmadi' };
    }

    if (!course.categories?.some((cat) => cat.id === category.id)) {
      console.error('Kategoriya kursga tegishli emas:', category.id, course.id);
      return { ok: false, error: 'Kategoriya ushbu kursga tegishli emas' };
    }

    if (category.price == null) {
      console.error('Kategoriya narxi topilmadi:', createPaymentDto.categoryId);
      return { ok: false, error: 'Kategoriya narxi topilmadi' };
    }

    let degree = category.name;
    if (createPaymentDto.levelId) {
      const level = await this.levelService.findOne(createPaymentDto.levelId);
      if (!level) {
        console.error('Daraja topilmadi:', createPaymentDto.levelId);
        return { ok: false, error: 'Daraja topilmadi' };
      }
      const isLinked = await this.categoryService.isLevelLinkedToCategory(
        createPaymentDto.categoryId,
        createPaymentDto.levelId,
      );
      if (!isLinked) {
        console.error('Daraja kategoriya uchun emas:', createPaymentDto.levelId, createPaymentDto.categoryId);
        return { ok: false, error: 'Daraja ushbu kategoriya uchun emas' };
      }
      degree = level.name;
    }

    const purchase = await this.purchasesService.create(createPaymentDto, userId);
    if (!purchase?.id) {
      console.error('Xarid ID noto‘g‘ri:', createPaymentDto);
      return { ok: false, error: 'Xarid ID noto‘g‘ri' };
    }

    const payment = this.paymentRepository.create({
      amount: Number(category.price.toFixed(2)),
      transactionId: null,
      status: 'pending',
      user,
      purchaseId: purchase.id,
      purchase,
    });
    const savedPayment = await this.paymentRepository.save(payment);
    console.log('Payment created:', savedPayment);

    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    const merchantId = this.configService.get<string>('TOCHKA_MERCHANT_ID');
    const customerCode = this.configService.get<string>('TOCHKA_CUSTOMER_CODE');
    if (!token || !merchantId || !customerCode) {
      console.error('Tochka konfiguratsiyasi to‘liq emas:', { token, merchantId, customerCode });
      return { ok: false, error: 'Tochka konfiguratsiyasi to‘liq emas' };
    }

    try {
      const response = await axios.post(
        'https://enter.tochka.com/uapi/acquiring/v1.0/payments',
        {
          Data: {
            customerCode,
            amount: Number(category.price.toFixed(2)),
            purpose: `Курс: ${course.name}, Категория: ${category.name}, Уровень: ${degree}`,
            paymentMode: ['card'],
            saveCard: false,
            merchantId,
            preAuthorization: false,
            ttl: 10080,
            sourceName: 'A+ Academy',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const { paymentLink, operationId } = response.data.Data;
      savedPayment.transactionId = operationId;
      await this.paymentRepository.save(savedPayment);
      console.log('Payment updated with operationId:', operationId);

      return {
        ok: true,
        paymentUrl: paymentLink,
        paymentId: savedPayment.id,
        purchaseId: purchase.id,
        transactionId: operationId,
      };
    } catch (err) {
      console.error('Tochka API xatosi:', err.response?.data || err.message);
      return { ok: false, error: `Tochka API xatosi: ${err.response?.data?.message || err.message}` };
    }
  }

  async handleCallback(rawBody: any, contentType: string) {
    console.log('Handling webhook:', { rawBody, contentType });
    if (!rawBody) return { ok: true, error: 'Webhook tanasi bo‘sh' };

    const publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY')?.replace(/\\n/g, '\n');
    if (!publicKey) {
      console.error('Tochka public key topilmadi');
      return { ok: true, error: 'Tochka public key topilmadi' };
    }

    let decoded: any;
    if (contentType.includes('text/plain')) {
      try {
        decoded = jwt.verify(rawBody, publicKey, { algorithms: ['RS256'] });
        console.log('Webhook JWT decoded:', decoded);
      } catch (err) {
        console.error('Webhook JWT xatosi:', err.message);
        return { ok: true, error: `Webhook JWT xatosi: ${err.message}` };
      }
    } else if (contentType.includes('application/json')) {
      try {
        decoded = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
        console.log('Webhook JSON decoded:', decoded);
      } catch (err) {
        console.error('JSON parse xatosi:', err.message);
        return { ok: true, error: `JSON parse xatosi: ${err.message}` };
      }
    } else {
      console.warn('Noto‘g‘ri Content-Type:', contentType);
      return { ok: true, error: `Noto‘g‘ri Content-Type: ${contentType}` };
    }

    const operationId = decoded.operationId || decoded.Data?.operationId;
    if (!operationId) {
      console.error('operationId topilmadi:', decoded);
      return { ok: true, error: 'operationId topilmadi' };
    }

    const payment = await this.paymentRepository.findOne({
      where: { transactionId: operationId },
      relations: ['purchase'],
    });

    if (!payment) {
      console.error('Payment topilmadi:', operationId);
      return { ok: true, error: `Payment topilmadi: ${operationId}` };
    }

    const status = decoded.status || decoded.Data?.status;
    if (!status) {
      console.error('To‘lov statusi topilmadi:', decoded);
      return { ok: true, error: 'To‘lov statusi topilmadi' };
    }

    switch (status) {
      case 'APPROVED':
      case 'AUTHORIZED':
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
        console.log('To‘lov tasdiqlandi:', payment.id, status);
        break;
      default:
        console.warn('Qabul qilinmagan status:', status);
        return { ok: true, error: `Qabul qilinmagan status: ${status}` };
    }

    return { ok: true };
  }

  async checkPaymentStatus(requestId: string | null) {
    if (!requestId) {
      console.error('requestId null yoki topilmadi');
      return { ok: false, error: 'requestId null yoki topilmadi' };
    }

    console.log('Checking payment status for requestId:', requestId);
    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    if (!token) {
      console.error('Tochka JWT token topilmadi');
      return { ok: false, error: 'Tochka JWT token topilmadi' };
    }

    try {
      const response = await axios.get(
        `https://enter.tochka.com/uapi/acquiring/v1.0/payments/${requestId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      console.log('Tochka API response:', response.data);
      const status = response.data.Data?.Operation?.[0]?.status;
      if (!status) {
        console.error('Status topilmadi:', response.data);
        return { ok: false, error: 'Status topilmadi' };
      }
      return { ok: true, data: { status } };
    } catch (err) {
      console.error('Payment status xatosi:', err.response?.data || err.message);
      return { ok: false, error: `Payment status xatosi: ${err.response?.data?.message || err.message}` };
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollPendingPayments() {
    console.log('Polling pending payments at:', new Date().toISOString());
    const pendingPayments = await this.paymentRepository.find({ where: { status: 'pending' } });
    console.log('Pending payments found:', pendingPayments.length);

    for (const payment of pendingPayments) {
      console.log('Checking payment:', payment.transactionId);
      const result = await this.checkPaymentStatus(payment.transactionId);
      if (!result.ok) {
        console.error('Status check failed:', payment.transactionId, result.error);
        continue;
      }

      const status = result.data?.status;
      console.log('Payment status:', payment.transactionId, status);

      if (status === 'APPROVED' || status === 'AUTHORIZED') {
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
        console.log('Payment completed:', payment.transactionId);
      } else if (['DECLINED', 'EXPIRED', 'REFUNDED', 'REFUNDED_PARTIALLY'].includes(status)) {
        payment.status = 'failed';
        await this.paymentRepository.save(payment);
        console.log('Payment failed:', payment.transactionId);
      } else {
        console.log('Status unchanged (CREATED or other):', payment.transactionId, status);
      }
    }
  }
}