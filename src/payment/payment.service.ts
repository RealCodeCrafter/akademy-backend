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

    // Purchase yaratish
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

      return {
        paymentUrl: paymentLink,
        paymentId: savedPayment.id,
        purchaseId: purchase.id,
        transactionId: operationId,
      };
    } catch (err) {
      throw new BadRequestException(
        `Tochka API xatosi: ${err.response?.data || err.message}`,
      );
    }
  }

  async handleCallback(callbackData: string) {
    const publicKey = this.configService
      .get<string>('TOCHKA_PUBLIC_KEY')
      ?.replace(/\\n/g, '\n');
    if (!publicKey) throw new BadRequestException('Tochka public key topilmadi');

    let decoded: any;
    try {
      decoded = jwt.verify(callbackData, publicKey, { algorithms: ['RS256'] });
    } catch (err) {
      throw new BadRequestException('Webhook imzosi noto‘g‘ri');
    }

    const { event, data } = decoded;
    if (event === 'acquiringInternetPayment') {
      const payment = await this.paymentRepository.findOne({
        where: { transactionId: data.operationId },
        relations: ['purchase'],
      });
      if (!payment) throw new NotFoundException('To‘lov topilmadi');

      if (data.status === 'APPROVED') {
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
      } else if (['REFUNDED', 'EXPIRED', 'REFUNDED_PARTIALLY'].includes(data.status)) {
        payment.status = 'failed';
        await this.paymentRepository.save(payment);
      }
      return { status: 'OK' };
    }

    throw new BadRequestException(`Noma’lum event turi: ${event}`);
  }
}
