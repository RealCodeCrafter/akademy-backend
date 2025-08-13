

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
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const course = await this.coursesService.findOne(createPaymentDto.courseId);
    if (!course) {
      throw new NotFoundException('Курс не найден');
    }

    const category = await this.categoryService.findOne(createPaymentDto.categoryId);
    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }

    const isCategoryLinked = course.categories?.some(cat => cat.id === category.id);
    if (!isCategoryLinked) {
      throw new NotFoundException('Эта категория не относится к данному курсу');
    }

    let degree: string;
    if (createPaymentDto.levelId) {
      const level = await this.levelService.findOne(createPaymentDto.levelId);
      if (!level) {
        throw new NotFoundException('Уровень не найден');
      }
      const isLevelLinked = await this.categoryService.isLevelLinkedToCategory(createPaymentDto.categoryId, createPaymentDto.levelId);
      if (!isLevelLinked) {
        throw new BadRequestException('Этот уровень не относится к данной категории');
      }
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
    if (!token) {
      throw new BadRequestException('TOCHKA_JWT_TOKEN не найден в конфигурации');
    }

    const merchantId = this.configService.get<string>('TOCHKA_MERCHANT_ID')
    try {
      const response = await axios.post(
        `https://enter.tochka.com/uapi/acquiring/v1.0/payments`,
        {
          Data: {
            customerCode: this.configService.get<string>('TOCHKA_CUSTOMER_CODE') || '305149818',
            amount: category.price.toFixed(2),
            purpose: `Курс: ${course.name}, Категория: ${category.name}, Уровень: ${degree}`,
            paymentMode: ['card'],
            saveCard: false,
            merchantId: merchantId,
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
      const status = err.response?.status || 'unknown';
      const responseData = JSON.stringify(err.response?.data || {});
      if (status === 403) {
        throw new UnauthorizedException('Недостаточно прав токена');
      }
      if (status === 400) {
        throw new BadRequestException(`Неверный формат запроса: ${responseData}`);
      }
      if (status === 424) {
        throw new BadRequestException(`Ошибка зависимости API: ${responseData}`);
      }
      throw new BadRequestException(`Ошибка создания платежа: ${err.message}, статус: ${status}, данные: ${responseData}`);
    }
  }

  async handleCallback(callbackData: string) {
    if (!callbackData) {
      throw new BadRequestException('Параметр callbackData не предоставлен');
    }

    const publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY');
    if (!publicKey) {
      throw new BadRequestException('Публичный ключ Tochka не найден');
    }

    let decoded: any;
    try {
      decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
    } catch (err) {
      throw new BadRequestException(`Ошибка проверки вебхука: ${err.message}`);
    }

    const { event, data } = decoded;

    if (event === 'acquiringInternetPayment') {
      const payment = await this.paymentRepository.findOne({
        where: { transactionId: data.operationId },
        relations: ['purchase', 'purchase.user', 'purchase.course', 'purchase.category'],
      });
      if (!payment) {
        throw new NotFoundException('Платёж не найден');
      }

      if (!payment.purchase) {
        throw new NotFoundException('Покупка не найдена');
      }

      if (data.status === 'APPROVED') {
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
        return { status: 'OK' };
      } else if (['REFUNDED', 'EXPIRED', 'REFUNDED_PARTIALLY'].includes(data.status)) {
        payment.status = 'failed';
        await this.paymentRepository.save(payment);
        return { status: 'OK' };
      } else {
        throw new BadRequestException(`Неизвестный статус: ${data.status}`);
      }
    }

    throw new BadRequestException(`Неизвестный тип события: ${event}`);
  }
}



// import {
//   Injectable,
//   NotFoundException,
//   BadRequestException,
//   UnauthorizedException,
//   Logger,
// } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import axios, { AxiosError } from 'axios';
// import * as jwt from 'jsonwebtoken';

// import { Payment } from './entities/payment.entity';
// import { CreatePaymentDto } from './dto/create-payment.dto';
// import { UsersService } from '../user/user.service';
// import { CoursesService } from '../course/course.service';
// import { CategoryService } from '../category/category.service';
// import { PurchasesService } from '../purchases/purchases.service';
// import { LevelService } from '../level/level.service';
// import { ConfigService } from '@nestjs/config';

// @Injectable()
// export class PaymentsService {
//   private readonly logger = new Logger(PaymentsService.name);

//   constructor(
//     @InjectRepository(Payment)
//     private paymentRepository: Repository<Payment>,
//     private usersService: UsersService,
//     private coursesService: CoursesService,
//     private categoryService: CategoryService,
//     private purchasesService: PurchasesService,
//     private levelService: LevelService,
//     private configService: ConfigService,
//   ) {}

//   private tochkaBase = 'https://enter.tochka.com/uapi/acquiring/v1.0';

//   private buildHeaders() {
//     const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
//     if (!token) {
//       throw new BadRequestException('TOCHKA_JWT_TOKEN topilmadi (env).');
//     }
//     return {
//       Authorization: `Bearer ${token}`,
//       'Content-Type': 'application/json',
//     };
//   }

//   /**
//    * To'lovni boshlash – bankdan paymentLink olamiz va frontendga qaytaramiz
//    */
//   async startPayment(createPaymentDto: CreatePaymentDto, userId: number) {
//     this.logger.log(
//       `StartPayment: userId=${userId}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`,
//     );

//     const user = await this.usersService.findOne(userId);
//     if (!user) throw new NotFoundException('Пользователь не найден');

//     const course = await this.coursesService.findOne(createPaymentDto.courseId);
//     if (!course) throw new NotFoundException('Курс не найден');

//     const category = await this.categoryService.findOne(createPaymentDto.categoryId);
//     if (!category) throw new NotFoundException('Категория не найдена');

//     const isCategoryLinked = course.categories?.some((c) => c.id === category.id);
//     if (!isCategoryLinked) {
//       throw new NotFoundException('Эта категория не относится к данному курсу');
//     }

//     let degree = category.name;
//     if (createPaymentDto.levelId) {
//       const level = await this.levelService.findOne(createPaymentDto.levelId);
//       if (!level) throw new NotFoundException('Уровень не найден');
//       const ok = await this.categoryService.isLevelLinkedToCategory(
//         createPaymentDto.categoryId,
//         createPaymentDto.levelId,
//       );
//       if (!ok) throw new BadRequestException('Этот уровень не относится к данной категории');
//       degree = level.name;
//     }

//     // Purchase yaratamiz
//     const purchase = await this.purchasesService.create(createPaymentDto, userId);

//     // DB: pending payment
//     const tempTxnId = `txn_${Date.now()}`;
//     const savedPayment = await this.paymentRepository.save(
//       this.paymentRepository.create({
//         amount: category.price,
//         transactionId: tempTxnId,
//         status: 'pending',
//         user,
//         purchaseId: purchase.id,
//         purchase,
//       }),
//     );

//     const redirectUrl = this.configService.get<string>('TOCHKA_REDIRECT_URL') || 'https://aplusacademy.ru/payment-success';
//     const failRedirectUrl =
//       this.configService.get<string>('TOCHKA_FAIL_REDIRECT_URL') || 'https://aplusacademy.ru/payment-failed';

//     const payload = {
//       Data: {
//         customerCode: this.configService.get<string>('TOCHKA_CUSTOMER_CODE'),
//         amount: Number(category.price).toFixed(2),
//         purpose: `Курс: ${course.name}, Категория: ${category.name}, Уровень: ${degree}`,
//         redirectUrl,
//         failRedirectUrl,
//         paymentMode: ['card'],
//         saveCard: false,
//         merchantId: this.configService.get<string>('TOCHKA_MERCHANT_ID'),
//         preAuthorization: false,
//         ttl: 10080,
//       },
//     };

//     this.logger.log(
//       `Bankga so'rov yuborilmoqda... amount=${payload.Data.amount}, purpose="${payload.Data.purpose}"`,
//     );

//     try {
//       const { data } = await axios.post(`${this.tochkaBase}/payments`, payload, {
//         headers: this.buildHeaders(),
//       });

//       this.logger.debug(`Bank javobi: ${JSON.stringify(data, null, 2)}`);

//       const paymentUrl = data?.Data?.paymentLink;
//       const operationId = data?.Data?.operationId;

//       if (!paymentUrl || !operationId) {
//         this.logger.error(`Bank javobida paymentLink/operationId yo'q: ${JSON.stringify(data)}`);
//         throw new BadRequestException('Bank javobida paymentLink/operationId yo‘q.');
//       }

//       savedPayment.transactionId = operationId;
//       await this.paymentRepository.save(savedPayment);

//       return {
//         paymentUrl,
//         paymentId: savedPayment.id,
//         purchaseId: purchase.id,
//         transactionId: operationId,
//       };
//     } catch (e) {
//       const err = e as AxiosError<any>;
//       const status = err.response?.status ?? 'unknown';
//       const responseData = err.response?.data ?? {};
//       this.logger.error(
//         `To'lov yaratishda xato. status=${status}, response=${JSON.stringify(responseData)}, error=${err.message}`,
//       );

//       if (status === 403) throw new UnauthorizedException('TOKEN ruxsatlari yetarli emas (403).');
//       if (status === 400) throw new BadRequestException(`Noto'g'ri so'rov (400): ${JSON.stringify(responseData)}`);
//       if (status === 424) throw new BadRequestException(`Bog‘liq servis xatosi (424): ${JSON.stringify(responseData)}`);

//       throw new BadRequestException(
//         `To'lov yaratishda xato: ${err.message}, status=${status}, data=${JSON.stringify(responseData)}`,
//       );
//     }
//   }

//   /**
//    * Bank operation statusini tekshirish (pull/polling)
//    */
//   async getOperationStatus(operationId: string) {
//     if (!operationId) throw new BadRequestException('operationId talab qilinadi');
//     try {
//       const { data } = await axios.get(`${this.tochkaBase}/payments/${operationId}`, {
//         headers: this.buildHeaders(),
//       });
//       this.logger.debug(`Status GET javobi: ${JSON.stringify(data, null, 2)}`);
//       return data;
//     } catch (e) {
//       const err = e as AxiosError<any>;
//       const status = err.response?.status ?? 'unknown';
//       const payload = err.response?.data ?? {};
//       this.logger.error(
//         `Status olishda xato: operationId=${operationId}, status=${status}, data=${JSON.stringify(payload)}`,
//       );
//       throw new BadRequestException(`Status olishda xato: ${status} / ${JSON.stringify(payload)}`);
//     }
//   }

//   async handleWebhook(payload: any) {
//     if (typeof payload?.callbackData === 'string') {
//       const callbackData: string = payload.callbackData;
//       const publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY');
//       if (!publicKey) throw new BadRequestException('TOCHKA_PUBLIC_KEY topilmadi (env).');

//       let decoded: any;
//       try {
//         decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
//       } catch (err: any) {
//         this.logger.error(`JWT verify xato: ${err.message}`);
//         throw new BadRequestException(`Webhook JWT tekshiruv xatosi: ${err.message}`);
//       }
//       this.logger.debug(`Webhook decoded (JWT): ${JSON.stringify(decoded, null, 2)}`);
//       return this.applyPaymentEvent(decoded);
//     }

//     // 2) Oddiy JSON boshidan kelgan bo‘lsa
//     if (payload?.event && payload?.data) {
//       this.logger.debug(`Webhook plain body: ${JSON.stringify(payload, null, 2)}`);
//       return this.applyPaymentEvent(payload);
//     }

//     this.logger.error(`Webhook format noto'g'ri: ${JSON.stringify(payload)}`);
//     throw new BadRequestException('Webhook formati noto‘g‘ri. callbackData yoki {event,data} kerak.');
//   }

//   private async applyPaymentEvent(decoded: { event: string; data: any }) {
//     const { event, data } = decoded;

//     if (event !== 'acquiringInternetPayment') {
//       throw new BadRequestException(`Noma’lum event: ${event}`);
//     }

//     const operationId = data?.operationId;
//     if (!operationId) throw new BadRequestException('operationId topilmadi');

//     const payment = await this.paymentRepository.findOne({
//       where: { transactionId: operationId },
//       relations: ['purchase', 'purchase.user', 'purchase.course', 'purchase.category'],
//     });
//     if (!payment) throw new NotFoundException('Payment topilmadi');

//     if (!payment.purchase) throw new NotFoundException('Purchase topilmadi');
//     const bankStatus: string = data?.status ?? '';
//     this.logger.log(`Webhook status: operationId=${operationId}, bankStatus=${bankStatus}`);

//     if (bankStatus === 'APPROVED') {
//       payment.status = 'completed';
//       await this.paymentRepository.save(payment);
//       await this.purchasesService.confirmPurchase(payment.purchaseId);
//       return { status: 'OK' };
//     }

//     if (['REFUNDED', 'EXPIRED', 'REFUNDED_PARTIALLY'].includes(bankStatus)) {
//       payment.status = 'failed';
//       await this.paymentRepository.save(payment);
//       return { status: 'OK' };
//     }
//     this.logger.warn(`Kutilmagan/boshqa status: ${bankStatus}`);
//     return { status: 'IGNORED', bankStatus };
//   }
// }
