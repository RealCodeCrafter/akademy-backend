import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  Logger,
  All,
  HttpCode,
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
      this.logger.error('Foydalanuvchi aniqlanmadi');
      throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    }

    this.logger.log(
      `To'lov boshlash: userId=${userId}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`,
    );

    const result = await this.paymentsService.startPayment(
      createPaymentDto,
      userId,
    );

    this.logger.log(
      `To'lov yaratildi: paymentId=${result.paymentId}, transactionId=${result.transactionId}`,
    );

    return result;
  }

  @All('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() body: any) {
    if (!body?.callbackData) {
      this.logger.warn(
        'Webhook ping/test request — callbackData yo‘q',
      );
      return { ok: true };
    }

    try {
      const result = await this.paymentsService.handleCallback(body.callbackData);
      this.logger.log(`Webhook muvaffaqiyatli: ${JSON.stringify(result)}`);
      return result;
    } catch (err) {
      this.logger.error(`Webhook xato: ${err.message}`);
      return { error: true };
    }
  }
}
