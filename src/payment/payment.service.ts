

import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
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
  if (!user) throw new NotFoundException('Пользователь не найден');

  const course = await this.coursesService.findOne(createPaymentDto.courseId);
  if (!course) throw new NotFoundException('Курс не найден');

  const category = await this.categoryService.findOne(createPaymentDto.categoryId);
  if (!category) throw new NotFoundException('Категория не найдена');

  if (!course.categories?.some(cat => cat.id === category.id)) {
    throw new BadRequestException('Эта категория не относится к данному курсу');
  }

  let degree = category.name;
  if (createPaymentDto.levelId) {
    const level = await this.levelService.findOne(createPaymentDto.levelId);
    if (!level) throw new NotFoundException('Уровень не найден');

    const isLinked = await this.categoryService.isLevelLinkedToCategory(
      createPaymentDto.categoryId,
      createPaymentDto.levelId
    );
    if (!isLinked) {
      throw new BadRequestException('Этот уровень не относится к данной категории');
    }
    degree = level.name;
  }

  // Purchase yozish
  const purchase = await this.purchasesService.create(createPaymentDto, userId);
  if (!purchase?.id || isNaN(Number(purchase.id))) {
    throw new BadRequestException('Purchase ID noto‘g‘ri');
  }

  const transactionId = `txn_${Date.now()}`;
  const payment = this.paymentRepository.create({
    amount: Number(category.price),
    transactionId,
    status: 'pending',
    user,
    purchaseId: Number(purchase.id),
    purchase,
  });
  const savedPayment = await this.paymentRepository.save(payment);

  const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
  const merchantId = this.configService.get<string>('TOCHKA_MERCHANT_ID');
  const customerCode = this.configService.get<string>('TOCHKA_CUSTOMER_CODE');

  if (!token || !merchantId || !customerCode) {
    throw new BadRequestException('Конфигурация Tochka неполная');
  }

  try {
    const response = await axios.post(
      `https://enter.tochka.com/uapi/acquiring/v1.0/payments`,
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
          sourceName: 'A+ Academy'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      }
    );

    const { paymentLink, operationId } = response.data.Data;
    savedPayment.transactionId = operationId;
    await this.paymentRepository.save(savedPayment);

    return {
      paymentUrl: paymentLink,
      paymentId: savedPayment.id,
      purchaseId: purchase.id,
      transactionId: operationId,
    };
  } catch (err) {
    console.error('Tochka API Error:', err.response?.data || err.message);
    throw new BadRequestException(`Ошибка Tochka API: ${err.message}`);
  }
}

async handleCallback(callbackData: string) {
  if (!callbackData) {
    throw new BadRequestException('callbackData не предоставлен');
  }

  const publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY')?.replace(/\\n/g, '\n');
  if (!publicKey) {
    throw new BadRequestException('Публичный ключ Tochka не найден');
  }

  let decoded: any;
  try {
    decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
  } catch (err) {
    console.error('JWT verification error:', err);
    throw new BadRequestException('Неверная подпись вебхука');
  }

  const { event, data } = decoded;
  console.log('Webhook event:', event, data);

  if (event === 'acquiringInternetPayment') {
    const payment = await this.paymentRepository.findOne({
      where: { transactionId: data.operationId },
      relations: ['purchase'],
    });

    if (!payment) throw new NotFoundException('Платеж не найден');
    if (!payment.purchaseId || isNaN(Number(payment.purchaseId))) {
      throw new BadRequestException('Purchase ID callback’da noto‘g‘ri');
    }

    if (data.status === 'APPROVED') {
      payment.status = 'completed';
      await this.paymentRepository.save(payment);
      await this.purchasesService.confirmPurchase(Number(payment.purchaseId));
    } else if (['REFUNDED', 'EXPIRED', 'REFUNDED_PARTIALLY'].includes(data.status)) {
      payment.status = 'failed';
      await this.paymentRepository.save(payment);
    } else {
      console.warn('Неизвестный статус платежа:', data.status);
    }
    return { status: 'OK' };
  }

  throw new BadRequestException(`Неизвестный тип события: ${event}`);
}

}
