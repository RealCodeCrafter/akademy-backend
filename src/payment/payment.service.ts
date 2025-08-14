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
    const user = await this.usersService.findOne(userId);
    if (!user) return { ok: false, error: 'Foydalanuvchi topilmadi' };

    const course = await this.coursesService.findOne(createPaymentDto.courseId);
    if (!course) return { ok: false, error: 'Kurs topilmadi' };

    const category = await this.categoryService.findOne(createPaymentDto.categoryId);
    if (!category) return { ok: false, error: 'Kategoriya topilmadi' };

    if (!course.categories?.some((cat) => cat.id === category.id)) {
      return { ok: false, error: 'Kategoriya ushbu kursga tegishli emas' };
    }

    let degree = category.name;
    if (createPaymentDto.levelId) {
      const level = await this.levelService.findOne(createPaymentDto.levelId);
      if (!level) return { ok: false, error: 'Daraja topilmadi' };
      const isLinked = await this.categoryService.isLevelLinkedToCategory(
        createPaymentDto.categoryId,
        createPaymentDto.levelId,
      );
      if (!isLinked) return { ok: false, error: 'Daraja ushbu kategoriya uchun emas' };
      degree = level.name;
    }

    const purchase = await this.purchasesService.create(createPaymentDto, userId);
    if (!purchase?.id) return { ok: false, error: 'Xarid ID noto‘g‘ri' };

    const transactionId = `txn_${Date.now()}`;
    const payment = this.paymentRepository.create({
      amount: Number(category.price.toFixed(2)),
      transactionId,
      status: 'pending',
      user,
      purchaseId: purchase.id,
      purchase,
    });
    const savedPayment = await this.paymentRepository.save(payment);

    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    const merchantId = this.configService.get<string>('TOCHKA_MERCHANT_ID');
    const customerCode = this.configService.get<string>('TOCHKA_CUSTOMER_CODE');
    if (!token || !merchantId || !customerCode) {
      return { ok: false, error: 'Tochka konfiguratsiyasi to‘liq emas' };
    }

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

    return {
      ok: true,
      paymentUrl: paymentLink,
      paymentId: savedPayment.id,
      purchaseId: purchase.id,
      transactionId: operationId,
    };
  }

  async handleCallback(rawBody: any, contentType: string) {
    if (!rawBody) return { ok: true, error: 'Webhook tanasi bo‘sh' };

    const publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY')?.replace(/\\n/g, '\n');
    if (!publicKey) return { ok: true, error: 'Tochka public key topilmadi' };

    let decoded: any;
    if (contentType.includes('text/plain')) {
      try {
        decoded = jwt.verify(rawBody, publicKey, { algorithms: ['RS256'] });
      } catch (err) {
        return { ok: true, error: `Webhook JWT xatosi: ${err.message}` };
      }
    } else if (contentType.includes('application/json')) {
      try {
        decoded = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      } catch (err) {
        return { ok: true, error: `JSON parse xatosi: ${err.message}` };
      }
    } else {
      return { ok: true, error: `Noto‘g‘ri Content-Type: ${contentType}` };
    }

    const operationId = decoded.operationId || decoded.Data?.operationId;
    if (!operationId) return { ok: true, error: 'operationId topilmadi' };

    const payment = await this.paymentRepository.findOne({
      where: { transactionId: operationId },
      relations: ['purchase'],
    });

    if (!payment) return { ok: true, error: `Payment topilmadi: ${operationId}` };

    const status = decoded.status || decoded.Data?.status;
    if (!status) return { ok: true, error: 'To‘lov statusi topilmadi' };

    switch (status) {
      case 'APPROVED':
      case 'AUTHORIZED':
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
        break;
      default:
        return { ok: true, error: `Qabul qilinmagan status: ${status}` };
    }

    return { ok: true };
  }

  async checkPaymentStatus(requestId: string) {
    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    if (!token) return { ok: false, error: 'Tochka JWT token topilmadi' };

    try {
      const response = await axios.get(
        `https://enter.tochka.com/uapi/acquiring/v1.0/payments/${requestId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      return { ok: true, data: response.data.Data };
    } catch (err) {
      return { ok: false, error: `Payment status xatosi: ${err.response?.data?.message || err.message}` };
    }
    
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollPendingPayments() {
    const pendingPayments = await this.paymentRepository.find({ where: { status: 'pending' } });
    for (const payment of pendingPayments) {
      const result = await this.checkPaymentStatus(payment.transactionId);
      if (!result.ok) continue;

      const status = result.data.Operation[0]?.status;
      if (status === 'APPROVED' || status === 'AUTHORIZED') {
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
      } else if (['DECLINED', 'EXPIRED', 'REFUNDED', 'REFUNDED_PARTIALLY'].includes(status)) {
        payment.status = 'failed';
        await this.paymentRepository.save(payment);
      }
    }
  }
}