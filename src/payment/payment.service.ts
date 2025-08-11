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
    this.logger.log(`Запуск оплаты: userId=${userId}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`);

    const user = await this.usersService.findOne(userId);
    if (!user) {
      this.logger.error(`Пользователь не найден: userId=${userId}`);
      throw new NotFoundException('Пользователь не найден');
    }

    const course = await this.coursesService.findOne(createPaymentDto.courseId);
    if (!course) {
      this.logger.error(`Курс не найден: courseId=${createPaymentDto.courseId}`);
      throw new NotFoundException('Курс не найден');
    }

    const category = await this.categoryService.findOne(createPaymentDto.categoryId);
    if (!category) {
      this.logger.error(`Категория не найдена: categoryId=${createPaymentDto.categoryId}`);
      throw new NotFoundException('Категория не найдена');
    }

    const isCategoryLinked = course.categories?.some(cat => cat.id === category.id);
    if (!isCategoryLinked) {
      this.logger.error(`Эта категория не относится к данному курсу: courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}`);
      throw new NotFoundException('Эта категория не относится к данному курсу');
    }

    let degree: string;
    if (createPaymentDto.levelId) {
      const level = await this.levelService.findOne(createPaymentDto.levelId);
      if (!level) {
        this.logger.error(`Уровень не найден: levelId=${createPaymentDto.levelId}`);
        throw new NotFoundException('Уровень не найден');
      }
      const isLevelLinked = await this.categoryService.isLevelLinkedToCategory(createPaymentDto.categoryId, createPaymentDto.levelId);
      if (!isLevelLinked) {
        this.logger.error(`Этот уровень не относится к данной категории: categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`);
        throw new BadRequestException('Этот уровень не относится к данной категории');
      }
      degree = level.name;
    } else {
      degree = category.name;
    }

    const purchase = await this.purchasesService.create(createPaymentDto, userId);
    this.logger.log(`Покупка создана: purchaseId=${purchase.id}`);

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
    this.logger.log(`Платеж создан: paymentId=${savedPayment.id}, transactionId=${transactionId}`);

    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    const customerCode = this.configService.get<string>('TOCHKA_CUSTOMER_CODE');
    const clientId = this.configService.get<string>('TOCHKA_CLIENT_ID');

    if (!token || !customerCode || !clientId) {
      this.logger.error(`Отсутствуют настройки Tochka: token=${!!token}, customerCode=${customerCode}, clientId=${clientId}`);
      throw new BadRequestException('Не найдены Tochka JWT token, customerCode или clientId');
    }

    try {
      const tochkaApiUrl = this.configService.get<string>('TOCHKA_PAYMENTS_URL');
      if (!tochkaApiUrl) {
  this.logger.error('TOCHKA_PAYMENTS_URL .env faylida topilmadi');
  throw new BadRequestException('TOCHKA_PAYMENTS_URL не задан в конфигурации');
}
this.logger.log(`Отправка запроса в Tochka API: ${tochkaApiUrl}`);
const paymentResponse = await axios.post(
  tochkaApiUrl,
  {
    amount: category.price,
    currency: 'RUB',
    customerCode,
    clientId,
    description: `Курс: ${course.name}, Категория: ${category.name}, Уровень: ${degree}`,
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

      const paymentUrl = paymentResponse.data.Data?.paymentLink || paymentResponse.data.Data?.qrUrl || paymentResponse.data.paymentLink;
      this.logger.log(`Ссылка на оплату получена: paymentId=${savedPayment.id}, paymentUrl=${paymentUrl}`);
      return {
        paymentUrl,
        paymentId: savedPayment.id,
        purchaseId: purchase.id,
        transactionId,
      };
    } catch (err) {
      const status = err.response?.status || 'unknown';
      const responseData = JSON.stringify(err.response?.data || {});
      this.logger.error(`Ошибка при получении ссылки на оплату: status=${status}, response=${responseData}, message=${err.message}`);
      throw new BadRequestException(`Ошибка при получении ссылки на оплату: ${err.message}, status=${status}, response=${responseData}`);
    }
  }

  async handleCallback(callbackData: string) {
    this.logger.log(`Webhook получен: ${callbackData}`);

    if (!callbackData) {
      this.logger.error('Параметр callbackData не передан');
      throw new BadRequestException('Параметр callbackData не передан');
    }

    const publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY');
    if (!publicKey) {
      this.logger.error('Публичный ключ Tochka не найден в .env файле');
      throw new BadRequestException('Публичный ключ Tochka не найден в .env файле');
    }

    let decoded: any;
    try {
      decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
      this.logger.log(`JWT Webhook успешно проверен: event=${decoded.event}`);
    } catch (err) {
      this.logger.error(`Ошибка проверки JWT Webhook: ${err.message}`);
      throw new BadRequestException(`Ошибка проверки JWT Webhook: ${err.message}`);
    }

    const { event, data } = decoded;
    this.logger.log(`Webhook событие: ${event}, данные: ${JSON.stringify(data)}`);

    if (event === 'acquiringInternetPayment') {
      const payment = await this.paymentRepository.findOne({
        where: { transactionId: data.operationId },
        relations: ['purchase', 'purchase.user', 'purchase.course', 'purchase.category'],
      });
      if (!payment) {
        this.logger.error(`Платеж не найден: operationId=${data.operationId}`);
        throw new NotFoundException('Платеж не найден');
      }

      this.logger.log(`Платеж найден: paymentId=${payment.id}, purchaseId=${payment.purchaseId}`);

      if (!payment.purchase) {
        this.logger.error(`Покупка не найдена: purchaseId=${payment.purchaseId}`);
        throw new NotFoundException(`Покупка не найдена: purchaseId=${payment.purchaseId}`);
      }

      if (data.status === 'Accepted') {
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
        this.logger.log(`Оплата подтверждена: paymentId=${payment.id}, purchaseId=${payment.purchaseId}`);
        return { status: 'OK' };
      } else if (['Rejected', 'DECLINED', 'CANCELLED', 'TIMEOUT', 'ERROR'].includes(data.status)) {
        payment.status = 'failed';
        await this.paymentRepository.save(payment);
        this.logger.log(`Оплата отклонена: paymentId=${payment.id}, status=${data.status}`);
        return { status: 'OK' };
      } else {
        this.logger.warn(`Неизвестный статус оплаты: ${data.status}`);
        throw new BadRequestException(`Неизвестный статус оплаты: ${data.status}`);
      }
    }

    this.logger.error(`Неизвестный тип события Webhook: ${event}`);
    throw new BadRequestException(`Неизвестный тип события Webhook: ${event}`);
  }
}
