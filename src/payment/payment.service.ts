import { Injectable, NotFoundException, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
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

  async getAccessToken(): Promise<string> {
    const clientId = this.configService.get<string>('TOCHKA_CLIENT_ID');
    const clientSecret = this.configService.get<string>('TOCHKA_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      this.logger.error('TOCHKA_CLIENT_ID или TOCHKA_CLIENT_SECRET не найдены в .env');
      throw new BadRequestException('TOCHKA_CLIENT_ID или TOCHKA_CLIENT_SECRET не найдены');
    }

    try {
      const response = await axios.post(
        'https://enter.tochka.com/connect/token',
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'ReadSBPData EditSBPData ReadCustomerData ManageWebhookData',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      this.logger.log(`Получен новый Access Token Client: expires_in=${response.data.expires_in}`);
      return response.data.access_token;
    } catch (err) {
      this.logger.error(`Ошибка получения токена: ${err.message}`);
      throw new BadRequestException(`Ошибка получения токена: ${err.message}`);
    }
  }

  async startPayment(createPaymentDto: CreatePaymentDto, userId: number) {
    this.logger.log(`Начало платежа: userId=${userId}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`);

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
    this.logger.log(`Платёж создан: paymentId=${savedPayment.id}, transactionId=${transactionId}`);

    let token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    if (!token) {
      token = await this.getAccessToken(); // Получаем новый токен, если не найден в .env
    }

    const merchantId = this.configService.get<string>('TOCHKA_MERCHANT_ID');
    const accountId = this.configService.get<string>('TOCHKA_ACCOUNT_ID');

    if (!merchantId || !accountId) {
      this.logger.error('TOCHKA_MERCHANT_ID или TOCHKA_ACCOUNT_ID не найдены в .env');
      throw new BadRequestException('TOCHKA_MERCHANT_ID или TOCHKA_ACCOUNT_ID не найдены');
    }

    try {
      this.logger.log(`Отправка запроса на регистрацию QR-кода в Tochka API: https://enter.tochka.com/uapi/sbp/v1.0/qr-code/merchant/${merchantId}/${accountId}`);
      const qrResponse = await axios.post(
        `https://enter.tochka.com/uapi/sbp/v1.0/qr-code/merchant/${merchantId}/${accountId}`,
        {
          Data: {
            amount: category.price,
            currency: 'RUB',
            paymentPurpose: `Курс: ${course.name}, Категория: ${category.name}, Уровень: ${degree}`,
            qrcType: '02', // Динамический QR-код
            imageParams: {},
            sourceName: 'APlus Academy',
            ttl: 30, // 30 минут
            redirectUrl: 'https://aplusacademy.ru/success',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      ).catch(err => {
        const status = err.response?.status || 'unknown';
        const responseData = JSON.stringify(err.response?.data || {});
        this.logger.error(`Ошибка создания QR-кода: status=${status}, response=${responseData}, message=${err.message}`);
        if (status === 403) {
          throw new UnauthorizedException('Недостаточно прав токена: требуется разрешение EditSBPData. Проверьте документацию: https://enter.tochka.com/doc/v2/redoc');
        }
        if (status === 400) {
          throw new BadRequestException(`Неверный формат запроса: ${responseData}`);
        }
        throw new BadRequestException(`Ошибка создания QR-кода: ${err.message}, status=${status}`);
      });

      const qrData = qrResponse.data.Data;
      const paymentUrl = qrData.payload;
      const qrcId = qrData.qrcId;

      // Обновляем payment с qrcId как transactionId для отслеживания
      savedPayment.transactionId = qrcId;
      await this.paymentRepository.save(savedPayment);

      this.logger.log(`QR-код для платежа создан: paymentId=${savedPayment.id}, paymentUrl=${paymentUrl}, qrcId=${qrcId}`);
      return {
        paymentUrl,
        paymentId: savedPayment.id,
        purchaseId: purchase.id,
        transactionId: qrcId,
      };
    } catch (err) {
      this.logger.error(`Ошибка создания QR-кода: ${err.message}, status: ${err.response?.status || 'unknown'}, response: ${JSON.stringify(err.response?.data || {})}`);
      throw new BadRequestException(`Ошибка создания QR-кода: ${err.message}`);
    }
  }

  async handleCallback(callbackData: string) {
    this.logger.log(`Получен вебхук: ${callbackData}`);

    if (!callbackData) {
      this.logger.error('Параметр callbackData не предоставлен');
      throw new BadRequestException('Параметр callbackData не предоставлен');
    }

    const publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY');
    if (!publicKey) {
      this.logger.error('Публичный ключ Tochka не найден в файле .env');
      throw new BadRequestException('Публичный ключ Tochka не найден в файле .env');
    }

    let decoded: any;
    try {
      decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
      this.logger.log(`Вебхук JWT успешно проверен: event=${decoded.event}`);
    } catch (err) {
      this.logger.error(`Ошибка проверки вебхука JWT: ${err.message}`);
      throw new BadRequestException(`Ошибка проверки вебхука JWT: ${err.message}`);
    }

    const { event, data } = decoded;
    this.logger.log(`Событие вебхука: ${event}, данные: ${JSON.stringify(data)}`);

    // Для SBP QR-кода событие может быть 'qrCodePayment' или подобным; адаптируем под 'acquiringInternetPayment' или новое
    if (event === 'qrCodePayment' || event === 'acquiringInternetPayment') { // Предполагаем возможные события
      const payment = await this.paymentRepository.findOne({
        where: { transactionId: data.qrcId || data.operationId },
        relations: ['purchase', 'purchase.user', 'purchase.course', 'purchase.category'],
      });
      if (!payment) {
        this.logger.error(`Платёж не найден: qrcId/operationId=${data.qrcId || data.operationId}`);
        throw new NotFoundException('Платёж не найден');
      }

      this.logger.log(`Платёж найден: paymentId=${payment.id}, purchaseId=${payment.purchaseId}, purchase=${JSON.stringify(payment.purchase)}`);

      if (!payment.purchase) {
        this.logger.error(`Покупка не найдена: purchaseId=${payment.purchaseId}`);
        throw new NotFoundException(`Покупка не найдена: purchaseId=${payment.purchaseId}`);
      }

      if (data.status === 'Accepted' || data.status === 'Completed') { // Адаптируем под возможные статусы SBP
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
        this.logger.log(`Платёж подтверждён: paymentId=${payment.id}, purchaseId=${payment.purchaseId}`);
        return { status: 'OK' };
      } else if (['Rejected', 'DECLINED', 'CANCELLED', 'TIMEOUT', 'ERROR'].includes(data.status)) {
        payment.status = 'failed';
        await this.paymentRepository.save(payment);
        this.logger.log(`Платёж отклонён: paymentId=${payment.id}, status=${data.status}`);
        return { status: 'OK' };
      } else {
        this.logger.warn(`Неизвестный статус платежа: ${data.status}`);
        throw new BadRequestException(`Неизвестный статус платежа: ${data.status}`);
      }
    }

    this.logger.error(`Неизвестный тип события вебхука: ${event}`);
    throw new BadRequestException(`Неизвестный тип события вебхука: ${event}`);
  }
}