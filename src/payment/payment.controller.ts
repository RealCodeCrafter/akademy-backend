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
      throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    }
    this.logger.log(`To'lov boshlash: userId=${userId}`);
    return this.paymentsService.startPayment(createPaymentDto, userId);
  }

  @All('webhook')
@HttpCode(200)
async handleWebhook(@Req() req: Request) {
  try {
    // Raw text body faqat POST bo'lsa olinadi
    const rawBody =
      req.method === 'POST' && typeof req.body === 'string'
        ? req.body
        : undefined;

    this.logger.debug(`Webhook headers: ${JSON.stringify(req.headers)}`);
    this.logger.debug(`Webhook raw body: ${rawBody}`);
    this.logger.debug(`Webhook body type: ${typeof rawBody}`);

    if (!rawBody) {
      this.logger.warn('Webhook monitoring yoki bo‘sh request keldi');
      return { ok: true };
    }

    await this.paymentsService.handleCallback(rawBody);
    return { ok: true };
  } catch (err) {
    this.logger.error(`Webhook xato: ${err.message}`, err.stack);
    return { ok: true };
  }
}

}
