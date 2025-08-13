// payments.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    const course = await this.coursesService.findOne(createPaymentDto.courseId);
    if (!course) throw new NotFoundException('Kurs topilmadi');

    const category = await this.categoryService.findOne(createPaymentDto.categoryId);
    if (!category) throw new NotFoundException('Kategoriya topilmadi');

    if (!course.categories?.some((cat) => cat.id === category.id)) {
      throw new BadRequestException('Kategoriya ushbu kursga tegishli emas');
    }

    let degree = category.name;
    if (createPaymentDto.levelId) {
      const level = await this.levelService.findOne(createPaymentDto.levelId);
      if (!level) throw new NotFoundException('Daraja topilmadi');

      const isLinked = await this.categoryService.isLevelLinkedToCategory(
        createPaymentDto.categoryId,
        createPaymentDto.levelId,
      );
      if (!isLinked) {
        throw new BadRequestException('Daraja ushbu kategoriya uchun emas');
      }
      degree = level.name;
    }

    const purchase = await this.purchasesService.create(createPaymentDto, userId);
    if (!purchase?.id) throw new BadRequestException('Purchase ID noto‘g‘ri');

    const transactionId = `txn_${Date.now()}`;
    const payment = this.paymentRepository.create({
      amount: Number(Number(category.price).toFixed(2)),
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
      throw new BadRequestException('Tochka konfiguratsiyasi to‘liq emas');
    }

    try {
      const response = await axios.post(
        'https://enter.tochka.com/uapi/acquiring/v1.0/payments',
        {
          Data: {
            customerCode,
            amount: Number(Number(category.price).toFixed(2)),
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
      console.log(`[PaymentsService] Payment saved with operationId: ${operationId}`);

      return {
        paymentUrl: paymentLink,
        paymentId: savedPayment.id,
        purchaseId: purchase.id,
        transactionId: operationId,
      };
    } catch (err) {
      console.error(`[PaymentsService] Tochka API xatosi: ${err.response?.data || err.message}`);
      throw new BadRequestException(
        `Tochka API xatosi: ${err.response?.data || err.message}`,
      );
    }
  }
// payments.service.ts (faqat o‘zgargan qismlar)
async handleCallback(rawBody: string) {
  const publicKey = this.configService
    .get<string>('TOCHKA_PUBLIC_KEY')
    ?.replace(/\\n/g, '\n');

  if (!publicKey) {
    console.error('[PaymentsService] Tochka public key topilmadi');
    throw new BadRequestException('Tochka public key topilmadi');
  }

  if (!rawBody) {
    console.error('[PaymentsService] Webhook body bo‘sh');
    throw new BadRequestException('Webhook body bo‘sh');
  }

  let decoded: any;
  try {
    decoded = jwt.verify(rawBody, publicKey, { algorithms: ['RS256'] });
    console.log('[PaymentsService] Webhook decoded payload:', JSON.stringify(decoded, null, 2));
  } catch (err) {
    console.error('[PaymentsService] Webhook imzo xatosi:', err.message, 'Raw body:', rawBody);
    try {
      // JSON formatini tekshirish
      const parsed = JSON.parse(rawBody);
      console.warn('[PaymentsService] Webhook JWT emas, JSON formatida:', JSON.stringify(parsed, null, 2));
      return { status: 'ERROR', reason: 'Webhook is not a valid JWT' };
    } catch (jsonErr) {
      console.error('[PaymentsService] Webhook JSON sifatida ham noto‘g‘ri:', jsonErr.message);
      throw new BadRequestException('Webhook imzosi noto‘g‘ri yoki buzilgan');
    }
  }

  if (decoded.webhookType !== 'acquiringInternetPayment') {
    console.warn(`[PaymentsService] Noma’lum webhook turi: ${decoded.webhookType}`);
    return { status: 'IGNORED', reason: 'Unknown webhook type' };
  }

  const payment = await this.paymentRepository.findOne({
    where: { transactionId: decoded.operationId },
    relations: ['purchase'],
  });

  if (!payment) {
    console.error(`[PaymentsService] Payment topilmadi: operationId=${decoded.operationId}`);
    console.log(`[PaymentsService] Ma'lumotlar bazasidagi so'nggi operationId'lar:`, 
      await this.paymentRepository.find({ select: ['transactionId'], take: 5 }));
    return { status: 'ERROR', reason: 'Payment not found' };
  }

  switch (decoded.status) {
    case 'APPROVED':
      payment.status = 'completed';
      await this.paymentRepository.save(payment);
      await this.purchasesService.confirmPurchase(payment.purchaseId);
      console.log(`[PaymentsService] To‘lov tasdiqlandi: ${payment.id}`);
      break;

    case 'DECLINED':
    case 'REFUNDED':
    case 'EXPIRED':
    case 'REFUNDED_PARTIALLY':
      payment.status = 'failed';
      await this.paymentRepository.save(payment);
      console.log(`[PaymentsService] To‘lov muvaffaqiyatsiz: ${payment.id} (status=${decoded.status})`);
      break;

    default:
      console.warn(`[PaymentsService] Noma’lum to‘lov statusi: ${decoded.status}`);
      break;
  }

  return { status: 'OK' };
}

async checkPaymentStatus(requestId: string) {
  const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
  if (!token) {
    console.error('[PaymentsService] Tochka JWT token topilmadi');
    throw new BadRequestException('Tochka JWT token topilmadi');
  }

  try {
    const response = await axios.get(
      `https://enter.tochka.com/uapi/payment/v1.0/status/${requestId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    console.log(`[PaymentsService] Payment status response for requestId=${requestId}: ${JSON.stringify(response.data, null, 2)}`);
    return response.data.Data;
  } catch (err) {
    const errorMessage = err.response?.data
      ? JSON.stringify(err.response.data, null, 2)
      : err.message;
    console.error(`[PaymentsService] Payment status xatosi for requestId=${requestId}: ${errorMessage}`);
    throw new BadRequestException(`Payment status xatosi: ${errorMessage}`);
  }
}
}