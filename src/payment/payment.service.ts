import { Injectable, NotFoundException, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UsersService } from '../user/user.service';
import { CoursesService } from '../course/course.service';
import { CategoryService } from '../category/category.service';
import { PurchasesService } from '../purchases/purchases.service';
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
    private configService: ConfigService,
  ) {}

  async getCustomerAndMerchantData(token: string) {
    const isTestModeRaw = this.configService.get<string>('IS_TEST_MODE');
    const isTestMode = isTestModeRaw === 'true';
    this.logger.log(`IS_TEST_MODE qiymati: ${isTestModeRaw}, parse qilingan: ${isTestMode}`);

    const customerCode = this.configService.get<string>('TOCHKA_CUSTOMER_CODE');
    const bankCode = this.configService.get<string>('TOCHKA_BANK_CODE') || '044525104';
    const merchantId = this.configService.get<string>('TOCHKA_MERCHANT_ID');

    if (!customerCode || !bankCode) {
      this.logger.error('TOCHKA_CUSTOMER_CODE yoki TOCHKA_BANK_CODE .env faylida topilmadi');
      throw new BadRequestException('TOCHKA_CUSTOMER_CODE yoki TOCHKA_BANK_CODE topilmadi');
    }

    if (isTestMode) {
      this.logger.warn('Test rejimi yoqilgan: customerCode va merchantId .env dan olinmoqda');
      if (!merchantId) {
        this.logger.error('Test rejimida TOCHKA_MERCHANT_ID .env faylida bo‘lishi kerak');
        throw new BadRequestException('Test rejimida TOCHKA_MERCHANT_ID .env faylida bo‘lishi kerak');
      }
      return { customerCode, merchantId };
    }

    try {
      this.logger.log(`Tochka API customer ma'lumotlari so'ralmoqda: https://enter.tochka.com/uapi/sbp/v1.0/customer/${customerCode}/${bankCode}`);
      const customersResponse = await axios.get(
        `https://enter.tochka.com/uapi/sbp/v1.0/customer/${customerCode}/${bankCode}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ).catch(err => {
        if (err.response?.status === 403) {
          this.logger.error('Token ruxsatlari yetarli emas: ReadSBPData ruxsati kerak. Dokumentatsiyani tekshiring: https://enter.tochka.com/doc/v2/redoc');
          throw new UnauthorizedException('Token ruxsatlari yetarli emas: ReadSBPData ruxsati kerak');
        }
        if (err.response?.status === 401) {
          this.logger.error('Token yaroqsiz yoki muddati tugagan');
          throw new UnauthorizedException('Token yaroqsiz yoki muddati tugagan');
        }
        if (err.response?.status === 404) {
          this.logger.error(`Customer topilmadi: customerCode=${customerCode}, bankCode=${bankCode}`);
          throw new NotFoundException('Customer topilmadi');
        }
        throw err;
      });

      this.logger.log(`Customer javobi: ${JSON.stringify(customersResponse.data)}`);
      const customerData = customersResponse.data.Data;
      if (customerData.customerType !== 'Business') {
        this.logger.error('Business customer topilmadi');
        throw new NotFoundException('Business customer topilmadi');
      }

      this.logger.log('Tochka API merchants ma\'lumotlari so\'ralmoqda: https://enter.tochka.com/uapi/sbp/v1.0/merchants');
      const retailersResponse = await axios.get('https://enter.tochka.com/uapi/sbp/v1.0/merchants', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(err => {
        if (err.response?.status === 403) {
          this.logger.error('Token ruxsatlari yetarli emas: ReadSBPData ruxsati kerak');
          throw new UnauthorizedException('Token ruxsatlari yetarli emas: ReadSBPData ruxsati kerak');
        }
        throw err;
      });

      this.logger.log(`Merchants javobi: ${JSON.stringify(retailersResponse.data)}`);
      const merchant = retailersResponse.data.Data?.Merchants?.find(
        (r: any) => r.status === 'REG' && r.isActive,
      );
      if (!merchant?.merchantId) {
        this.logger.error('Faol merchantId topilmadi');
        throw new NotFoundException('Faol merchantId topilmadi');
      }

      return { customerCode: customerData.customerCode, merchantId: merchant.merchantId };
    } catch (err) {
      this.logger.error(`Tochka API xatosi: ${err.message}, status: ${err.response?.status}, response: ${JSON.stringify(err.response?.data)}`);
      throw new BadRequestException(`Tochka API xatosi: ${err.message}`);
    }
  }

  async startPayment(createPaymentDto: CreatePaymentDto, userId: number) {
    this.logger.log(`To‘lov boshlanmoqda: userId=${userId}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, degree=${createPaymentDto.degree}`);

    const user = await this.usersService.findOne(userId);
    if (!user) {
      this.logger.error(`Foydalanuvchi topilmadi: userId=${userId}`);
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const course = await this.coursesService.findOne(createPaymentDto.courseId);
    if (!course) {
      this.logger.error(`Kurs topilmadi: courseId=${createPaymentDto.courseId}`);
      throw new NotFoundException('Kurs topilmadi');
    }

    const category = await this.categoryService.findOne(createPaymentDto.categoryId);
    if (!category) {
      this.logger.error(`Kategoriya topilmadi: categoryId=${createPaymentDto.categoryId}`);
      throw new NotFoundException('Kategoriya topilmadi');
    }

    const isCategoryLinked = course.categories?.some(cat => cat.id === category.id);
    if (!isCategoryLinked) {
      this.logger.error(`Ushbu kursga bu kategoriya tegishli emas: courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}`);
      throw new NotFoundException('Ushbu kursga bu kategoriya tegishli emas');
    }

    const purchase = await this.purchasesService.create(createPaymentDto, userId);
    this.logger.log(`Xarid yaratildi: purchaseId=${purchase.id}`);

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
    this.logger.log(`To‘lov yaratildi: paymentId=${savedPayment.id}`);

    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    if (!token) {
      this.logger.error('Tochka JWT token topilmadi');
      throw new BadRequestException('Tochka JWT token topilmadi');
    }

    const { customerCode, merchantId } = await this.getCustomerAndMerchantData(token);

    const isTestModeRaw = this.configService.get<string>('IS_TEST_MODE');
    const isTestMode = isTestModeRaw === 'true';
    this.logger.log(`startPayment: IS_TEST_MODE qiymati: ${isTestModeRaw}, parse qilingan: ${isTestMode}`);

    if (isTestMode) {
      this.logger.warn('Test rejimi yoqilgan: Mock to‘lov havolasi qaytarilmoqda');
      return {
        paymentUrl: `https://test.pay.tochka.com/mock_payment_${transactionId}`,
        paymentId: savedPayment.id,
        purchaseId: purchase.id,
      };
    }

    try {
      this.logger.log('Tochka API payment-links endpointiga so‘rov yuborilmoqda: https://enter.tochka.com/uapi/sbp/v1.0/payment-links');
      const paymentResponse = await axios.post(
        'https://enter.tochka.com/uapi/sbp/v1.0/payment-links',
        {
          amount: category.price,
          currency: 'RUB',
          customerCode,
          merchantId,
          description: `Kurs: ${course.name}, Kategoriya: ${category.name}, Daraja: ${createPaymentDto.degree}`,
          successUrl: 'https://aplusacademy.ru/success',
          failUrl: 'https://aplusacademy.ru/fail',
          orderId: transactionId,
          paymentMethods: ['CARD'],
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'CustomerCode': customerCode,
          },
        },
      ).catch(err => {
        if (err.response?.status === 403) {
          this.logger.error('Token ruxsatlari yetarli emas: MakeAcquiringOperation ruxsati kerak. Dokumentatsiyani tekshiring: https://enter.tochka.com/doc/v2/redoc');
          throw new UnauthorizedException('Token ruxsatlari yetarli emas: MakeAcquiringOperation ruxsati kerak');
        }
        if (err.response?.status === 400) {
          this.logger.error(`So'rov body formati noto'g'ri: ${JSON.stringify(err.response.data)}`);
          throw new BadRequestException(`So'rov body formati noto'g'ri: ${err.message}`);
        }
        throw err;
      });

      this.logger.log(`To‘lov havolasi yaratildi: paymentId=${savedPayment.id}, paymentUrl=${paymentResponse.data.Data.paymentLink}`);
      return {
        paymentUrl: paymentResponse.data.Data.paymentLink,
        paymentId: savedPayment.id,
        purchaseId: purchase.id,
      };
    } catch (err) {
      this.logger.error(`To‘lov havolasi yaratishda xato: ${err.message}, status: ${err.response?.status}, response: ${JSON.stringify(err.response?.data)}`);
      throw new BadRequestException(`To‘lov havolasi yaratishda xato: ${err.message}`);
    }
  }

  async handleCallback(callbackData: string) {
    this.logger.log(`Webhook keldi: ${callbackData}`);

    if (!callbackData) {
      this.logger.error('callbackData parametri taqdim etilmadi');
      throw new BadRequestException('callbackData parametri taqdim etilmadi');
    }

    let publicKey: string;
    try {
      publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY') || '';
      if (!publicKey) {
        this.logger.error('Tochka public key .env faylida topilmadi');
        throw new BadRequestException('Tochka public key .env faylida topilmadi');
      }
    } catch (err) {
      this.logger.error(`Tochka public key o‘qishda xato: ${err.message}`);
      throw new BadRequestException(`Tochka public key o‘qishda xato: ${err.message}`);
    }

    let decoded: any;
    const isTestModeRaw = this.configService.get<string>('IS_TEST_MODE');
    const isTestMode = isTestModeRaw === 'true';
    this.logger.log(`handleCallback: IS_TEST_MODE qiymati: ${isTestModeRaw}, parse qilingan: ${isTestMode}`);

    if (isTestMode) {
      this.logger.warn('Test rejimi yoqilgan: Webhook JWT tekshiruvi o‘tkazib yuborilmoqda');
      try {
        decoded = JSON.parse(callbackData);
        this.logger.log(`Test rejimida webhook ma'lumotlari: ${JSON.stringify(decoded)}`);
      } catch (err) {
        this.logger.error(`Test rejimida webhook JSON parsing xatosi: ${err.message}`);
        throw new BadRequestException(`Test rejimida webhook JSON parsing xatosi: ${err.message}`);
      }
    } else {
      try {
        decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
        this.logger.log(`Webhook JWT muvaffaqiyatli tekshirildi: event=${decoded.event}`);
      } catch (err) {
        this.logger.error(`Webhook JWT tekshiruvi xato: ${err.message}`);
        throw new BadRequestException(`Webhook JWT tekshiruvi xato: ${err.message}`);
      }
    }

    const { event, data } = decoded;
    this.logger.log(`Webhook event: ${event}, data: ${JSON.stringify(data)}`);

    if (event === 'acquiringInternetPayment') {
      const payment = await this.paymentRepository.findOne({
        where: { transactionId: data.operationId },
        relations: ['purchase'], // purchase aloqasini yuklash
      });
      if (!payment) {
        this.logger.error(`To‘lov topilmadi: operationId=${data.operationId}`);
        throw new NotFoundException('To‘lov topilmadi');
      }

      if (data.status === 'Accepted') {
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
        this.logger.log(`To‘lov tasdiqlandi: paymentId=${payment.id}, purchaseId=${payment.purchaseId}`);
        return { status: 'OK' };
      } else if (['Rejected', 'DECLINED', 'CANCELLED', 'TIMEOUT', 'ERROR'].includes(data.status)) {
        payment.status = 'failed';
        await this.paymentRepository.save(payment);
        this.logger.log(`To‘lov rad etildi: paymentId=${payment.id}, status=${data.status}`);
        return { status: 'OK' };
      } else {
        this.logger.warn(`Noma’lum to‘lov statusi: ${data.status}`);
        throw new BadRequestException(`Noma’lum to‘lov statusi: ${data.status}`);
      }
    }

    this.logger.error(`Noma’lum webhook event turi: ${event}`);
    throw new BadRequestException(`Noma’lum webhook event turi: ${event}`);
  }
}