import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
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
    this.logger.log(`StartPayment chaqirildi: userId=${userId}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`);

    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('Пользователь не найден');

    const course = await this.coursesService.findOne(createPaymentDto.courseId);
    if (!course) throw new NotFoundException('Курс не найден');

    const category = await this.categoryService.findOne(createPaymentDto.categoryId);
    if (!category) throw new NotFoundException('Категория не найдена');

    const isCategoryLinked = course.categories?.some(cat => cat.id === category.id);
    if (!isCategoryLinked) throw new NotFoundException('Эта категория не относится к данному курсу');

    let degree: string;
    if (createPaymentDto.levelId) {
      const level = await this.levelService.findOne(createPaymentDto.levelId);
      if (!level) throw new NotFoundException('Уровень не найден');

      const isLevelLinked = await this.categoryService.isLevelLinkedToCategory(createPaymentDto.categoryId, createPaymentDto.levelId);
      if (!isLevelLinked) throw new BadRequestException('Этот уровень не относится к данной категории');

      degree = level.name;
    } else {
      degree = category.name;
    }

    const purchase = await this.purchasesService.create(createPaymentDto, userId);

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

    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    if (!token) throw new BadRequestException('TOCHKA_JWT_TOKEN не найден в конфигурации');

    const merchantId = this.configService.get<string>('TOCHKA_MERCHANT_ID');

    try {
      this.logger.log(`Bankga so'rov yuborilmoqda... amount=${category.price}, purpose=${course.name} / ${category.name} / ${degree}`);

      const response = await axios.post(
        `https://enter.tochka.com/uapi/acquiring/v1.0/payments`,
        {
          Data: {
            customerCode: this.configService.get<string>('TOCHKA_CUSTOMER_CODE') || '305149818',
            amount: category.price.toFixed(2),
            purpose: `Курс: ${course.name}, Категория: ${category.name}, Уровень: ${degree}`,
            redirectUrl: 'https://aplusacademy.ru/payment-success',
            failRedirectUrl: 'https://aplusacademy.ru/payment-failed',
            paymentMode: ['card'],
            saveCard: false,
            merchantId,
            preAuthorization: false,
            ttl: 10080,
            sourceName: 'A+ Academy'
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      this.logger.debug(`Bank javobi: ${JSON.stringify(response.data, null, 2)}`);

      const data = response.data.Data;
      const paymentUrl = data.paymentLink;
      const operationId = data.operationId;

      savedPayment.transactionId = operationId;
      await this.paymentRepository.save(savedPayment);

      return {
        paymentUrl,
        paymentId: savedPayment.id,
        purchaseId: purchase.id,
        transactionId: operationId,
      };
    } catch (err) {
      this.logger.error(`Bank so'rov xatosi: ${err.message}`);
      this.logger.error(`Bank xato javobi: ${JSON.stringify(err.response?.data || {}, null, 2)}`);

      const status = err.response?.status || 'unknown';
      const responseData = JSON.stringify(err.response?.data || {});

      if (status === 403) throw new UnauthorizedException('Недостаточно прав токена');
      if (status === 400) throw new BadRequestException(`Неверный формат запроса: ${responseData}`);
      if (status === 424) throw new BadRequestException(`Ошибка зависимости API: ${responseData}`);

      throw new BadRequestException(`Ошибка создания платежа: ${err.message}, статус: ${status}, данные: ${responseData}`);
    }
  }

  async handleCallback(callbackData: string) {
    this.logger.log(`Webhook chaqirildi. callbackData (JWT) => ${callbackData}`);

    if (!callbackData) throw new BadRequestException('Параметр callbackData не предоставлен');

    const publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY');
    if (!publicKey) throw new BadRequestException('Публичный ключ Tochka не найден');

    let decoded: any;
    try {
      decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
      this.logger.debug(`Dekodlangan webhook ma'lumotlari: ${JSON.stringify(decoded, null, 2)}`);
    } catch (err) {
      this.logger.error(`Webhook JWT xato: ${err.message}`);
      throw new BadRequestException(`Ошибка проверки вебхука: ${err.message}`);
    }

    const { event, data } = decoded;

    if (event === 'acquiringInternetPayment') {
      this.logger.log(`To'lov status tekshirilmoqda: operationId=${data.operationId}, status=${data.status}`);

      const payment = await this.paymentRepository.findOne({
        where: { transactionId: data.operationId },
        relations: ['purchase', 'purchase.user', 'purchase.course', 'purchase.category'],
      });

      if (!payment) {
        this.logger.warn(`Webhook: Payment topilmadi (operationId=${data.operationId})`);
        throw new NotFoundException('Платёж не найден');
      }

      if (!payment.purchase) throw new NotFoundException('Покупка не найдена');

      if (data.status === 'APPROVED') {
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
        this.logger.log(`To'lov muvaffaqiyatli yakunlandi: paymentId=${payment.id}`);
        return { status: 'OK' };
      } else if (['REFUNDED', 'EXPIRED', 'REFUNDED_PARTIALLY'].includes(data.status)) {
        payment.status = 'failed';
        await this.paymentRepository.save(payment);
        this.logger.warn(`To'lov bekor qilindi yoki muddati o'tdi: paymentId=${payment.id}, status=${data.status}`);
        return { status: 'OK' };
      } else {
        this.logger.error(`Webhook: Noma'lum status qabul qilindi: ${data.status}`);
        throw new BadRequestException(`Неизвестный статус: ${data.status}`);
      }
    }

    throw new BadRequestException(`Неизвестный тип события: ${event}`);
  }
}
