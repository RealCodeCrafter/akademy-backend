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
  private readonly baseUrl = 'https://enter.tochka.com/uapi'; // Базовый URL API
  private readonly apiVersion = 'v1.0'; // Версия API
  private readonly consentsUrl = `${this.baseUrl}/consent/${this.apiVersion}/consents`; // URL для consents

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

  // Получение consents для проверки разрешений
  private async fetchConsents(token: string) {
    try {
      const res = await axios.get(this.consentsUrl, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      return res.data?.Data?.Consent || [];
    } catch (err) {
      this.logger.error(`Ошибка получения consents: ${err?.message || err}`);
      return [];
    }
  }

  // Поиск подходящего consent по clientId
  private findBestConsent(consents: any[], clientId: string) {
    if (!consents || consents.length === 0) return null;
    const found = consents.find(c => c.clientId === clientId);
    return found || consents[0];
  }

  // Проверка разрешений для SBP (используем только JWT и clientId)
  private async ensureSbpPermission(token: string, clientId: string, desiredPermissions: string[] = ['EditSBPData', 'ReadSBPData']) {
    const consents = await this.fetchConsents(token);
    if (!consents || consents.length === 0) {
      throw new BadRequestException('Consents не найдены для токена. Обратитесь к администратору сайта.');
    }

    const consent = this.findBestConsent(consents, clientId);
    if (!consent) {
      throw new BadRequestException('Подходящий consent не найден для clientId. Проверьте настройки.');
    }

    const permissions: string[] = consent.permissions || [];
    const missing = desiredPermissions.filter(p => !permissions.includes(p));
    if (missing.length > 0) {
      throw new BadRequestException(`Отсутствуют разрешения: ${missing.join(', ')}. Обратитесь к администратору.`);
    }

    return consent;
  }

  // Инициация платежа: создаем динамический QR-код, возвращаем ссылку для фронта
  async startPayment(createPaymentDto: CreatePaymentDto, userId: number) {
    this.logger.log(`Старт платежа: userId=${userId}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`);

    // Валидация сущностей
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

    // Создание покупки и платежа
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

    // Конфигурация (только JWT и clientId, merchantId/accountId из consent или env, но предполагаем в env)
    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    const clientId = this.configService.get<string>('TOCHKA_CLIENT_ID');
    const merchantId = this.configService.get<string>('TOCHKA_MERCHANT_ID'); // Должен быть в env после регистрации
    const accountId = this.configService.get<string>('TOCHKA_ACCOUNT_ID'); // Должен быть в env
    const redirectUrl = this.configService.get<string>('TOCHKA_REDIRECT_URL') || 'https://a-plus-academy.com/success';

    if (!token || !clientId) throw new InternalServerErrorException('JWT токен или clientId не найдены');
    if (!merchantId || !accountId) throw new InternalServerErrorException('merchantId или accountId не настроены');

    // Проверка разрешений
    await this.ensureSbpPermission(token, clientId);

    // Запрос на создание динамического QR-кода
    const amount = category.price;
    const body = {
      Data: {
        amount,
        currency: 'RUB',
        paymentPurpose: `Оплата курса: ${course.name}, категория: ${category.name}, уровень: ${degree}`,
        qrcType: '02', // Динамический QR для одноразового платежа
        imageParams: { width: 300, height: 300 },
        sourceName: 'A+ Academy',
        ttl: 4320, // 72 часа
        redirectUrl,
      },
    };

    const url = `${this.baseUrl}/sbp/${this.apiVersion}/qr-code/merchant/${merchantId}/${accountId}`;

    try {
      const response = await axios.post(url, body, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });

      if (response.status !== 200 && response.status !== 201) {
        throw new BadRequestException(`Ошибка банка: ${JSON.stringify(response.data)}`);
      }

      const paymentUrl = response.data?.Data?.payload;
      const qrcId = response.data?.Data?.qrcId;

      if (!paymentUrl || !qrcId) throw new BadRequestException('Ссылка или qrcId не получены');

      // Обновляем transactionId на qrcId
      savedPayment.transactionId = qrcId;
      await this.paymentRepository.save(savedPayment);

      // Возвращаем ссылку фронту для редиректа
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

  // Обработка webhook: проверяем сумму, если не совпадает - failed (чтобы убрать фейковые)
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
      return { status: 'OK' }; // Игнорируем нерелевантные события
    }

    const qrcId = data.qrcId;
    const bankAmount = data.amount || 0;
    const bankStatus = data.status || '';

    const payment = await this.paymentRepository.findOne({ where: { transactionId: qrcId } });
    if (!payment) throw new NotFoundException('Платеж не найден');

    // Проверка суммы: если не совпадает - фейковый, пометить failed
    if (bankAmount !== payment.amount) {
      payment.status = 'failed';
      await this.paymentRepository.save(payment);
      this.logger.warn(`Фейковый платеж: суммы не совпадают, qrcId=${qrcId}`);
      return { status: 'OK' };
    }

    // Обработка статуса (только один реальный платеж)
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