import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PaymentsService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AuthGuard } from '../auth/auth.guard';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: { sub: number; username: string; role: string };
}

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(AuthGuard)
  @Post('start')
  async startPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.sub;

    if (!userId) {
      this.logger.error('Foydalanuvchi aniqlanmadi: Auth token noto‘g‘ri yoki yo‘q');
      throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    }

    this.logger.log(`To‘lov boshlash so‘rovi: userId=${userId}, payload=${JSON.stringify(createPaymentDto)}`);

    try {
      const result = await this.paymentsService.startPayment(createPaymentDto, userId);
      this.logger.log(`To‘lov muvaffaqiyatli boshlandi: paymentId=${result.paymentId}, transactionId=${result.transactionId}`);
      return result;
    } catch (err) {
      this.logger.error(`To‘lov boshlashda xato: ${err.message}`);
      throw err;
    }
  }

  @Post('callback')
  async handleCallback(@Body() body: any) {
    const callbackData = typeof body === 'string' ? body : body?.callbackData || JSON.stringify(body);

    this.logger.log(`Webhook so‘rovi keldi: ${callbackData}`);

    if (!callbackData) {
      this.logger.error('callbackData taqdim etilmadi yoki bo‘sh');
      throw new BadRequestException('callbackData taqdim etilmadi');
    }

    try {
      const result = await this.paymentsService.handleCallback(callbackData);
      this.logger.log(`Webhook muvaffaqiyatli qayta ishlendi: ${JSON.stringify(result)}`);
      return result;
    } catch (err) {
      this.logger.error(`Webhook qayta ishlashda xato: ${err.message}`);
      throw err;
    }
  }
}