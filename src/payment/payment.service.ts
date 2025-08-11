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
  private readonly baseUrl = 'https://enter.tochka.com/uapi';
  private readonly apiVersion = 'v1.0';

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
    this.logger.log(`Старт платежа: userId=${userId}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`);

    // Kurs, category va level tekshiruvlari (o'zgarmaydi)
    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('Пользователь не найден');

    const course = await this.coursesService.findOne(createPaymentDto.courseId);
    if (!course) throw new NotFoundException('Курс не найден');

    const category = await this.categoryService.findOne(createPaymentDto.categoryId);
    if (!category) throw new NotFoundException('Категория не найдена');

    const isCategoryLinked = course.categories?.some(cat => cat.id === category.id);
    if (!isCategoryLinked) throw new BadRequestException('Категория не связана с курсом');

    let degree: string;
    if (createPaymentDto.levelId) {
      const level = await this.levelService.findOne(createPaymentDto.levelId);
      if (!level) throw new NotFoundException('Уровень не найден');
      const isLevelLinked = await this.categoryService.isLevelLinkedToCategory(createPaymentDto.categoryId, createPaymentDto.levelId);
      if (!isLevelLinked) throw new BadRequestException('Уровень не связан с категорией');
      degree = level.name;
    } else {
      degree = category.name;
    }

    // Purchase va Payment yaratish
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

    // Faqat JWT va clientId olamiz, merchantId va accountId yo'q!
    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    const clientId = this.configService.get<string>('TOCHKA_CLIENT_ID');
    const redirectUrl = this.configService.get<string>('TOCHKA_REDIRECT_URL') || 'https://a-plus-academy.com/success';

    if (!token || !clientId) throw new InternalServerErrorException('JWT токен или clientId не найдены');

    // Bank API endpoint (merchantId va accountId holda)
    // Sizning bank API docs ga qarab endpointni shunday sozlash kerak, 
    // misol uchun to‘g‘ri url mana bunday bo‘lishi mumkin (agar bank ruxsat bersa):
    const url = `${this.baseUrl}/sbp/${this.apiVersion}/qr-code/client/${clientId}`;

    const body = {
      Data: {
        amount: category.price,
        currency: 'RUB',
        paymentPurpose: `Оплата курса: ${course.name}, категория: ${category.name}, уровень: ${degree}`,
        qrcType: '02',
        imageParams: { width: 300, height: 300 },
        sourceName: 'A+ Academy',
        ttl: 4320,
        redirectUrl,
      },
    };

    try {
      const response = await axios.post(url, body, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });

      if (![200, 201].includes(response.status)) {
        throw new BadRequestException(`Ошибка банка: ${JSON.stringify(response.data)}`);
      }

      const paymentUrl = response.data?.Data?.payload;
      const qrcId = response.data?.Data?.qrcId;

      if (!paymentUrl || !qrcId) throw new BadRequestException('Ссылка или qrcId не получены');

      savedPayment.transactionId = qrcId;
      await this.paymentRepository.save(savedPayment);

      return {
        paymentUrl,
        paymentId: savedPayment.id,
        purchaseId: purchase.id,
        transactionId: qrcId,
      };
    } catch (err) {
      this.logger.error(`Ошибка создания платежа: ${err.message}`);
      throw new BadRequestException(`Ошибка создания платежа: ${err.message}`);
    }
  }

  // To‘lov holatini tekshirish
  async getPaymentStatus(paymentId: number) {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Платеж не найден');
    return {
      status: payment.status,
      transactionId: payment.transactionId,
      amount: payment.amount,
    };
  }

  // Webhook callback
  async handleCallback(callbackData: string) {
    this.logger.log('Webhook получен');

    const publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY');
    if (!publicKey) throw new InternalServerErrorException('Публичный ключ не найден');

    let decoded: any;
    try {
      decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
    } catch (err) {
      throw new BadRequestException(`Ошибка верификации webhook: ${err.message}`);
    }

    const { event, data } = decoded;
    if (!event || !data || (event !== 'incomingSbpPayment' && event !== 'incomingSbpB2BPayment')) {
      return { status: 'OK' };
    }

    const qrcId = data.qrcId;
    const bankAmount = data.amount || 0;
    const bankStatus = data.status || '';

    const payment = await this.paymentRepository.findOne({ where: { transactionId: qrcId } });
    if (!payment) throw new NotFoundException('Платеж не найден');

    if (bankAmount !== payment.amount) {
      payment.status = 'failed';
      await this.paymentRepository.save(payment);
      this.logger.warn(`Фейковый платеж: суммы не совпадают, qrcId=${qrcId}`);
      return { status: 'OK' };
    }

    if (bankStatus === 'Accepted') {
      payment.status = 'completed';
      await this.paymentRepository.save(payment);
      await this.purchasesService.confirmPurchase(payment.purchaseId);
      this.logger.log(`Реальный платеж подтвержден: paymentId=${payment.id}`);
    } else if (['Rejected', 'Error'].includes(bankStatus)) {
      payment.status = 'failed';
      await this.paymentRepository.save(payment);
      this.logger.log(`Платеж отклонен: paymentId=${payment.id}`);
    }

    return { status: 'OK' };
  }
}
