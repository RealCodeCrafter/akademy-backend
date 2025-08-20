
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../user/user.service';
import { CoursesService } from '../course/course.service';
import { CategoryService } from '../category/category.service';
import { PurchasesService } from '../purchases/purchases.service';
import { LevelService } from '../level/level.service';
import { Payment } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import axios from 'axios';
import * as https from 'https';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import * as jwt from 'jsonwebtoken';
import * as path from 'path';
import * as ipaddr from 'ipaddr.js';

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
    const user = await this.usersService.findOne(userId);
    if (!user) return { ok: false, error: 'Foydalanuvchi topilmadi' };

    const course = await this.coursesService.findOne(createPaymentDto.courseId);
    if (!course) return { ok: false, error: 'Kurs topilmadi' };

    const category = await this.categoryService.findOne(createPaymentDto.categoryId);
    if (!category) return { ok: false, error: 'Kategoriya topilmadi' };

    if (!course.categories?.some((cat) => cat.id === category.id)) {
      return { ok: false, error: 'Kategoriya ushbu kursga tegishli emas' };
    }

    let degree = category.name;
    if (createPaymentDto.levelId) {
      const level = await this.levelService.findOne(createPaymentDto.levelId);
      if (!level) return { ok: false, error: 'Daraja topilmadi' };
      const isLinked = await this.categoryService.isLevelLinkedToCategory(
        createPaymentDto.categoryId,
        createPaymentDto.levelId,
      );
      if (!isLinked) return { ok: false, error: 'Daraja ushbu kategoriya uchun emas' };
      degree = level.name;
    }

    const purchase = await this.purchasesService.create(createPaymentDto, userId);
    if (!purchase?.id) return { ok: false, error: 'Xarid ID noto‘g‘ri' };

    const internalTransactionId = `txn_${Date.now()}`;
    const receiptId = uuidv4();
    const payment = this.paymentRepository.create({
      amount: category.price,
      transactionId: null,
      providerOperationId: internalTransactionId,
      status: 'pending',
      provider: createPaymentDto.method || 'tochka',
      description: `Курс: ${course.name}, Категория: ${category.name}, Уровень: ${degree}`,
      user,
      purchaseId: purchase.id,
      purchase,
      receiptId,
    });
    const savedPayment: Payment = await this.paymentRepository.save(payment);

    if (savedPayment.provider === 'tochka') {
      const tochkaApiUrl = this.configService.get<string>('TOCHKA_PAYMENT_URL') || 'https://enter.tochka.com/uapi/acquiring/v1.0/payments';
      const tochkaJwtToken = this.configService.get<string>('TOCHKA_JWT_TOKEN');
      const tochkaMerchantId = this.configService.get<string>('TOCHKA_MERCHANT_ID');
      const tochkaCustomerCode = this.configService.get<string>('TOCHKA_CUSTOMER_CODE');

      if (!tochkaJwtToken || !tochkaMerchantId || !tochkaCustomerCode) {
        this.logger.error('Tochka Bank konfiguratsiyasi to‘liq emas');
        return { ok: false, error: 'Tochka Bank konfiguratsiyasi to‘liq emas' };
      }

      try {
        const response = await axios.post(
          tochkaApiUrl,
          {
            Data: {
              customerCode: tochkaCustomerCode,
              amount: category.price,
              purpose: `Курс: ${course.name}, Категория: ${category.name}, Уровень: ${degree}`,
              paymentMode: ['card'],
              saveCard: false,
              merchantId: tochkaMerchantId,
              preAuthorization: false,
              ttl: 10080,
              sourceName: 'A+ Academy',
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tochkaJwtToken}`,
            },
          },
        );

        const { paymentLink, operationId } = response.data.Data;
        savedPayment.transactionId = operationId;
        await this.paymentRepository.save(savedPayment);

        return {
          ok: true,
          paymentUrl: paymentLink,
          paymentId: savedPayment.id,
          purchaseId: purchase.id,
          transactionId: operationId,
          receiptId,
        };
      } catch (err: any) {
        this.logger.error(`Tochka Bank xatosi: ${err.response?.data?.message || err.message}`, err.stack);
        return { ok: false, error: `Tochka Bank xatosi: ${err.response?.data?.message || err.message}` };
      }
    }

    if (savedPayment.provider === 'dolyame') {
      const dolyameLogin = this.configService.get<string>('DOLYAME_LOGIN');
      const dolyamePassword = this.configService.get<string>('DOLYAME_PASSWORD');
      const dolyameCertPath = this.configService.get<string>('DOLYAME_CERT_PATH');
      const dolyameKeyPath = this.configService.get<string>('DOLYAME_KEY_PATH');
      const dolyameApiUrl = this.configService.get<string>('DOLYAME_API_URL');
      const dolyameNotificationUrl = this.configService.get<string>('DOLYAME_NOTIFICATION_URL');
      const dolyameShopName = this.configService.get<string>('DOLYAME_SHOP_NAME');
      const projectRoot = this.configService.get<string>('PROJECT_ROOT') || process.cwd();

      if (!dolyameLogin || !dolyamePassword || !dolyameCertPath || !dolyameKeyPath || !dolyameApiUrl) {
        return { ok: false, error: 'Dolyame konfiguratsiyasi to‘liq emas' };
      }

      try {
        const certPath = path.join(projectRoot, dolyameCertPath);
        const keyPath = path.join(projectRoot, dolyameKeyPath);
        const cert = fs.readFileSync(certPath);
        const key = fs.readFileSync(keyPath);
        const httpsAgent = new https.Agent({ cert, key });

        const normalizePhoneForDolyame = (phone?: string): string => {
          if (!phone) return '+79999999999';
          let digits = phone.replace(/\D/g, '');
          if (digits.length === 11 && digits.startsWith('8')) {
            digits = '7' + digits.slice(1);
          }
          if (digits.length === 10) {
            digits = '7' + digits;
          }
          if (digits.length === 11 && digits.startsWith('7')) {
            return '+' + digits;
          }
          return '+79999999999';
        };

        const orderId = `order_${internalTransactionId}`;
        const correlationId = uuidv4();
        const response = await axios.post(
          `${dolyameApiUrl}/orders/create`,
          {
            order: {
              id: orderId,
              amount: category.price,
              prepaid_amount: 0,
              items: [
                {
                  name: course.name,
                  price: Math.round(Number(category.price) * 100),
                  quantity: 1,
                  sku: `sku_${course.id}`,
                  unit: 'шт',
                },
              ],
            },
            client_info: {
              first_name: user.parentName || 'Client',
              last_name: user.studentName || 'Unknown',
              middle_name: user.studentSurname || '',
              email: user.email || 'client@example.com',
              phone: normalizePhoneForDolyame(user.parentPhone),
              birthdate: user.studentBirthDate || '1990-01-01',
            },
            notification_url: dolyameNotificationUrl,
            shop_name: dolyameShopName,
            create_demo: createPaymentDto.demoFlow || null,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Basic ${Buffer.from(`${dolyameLogin}:${dolyamePassword}`).toString('base64')}`,
              'X-Correlation-ID': correlationId,
            },
            httpsAgent,
          },
        );

        const { link } = response.data;
        savedPayment.providerOperationId = orderId;
        await this.paymentRepository.save(savedPayment);

        return {
          ok: true,
          paymentUrl: link,
          paymentId: savedPayment.id,
          purchaseId: purchase.id,
          transactionId: orderId,
          receiptId,
        };
      } catch (err: any) {
        this.logger.error(`Dolyame xatosi: ${err.response?.data?.message || err.message}`, err.stack);
        return { ok: false, error: `Dolyame xatosi: ${err.response?.data?.message || err.message}` };
      }
    }

    return { ok: false, error: 'Noma’lum to‘lov usuli' };
  }

  async commitDolyameOrder(orderId: string, amount: number, items: any[]) {
    const dolyameLogin = this.configService.get<string>('DOLYAME_LOGIN');
    const dolyamePassword = this.configService.get<string>('DOLYAME_PASSWORD');
    const dolyameCertPath = this.configService.get<string>('DOLYAME_CERT_PATH');
    const dolyameKeyPath = this.configService.get<string>('DOLYAME_KEY_PATH');
    const dolyameApiUrl = this.configService.get<string>('DOLYAME_API_URL');
    const projectRoot = this.configService.get<string>('PROJECT_ROOT') || process.cwd();

    if (!dolyameLogin || !dolyamePassword || !dolyameCertPath || !dolyameKeyPath || !dolyameApiUrl) {
      return { ok: false, error: 'Dolyame konfiguratsiyasi to‘liq emas' };
    }

    try {
      const certPath = path.join(projectRoot, dolyameCertPath);
      const keyPath = path.join(projectRoot, dolyameKeyPath);
      const cert = fs.readFileSync(certPath);
      const key = fs.readFileSync(keyPath);
      const httpsAgent = new https.Agent({ cert, key });

      const correlationId = uuidv4();
      const response = await axios.post(
        `${dolyameApiUrl}/orders/${orderId}/commit`,
        {
          order: {
            id: orderId,
            amount: amount,
            prepaid_amount: 0,
            items,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${dolyameLogin}:${dolyamePassword}`).toString('base64')}`,
            'X-Correlation-ID': correlationId,
          },
          httpsAgent,
        },
      );

      this.logger.log(`Dolyame commit muvaffaqiyatli: ${orderId}`);
      return { ok: true, data: response.data };
    } catch (err: any) {
      this.logger.error(`Dolyame commit xatosi: ${err.response?.data?.message || err.message}`, err.stack);
      return { ok: false, error: `Dolyame commit xatosi: ${err.response?.data?.message || err.message}` };
    }
  }

  async cancelDolyameOrder(orderId: string) {
    const dolyameLogin = this.configService.get<string>('DOLYAME_LOGIN');
    const dolyamePassword = this.configService.get<string>('DOLYAME_PASSWORD');
    const dolyameCertPath = this.configService.get<string>('DOLYAME_CERT_PATH');
    const dolyameKeyPath = this.configService.get<string>('DOLYAME_KEY_PATH');
    const dolyameApiUrl = this.configService.get<string>('DOLYAME_API_URL');
    const projectRoot = this.configService.get<string>('PROJECT_ROOT') || process.cwd();

    if (!dolyameLogin || !dolyamePassword || !dolyameCertPath || !dolyameKeyPath || !dolyameApiUrl) {
      return { ok: false, error: 'Dolyame konfiguratsiyasi to‘liq emas' };
    }

    try {
      const certPath = path.join(projectRoot, dolyameCertPath);
      const keyPath = path.join(projectRoot, dolyameKeyPath);
      const cert = fs.readFileSync(certPath);
      const key = fs.readFileSync(keyPath);
      const httpsAgent = new https.Agent({ cert, key });

      const correlationId = uuidv4();
      const response = await axios.post(
        `${dolyameApiUrl}/orders/${orderId}/cancel`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${dolyameLogin}:${dolyamePassword}`).toString('base64')}`,
            'X-Correlation-ID': correlationId,
          },
          httpsAgent,
        },
      );

      this.logger.log(`Dolyame cancel muvaffaqiyatli: ${orderId}`);
      return { ok: true, data: response.data };
    } catch (err: any) {
      this.logger.error(`Dolyame cancel xatosi: ${err.response?.data?.message || err.message}`, err.stack);
      return { ok: false, error: `Dolyame cancel xatosi: ${err.response?.data?.message || err.message}` };
    }
  }

  async refundDolyameOrder(orderId: string, amount: number, items: any[]) {
    const dolyameLogin = this.configService.get<string>('DOLYAME_LOGIN');
    const dolyamePassword = this.configService.get<string>('DOLYAME_PASSWORD');
    const dolyameCertPath = this.configService.get<string>('DOLYAME_CERT_PATH');
    const dolyameKeyPath = this.configService.get<string>('DOLYAME_KEY_PATH');
    const dolyameApiUrl = this.configService.get<string>('DOLYAME_API_URL');
    const projectRoot = this.configService.get<string>('PROJECT_ROOT') || process.cwd();

    if (!dolyameLogin || !dolyamePassword || !dolyameCertPath || !dolyameKeyPath || !dolyameApiUrl) {
      return { ok: false, error: 'Dolyame konfiguratsiyasi to‘liq emas' };
    }

    try {
      const certPath = path.join(projectRoot, dolyameCertPath);
      const keyPath = path.join(projectRoot, dolyameKeyPath);
      const cert = fs.readFileSync(certPath);
      const key = fs.readFileSync(keyPath);
      const httpsAgent = new https.Agent({ cert, key });

      const correlationId = uuidv4();
      const response = await axios.post(
        `${dolyameApiUrl}/orders/${orderId}/refund`,
        {
          amount: amount,
          refunded_prepaid_amount: 0,
          returned_items: items,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${dolyameLogin}:${dolyamePassword}`).toString('base64')}`,
            'X-Correlation-ID': correlationId,
          },
          httpsAgent,
        },
      );

      this.logger.log(`Dolyame refund muvaffaqiyatli: ${orderId}`);
      return { ok: true, data: response.data };
    } catch (err: any) {
      this.logger.error(`Dolyame refund xatosi: ${err.response?.data?.message || err.message}`, err.stack);
      return { ok: false, error: `Dolyame refund xatosi: ${err.response?.data?.message || err.message}` };
    }
  }

  async getDolyameOrderInfo(orderId: string) {
    const dolyameLogin = this.configService.get<string>('DOLYAME_LOGIN');
    const dolyamePassword = this.configService.get<string>('DOLYAME_PASSWORD');
    const dolyameCertPath = this.configService.get<string>('DOLYAME_CERT_PATH');
    const dolyameKeyPath = this.configService.get<string>('DOLYAME_KEY_PATH');
    const dolyameApiUrl = this.configService.get<string>('DOLYAME_API_URL');
    const projectRoot = this.configService.get<string>('PROJECT_ROOT') || process.cwd();

    if (!dolyameLogin || !dolyamePassword || !dolyameCertPath || !dolyameKeyPath || !dolyameApiUrl) {
      return { ok: false, error: 'Dolyame konfiguratsiyasi to‘liq emas' };
    }

    try {
      const certPath = path.join(projectRoot, dolyameCertPath);
      const keyPath = path.join(projectRoot, dolyameKeyPath);
      const cert = fs.readFileSync(certPath);
      const key = fs.readFileSync(keyPath);
      const httpsAgent = new https.Agent({ cert, key });

      const correlationId = uuidv4();
      const response = await axios.get(
        `${dolyameApiUrl}/orders/${orderId}/info`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${dolyameLogin}:${dolyamePassword}`).toString('base64')}`,
            'X-Correlation-ID': correlationId,
          },
          httpsAgent,
        },
      );

      this.logger.log(`Dolyame order info muvaffaqiyatli: ${orderId}`);
      return { ok: true, data: response.data };
    } catch (err: any) {
      this.logger.error(`Dolyame order info xatosi: ${err.response?.data?.message || err.message}`, err.stack);
      return { ok: false, error: `Dolyame order info xatosi: ${err.response?.data?.message || err.message}` };
    }
  }

  async completeDolyameDelivery(orderId: string, amount: number, items: any[]) {
    const dolyameLogin = this.configService.get<string>('DOLYAME_LOGIN');
    const dolyamePassword = this.configService.get<string>('DOLYAME_PASSWORD');
    const dolyameCertPath = this.configService.get<string>('DOLYAME_CERT_PATH');
    const dolyameKeyPath = this.configService.get<string>('DOLYAME_KEY_PATH');
    const dolyameApiUrl = this.configService.get<string>('DOLYAME_API_URL');
    const projectRoot = this.configService.get<string>('PROJECT_ROOT') || process.cwd();

    if (!dolyameLogin || !dolyamePassword || !dolyameCertPath || !dolyameKeyPath || !dolyameApiUrl) {
      return { ok: false, error: 'Dolyame konfiguratsiyasi to‘liq emas' };
    }

    try {
      const certPath = path.join(projectRoot, dolyameCertPath);
      const keyPath = path.join(projectRoot, dolyameKeyPath);
      const cert = fs.readFileSync(certPath);
      const key = fs.readFileSync(keyPath);
      const httpsAgent = new https.Agent({ cert, key });

      const correlationId = uuidv4();
      const response = await axios.post(
        `${dolyameApiUrl}/orders/${orderId}/complete_delivery`,
        {
          order: {
            id: orderId,
            amount: amount,
            prepaid_amount: 0,
            items,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${dolyameLogin}:${dolyamePassword}`).toString('base64')}`,
            'X-Correlation-ID': correlationId,
          },
          httpsAgent,
        },
      );

      this.logger.log(`Dolyame complete delivery muvaffaqiyatli: ${orderId}`);
      return { ok: true, data: response.data };
    } catch (err: any) {
      this.logger.error(`Dolyame complete delivery xatosi: ${err.response?.data?.message || err.message}`, err.stack);
      return { ok: false, error: `Dolyame complete delivery xatosi: ${err.response?.data?.message || err.message}` };
    }
  }

  async handleTochkaWebhook(rawBody: any, contentType: string) {
    if (!rawBody) {
      this.logger.warn('Webhook tanasi bo‘sh');
      return { ok: true, error: 'Webhook tanasi bo‘sh' };
    }

    const publicKey = this.configService.get<string>('TOCHKA_PUBLIC_KEY')?.replace(/\\n/g, '\n');
    if (!publicKey) {
      this.logger.error('Tochka public key topilmadi');
      return { ok: true, error: 'Tochka public key topilmadi' };
    }

    let decoded: any;
    if (contentType.includes('text/plain')) {
      try {
        decoded = jwt.verify(rawBody, publicKey, { algorithms: ['RS256'] });
      } catch (err) {
        this.logger.error(`Webhook JWT xatosi: ${err.message}`, err.stack);
        return { ok: true, error: `Webhook JWT xatosi: ${err.message}` };
      }
    } else if (contentType.includes('application/json')) {
      try {
        decoded = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      } catch (err) {
        this.logger.error(`JSON parse xatosi: ${err.message}`, err.stack);
        return { ok: true, error: `JSON parse xatosi: ${err.message}` };
      }
    } else {
      this.logger.error(`Noto‘g‘ri Content-Type: ${contentType}`);
      return { ok: true, error: `Noto‘g‘ri Content-Type: ${contentType}` };
    }

    const operationId = decoded.operationId || decoded.Data?.operationId;
    if (!operationId) {
      this.logger.warn('operationId topilmadi');
      return { ok: true, error: 'operationId topilmadi' };
    }

    const payment = await this.paymentRepository.findOne({
      where: { transactionId: operationId, provider: 'tochka' },
      relations: ['purchase'],
    });

    if (!payment) {
      this.logger.warn(`Payment topilmadi: ${operationId}`);
      return { ok: true, error: `Payment topilmadi: ${operationId}` };
    }

    const status = decoded.status || decoded.Data?.status;
    if (!status) {
      this.logger.warn('To‘lov statusi topilmadi');
      return { ok: true, error: 'To‘lov statusi topilmadi' };
    }

    switch (status) {
      case 'APPROVED':
      case 'AUTHORIZED':
        payment.status = 'completed';
        await this.paymentRepository.save(payment);
        await this.purchasesService.confirmPurchase(payment.purchaseId);
        const digitalKassaResult = await this.sendReceiptToDigitalKassa(payment, 'full_payment', false, payment.receiptId);
        if (!digitalKassaResult.ok) {
          this.logger.warn(`Digital Kassa xatosi: ${digitalKassaResult.error}`);
        }
        break;
      case 'DECLINED':
        payment.status = 'failed';
        await this.paymentRepository.save(payment);
        this.logger.warn(`To‘lov rad etildi: ${operationId}`);
        break;
      default:
        payment.status = 'failed';
        await this.paymentRepository.save(payment);
        this.logger.warn(`Qabul qilinmagan status: ${status}`);
        return { ok: true, error: `Qabul qilinmagan status: ${status}` };
    }

    this.logger.log(`Tochka webhook muvaffaqiyatli qayta ishlandi: ${operationId}, status: ${status}`);
    return { ok: true };
  }

  async handleDolyameWebhook(body: any, req: any) {
  // this.logger.log(`Dolyame webhook: ${JSON.stringify(body)}`);

  // const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  // if (!this.isValidDolyameIp(clientIp)) {
  //   this.logger.warn(`Noto'g'ri IP manzildan webhook keldi: ${clientIp}`);
  //   throw new HttpException('Notogri IP manzil', HttpStatus.FORBIDDEN);
  // }

  const { payment_id, status, amount, residual_amount, client_info, payment_schedule } = body;
  if (!payment_id || !status) {
    this.logger.warn(`Noto'g'ri webhook ma'lumotlari: ${JSON.stringify(body)}`);
    throw new HttpException('Notogri webhook malumotlari', HttpStatus.BAD_REQUEST);
  }

  // payment_id ni providerOperationId bilan solishtirish
  const payment = await this.paymentRepository.findOne({
    where: { providerOperationId: payment_id, provider: 'dolyame' }, // transactionId o'rniga providerOperationId
    relations: ['purchase'],
  });

  if (!payment) {
    this.logger.warn(`Payment topilmadi: ${payment_id}`);
    return { ok: true, error: `Payment topilmadi: ${payment_id}` };
  }

  const validStatuses = ['approved', 'rejected', 'canceled', 'committed', 'wait_for_commit', 'completed'];
  if (!validStatuses.includes(status)) {
    this.logger.warn(`Noto'g'ri status: ${status}`);
    throw new HttpException('Notogri status', HttpStatus.BAD_REQUEST);
  }

  try {
    payment.status = status === 'rejected' || status === 'canceled' ? 'failed' : status;
    payment.amount = amount ? Number((amount / 100).toFixed(2)) : payment.amount;
    if (residual_amount !== undefined) {
      payment['residual_amount'] = Number((residual_amount / 100).toFixed(2));
    }
    if (client_info) {
      payment['client_info'] = JSON.stringify(client_info);
    }
    if (payment_schedule) {
      payment['payment_schedule'] = JSON.stringify(payment_schedule);
    }
    await this.paymentRepository.save(payment);

    if (status === 'completed') {
      await this.purchasesService.confirmPurchase(payment.purchaseId);
    }

    this.logger.log(`Webhook muvaffaqiyatli qayta ishlandi: ${payment_id}, status: ${status}`);
    return { ok: true, paymentId: payment_id };
  } catch (error) {
    this.logger.error(`Webhookni qayta ishlashda xato: ${error.message}`, error.stack);
    throw new HttpException('Webhookni qayta ishlashda xato', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

  async checkPaymentStatus(requestId: string, provider: string = 'tochka') {
    if (provider === 'tochka') {
      const tochkaJwtToken = this.configService.get<string>('TOCHKA_JWT_TOKEN');
      if (!tochkaJwtToken) return { ok: false, error: 'Tochka JWT token topilmadi' };

      try {
        const response = await axios.get(
          `https://enter.tochka.com/uapi/acquiring/v1.0/payments/${requestId}`,
          {
            headers: {
              Authorization: `Bearer ${tochkaJwtToken}`,
            },
          },
        );
        return { ok: true, data: response.data.Data };
      } catch (err: any) {
        return { ok: false, error: `Tochka status xatosi: ${err.response?.data?.message || err.message}` };
      }
    } else if (provider === 'dolyame') {
      return this.getDolyameOrderInfo(requestId);
    }

    return { ok: false, error: 'Noma’lum provider' };
  }

  private isValidDolyameIp(ip: string): boolean {
    try {
      const addr = ipaddr.parse(ip);
      const [rangeAddr, bits] = ipaddr.parseCIDR('91.194.226.0/23');
      return (addr as any).match([rangeAddr, bits]);
    } catch (e) {
      this.logger.warn(`IP tekshirishda xato: ${ip}`, e.stack);
      return false;
    }
  }

  async openShift() {
    const apiUrl = this.configService.get<string>('DIGITAL_KASSA_API_URL') || 'https://api.digitalkassa.ru/v2.1';
    const groupId = Number(this.configService.get<string>('DIGITAL_KASSA_GROUP_ID') || 3190);
    const actor = this.configService.get<string>('DIGITAL_KASSA_ACTOR') || 'Malakhova_A_S';
    const token = this.configService.get<string>('DIGITAL_KASSA_TOKEN') || '07uJ=$!nPFmUT9n68b2*';
    const kktAddress = this.configService.get<string>('DIGITAL_KASSA_KKT_ADDRESS') || 'г. Брянск, ул. Крахмалёва, д.55';
    const kktPlace = this.configService.get<string>('DIGITAL_KASSA_KKT_PLACE') || 'A+ ACADEMY';

    try {
      const response = await axios.post(
        `${apiUrl}/c_groups/${groupId}/shifts/open`,
        {
          address: kktAddress,
          place: kktPlace,
        },
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Basic ${Buffer.from(`${actor}:${token}`).toString('base64')}`,
          },
        },
      );
      this.logger.log(`Smenani ochish muvaffaqiyatli: ${JSON.stringify(response.data)}`);
      return { ok: true, data: response.data };
    } catch (err: any) {
      this.logger.error(`Smenani ochishda xato: ${err.response?.data?.message || err.message}`);
      return { ok: false, error: `Smenani ochishda xato: ${err.response?.data?.message || err.message}` };
    }
  }

  async closeShift() {
    const apiUrl = this.configService.get<string>('DIGITAL_KASSA_API_URL') || 'https://api.digitalkassa.ru/v2.1';
    const groupId = Number(this.configService.get<string>('DIGITAL_KASSA_GROUP_ID') || 3190);
    const actor = this.configService.get<string>('DIGITAL_KASSA_ACTOR') || 'Malakhova_A_S';
    const token = this.configService.get<string>('DIGITAL_KASSA_TOKEN') || '07uJ=$!nPFmUT9n68b2*';
    const kktAddress = this.configService.get<string>('DIGITAL_KASSA_KKT_ADDRESS') || 'г. Брянск, ул. Крахмалёва, д.55';
    const kktPlace = this.configService.get<string>('DIGITAL_KASSA_KKT_PLACE') || 'A+ ACADEMY';

    try {
      const response = await axios.post(
        `${apiUrl}/c_groups/${groupId}/shifts/close`,
        {
          address: kktAddress,
          place: kktPlace,
        },
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Basic ${Buffer.from(`${actor}:${token}`).toString('base64')}`,
          },
        },
      );
      this.logger.log(`Smenani yopish muvaffaqiyatli: ${JSON.stringify(response.data)}`);
      return { ok: true, data: response.data };
    } catch (err: any) {
      this.logger.error(`Smenani yopishda xato: ${err.response?.data?.message || err.message}`);
      return { ok: false, error: `Smenani yopishda xato: ${err.response?.data?.message || err.message}` };
    }
  }

  async sendReceiptToDigitalKassa(
    payment: Payment,
    paymentMethod: 'full_payment' | 'full_prepayment',
    isRefund = false,
    receiptId: string,
  ) {
    try {
      const apiUrl = this.configService.get<string>('DIGITAL_KASSA_API_URL') || 'https://api.digitalkassa.ru/v2.1';
      const groupId = Number(this.configService.get<string>('DIGITAL_KASSA_GROUP_ID') || 3190);
      const actor = this.configService.get<string>('DIGITAL_KASSA_ACTOR') || 'Malakhova_A_S';
      const token = this.configService.get<string>('DIGITAL_KASSA_TOKEN') || '07uJ=$!nPFmUT9n68b2*';
      const taxation = Number(this.configService.get<string>('DIGITAL_KASSA_TAXATION') || 16);
      const vatCode = Number(this.configService.get<string>('DIGITAL_KASSA_VAT') || 0);
      const unitCode = Number(this.configService.get<string>('DIGITAL_KASSA_UNIT') || 0);
      const kktAddress = this.configService.get<string>('DIGITAL_KASSA_KKT_ADDRESS') || 'г. Брянск, ул. Крахмалёва, д.55';
      const kktPlace = this.configService.get<string>('DIGITAL_KASSA_KKT_PLACE') || 'A+ ACADEMY';
      const kktAutomatic = this.configService.get<string>('DIGITAL_KASSA_KKT_AUTOMATIC') === 'true';
      const deviceNumber = this.configService.get<string>('DIGITAL_KASSA_DEVICE_NUMBER') || '';

      const validTaxations = [1, 2, 4, 16, 32];
      if (!validTaxations.includes(taxation)) {
        this.logger.warn(`Noto'g'ri taxation qiymati: ${taxation}. Ruxsat etilgan qiymatlar: ${validTaxations.join(', ')}`);
      }

      if (!groupId || !actor || !token) {
        this.logger.warn('DigitalKassa konfiguratsiyasi to‘liq emas');
        return { ok: false, error: 'DigitalKassa konfiguratsiyasi to‘liq emas', receiptId };
      }

      const endpoint = isRefund
        ? `/c_groups/${groupId}/receipts/correction/${receiptId}`
        : `/c_groups/${groupId}/receipts/${receiptId}`;

      const cleanDescription = (payment.description || `Order #${payment.id}`)
        .replace(/[«»]/g, '"')
        .replace(/[^\x00-\x7FА-Яа-яЁё0-9.,;:\-'"() ]/g, '')
        .substring(0, 128);

      const round2 = (n: number) => Math.round(n * 100) / 100;
      const amount2 = round2(Number(payment.amount || 0));

      const paymentMethodCode = paymentMethod === 'full_prepayment' ? 1 : 4;

      const notifyPhone = payment.user?.parentPhone || this.configService.get<string>('DIGITAL_KASSA_TEST_PHONE') || '+79999999999';
      const notifyEmails = [payment.user?.email || this.configService.get<string>('DIGITAL_KASSA_TEST_EMAIL') || 'test@example.com'];

      const item = {
        type: 1,
        name: cleanDescription,
        price: amount2,
        quantity: 1,
        amount: amount2,
        payment_method: paymentMethodCode,
        vat: vatCode,
        unit: unitCode,
        payment_object: 13,
      };

      const common = {
        type: isRefund ? 3 : 1,
        items: [item],
        taxation,
        amount: {
          cash: isRefund ? 0 : amount2,
          cashless: isRefund ? amount2 : 0,
          prepayment: 0,
          postpayment: 0,
          barter: 0,
        },
        notify: { emails: notifyEmails, phone: notifyPhone },
        customer: { tin: '', name: payment.user?.parentName || 'Client' },
        additional_attribute: { name: 'Order ID', value: String(payment.id) },
        loc: {
          billing_place: this.configService.get<string>('PUBLIC_SITE_URL') || 'https://aplusacademy.ru',
          address: kktAddress,
          place: kktPlace,
          ...(deviceNumber && { device_number: deviceNumber }),
        },
      };

      if (isRefund) {
        common['corrected_date'] = new Date().toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        common['order_number'] = '';
      }

      if (!kktAutomatic) {
        common['cashier'] = { tin: '', name: '' };
      }

      const axiosConfig = {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Basic ${Buffer.from(`${actor}:${token}`).toString('base64')}`,
        },
        timeout: 15000,
      };

      this.logger.log(`DigitalKassa so'rov tanasi: ${JSON.stringify(common)}`);

      try {
        const resp = await axios.post(`${apiUrl}${endpoint}`, common, axiosConfig);
        this.logger.log(`DigitalKassa chek OK: ${JSON.stringify(resp.data)}`);
        return { ok: true, data: resp.data, receiptId };
      } catch (err: any) {
        const errorDetails = err.response?.data ?? err.message ?? String(err);
        this.logger.error(`DigitalKassa xatosi: ${JSON.stringify(errorDetails)}`);
        return { ok: false, receiptId, error: `DigitalKassa xatosi: ${errorDetails}` };
      }
    } catch (outer: any) {
      this.logger.error(`sendReceiptToDigitalKassa fatal: ${outer?.message || outer}`);
      return { ok: false, error: `sendReceiptToDigitalKassa fatal: ${outer?.message || outer}`, receiptId };
    }
  }

  async testDolyameOrder(userId: number, amount: number, demoFlow: 'payment-success' | 'payment-fail' | 'reject' | null) {
    const user = await this.usersService.findOne(userId);
    if (!user) return { ok: false, error: 'Foydalanuvchi topilmadi' };

    const internalTransactionId = `test_txn_${Date.now()}`;
    const receiptId = uuidv4();
    const orderId = `order_${internalTransactionId}`;
    const payment = this.paymentRepository.create({
      amount: amount,
      transactionId: null,
      providerOperationId: internalTransactionId,
      status: 'pending',
      provider: 'dolyame',
      description: `Test order: ${orderId}`,
      user,
      receiptId,
    });
    const savedPayment: Payment = await this.paymentRepository.save(payment);

    const dolyameLogin = this.configService.get<string>('DOLYAME_LOGIN');
    const dolyamePassword = this.configService.get<string>('DOLYAME_PASSWORD');
    const dolyameCertPath = this.configService.get<string>('DOLYAME_CERT_PATH');
    const dolyameKeyPath = this.configService.get<string>('DOLYAME_KEY_PATH');
    const dolyameApiUrl = this.configService.get<string>('DOLYAME_API_URL');
    const dolyameNotificationUrl = this.configService.get<string>('DOLYAME_NOTIFICATION_URL');
    const dolyameShopName = this.configService.get<string>('DOLYAME_SHOP_NAME');
    const projectRoot = this.configService.get<string>('PROJECT_ROOT') || process.cwd();

    if (!dolyameLogin || !dolyamePassword || !dolyameCertPath || !dolyameKeyPath || !dolyameApiUrl) {
      return { ok: false, error: 'Dolyame konfiguratsiyasi to‘liq emas' };
    }

    try {
      const certPath = path.join(projectRoot, dolyameCertPath);
      const keyPath = path.join(projectRoot, dolyameKeyPath);
      const cert = fs.readFileSync(certPath);
      const key = fs.readFileSync(keyPath);
      const httpsAgent = new https.Agent({ cert, key });

      const correlationId = uuidv4();
      const response = await axios.post(
        `${dolyameApiUrl}/orders/create`,
        {
          order: {
            id: orderId,
            amount: Number(amount.toFixed(2)) * 100,
            prepaid_amount: 0,
            items: [
              {
                name: 'Test Product',
                price: Number(amount.toFixed(2)) * 100,
                quantity: 1,
                sku: `sku_test_${Date.now()}`,
                unit: 'шт',
              },
            ],
          },
          client_info: {
            first_name: user.parentName || 'Client',
            last_name: user.parentSurname || 'Unknown',
            middle_name: user.parentName || '',
            email: user.email || 'client@example.com',
            phone: user.parentPhone || '+79999999999',
            birthdate: user.studentBirthDate || '1990-01-01',
          },
          notification_url: dolyameNotificationUrl,
          shop_name: dolyameShopName,
          create_demo: demoFlow,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${dolyameLogin}:${dolyamePassword}`).toString('base64')}`,
            'X-Correlation-ID': correlationId,
          },
          httpsAgent,
        },
      );

      const { payment_id, payment_url } = response.data;
      savedPayment.transactionId = payment_id;
      await this.paymentRepository.save(savedPayment);

      return {
        ok: true,
        paymentUrl: payment_url,
        paymentId: savedPayment.id,
        transactionId: payment_id,
        receiptId,
        orderId,
      };
    } catch (err: any) {
      this.logger.error(`Dolyame test order xatosi: ${err.response?.data?.message || err.message}`, err.stack);
      return { ok: false, error: `Dolyame test order xatosi: ${err.response?.data?.message || err.message}` };
    }
  }
}