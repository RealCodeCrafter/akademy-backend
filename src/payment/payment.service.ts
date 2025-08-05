import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
import { readFileSync } from 'fs';

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
    try {
      const customersResponse = await axios.get('https://enter.tochka.com/api/v2/customers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const customerCode = customersResponse.data.customers.find(
        (c: any) => c.customerType === 'Business',
      )?.customerCode;
      if (!customerCode) {
        this.logger.error('Business customerCode topilmadi');
        throw new NotFoundException('Business customerCode topilmadi');
      }

      const retailersResponse = await axios.get('https://enter.tochka.com/api/v2/retailers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const merchantId = retailersResponse.data.retailers.find(
        (r: any) => r.status === 'REG' && r.isActive,
      )?.merchantId;
      if (!merchantId) {
        this.logger.error('Faol merchantId topilmadi');
        throw new NotFoundException('Faol merchantId topilmadi');
      }

      return { customerCode, merchantId };
    } catch (err) {
      this.logger.error(`Tochka API xatosi: ${err.message}`);
      throw new Error(`Tochka API xatosi: ${err.message}`);
    }
  }

  async startPayment(createPaymentDto: CreatePaymentDto, userId: number) {
    this.logger.log(`To‘lov boshlanmoqda: userId=${userId}, courseId=${createPaymentDto.courseId}`);

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

    const transactionId = `txn_${Date.now()}`;
    const payment = this.paymentRepository.create({
      amount: category.price, // Narx RUB da bo‘lishi kerak
      transactionId,
      status: 'pending',
      user,
      purchaseId: purchase.id,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    const token = this.configService.get<string>('TOCHKA_JWT_TOKEN');
    if (!token) {
      this.logger.error('Tochka JWT token topilmadi');
      throw new Error('Tochka JWT token topilmadi');
    }

    const { customerCode, merchantId } = await this.getCustomerAndMerchantData(token);

    try {
      const paymentResponse = await axios.post(
        'https://enter.tochka.com/api/v2/payment-links',
        {
          amount: category.price,
          currency: 'RUB',
          customerCode,
          merchantId,
          description: `Kurs: ${course.name}, Kategoriya: ${category.name}`,
          successUrl: 'https://aplusacademy.ru/success',
          failUrl: 'https://aplusacademy.ru/fail',
          orderId: transactionId,
          paymentMethods: ['CARD'],
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`To‘lov havolasi yaratildi: paymentId=${savedPayment.id}`);
      return {
        paymentUrl: paymentResponse.data.paymentLink,
        paymentId: savedPayment.id,
        purchaseId: purchase.id,
      };
    } catch (err) {
      this.logger.error(`To‘lov havolasi yaratishda xato: ${err.message}`);
      throw new Error(`To‘lov havolasi yaratishda xato: ${err.message}`);
    }
  }

  async handleCallback(callbackData: string) {
    this.logger.log(`Webhook keldi: ${callbackData}`);

    let publicKey: string;
    try {
      publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY') || "";
      if (!publicKey) {
        this.logger.error('Tochka public key .env faylida topilmadi');
        throw new Error('Tochka public key .env faylida topilmadi');
      }
    } catch (err) {
      this.logger.error('Tochka public key o‘qishda xato: ' + err.message);
      throw new Error('Tochka public key o‘qishda xato: ' + err.message);
    }

    let decoded: any;
    try {
      decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
    } catch (err) {
      this.logger.error('Webhook JWT tekshiruvi xato: ' + err.message);
      throw new Error('Webhook JWT tekshiruvi xato: ' + err.message);
    }

    const { event, data } = decoded;
    if (event === 'acquiringInternetPayment') {
      const payment = await this.paymentRepository.findOne({
        where: { transactionId: data.operationId },
      });
      if (!payment) {
        this.logger.error(`To‘lov topilmadi: operationId=${data.operationId}`);
        throw new NotFoundException('To‘lov topilmadi');
      }

      if (data.status === 'APPROVED') {
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
        this.logger.log(`To‘lov tasdiqlandi: paymentId=${payment.id}`);
      } else if (['DECLINED', 'CANCELLED', 'TIMEOUT', 'ERROR'].includes(data.status)) {
        payment.status = 'failed';
        await this.paymentRepository.save(payment);
        this.logger.log(`To‘lov rad etildi: paymentId=${payment.id}, status=${data.status}`);
      } else {
        this.logger.warn(`Noma’lum to‘lov statusi: ${data.status}`);
      }

      return { status: 'OK' };
    }

    this.logger.error('Noma’lum webhook event turi: ' + event);
    throw new Error('Noma’lum webhook event turi');
  }
}