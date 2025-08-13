// payments.controller.ts
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
  Get,
  Param,
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
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      this.logger.debug(`Webhook raw body: ${rawBody}, Content-Type: ${req.get('Content-Type')}`);

      if (!rawBody) {
        this.logger.warn('Webhook bo‘sh keldi');
        return { ok: true };
      }

      await this.paymentsService.handleCallback(rawBody);
      return { ok: true };
    } catch (err) {
      this.logger.error(`Webhook xato: ${err.message}`, err.stack);
      return { ok: true };
    }
  }

  @Get('status/:requestId')
  async checkPaymentStatus(@Param('requestId') requestId: string) {
    return this.paymentsService.checkPaymentStatus(requestId);
  }
}