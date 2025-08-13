import { Controller, Post, Body, Req, UseGuards, HttpCode, All, Get, Param } from '@nestjs/common';
import { PaymentsService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AuthGuard } from '../auth/auth.guard';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: { sub: number; username: string; role: string };
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(AuthGuard)
  @Post('start')
  async startPayment(@Body() createPaymentDto: CreatePaymentDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub;
    if (!userId) throw new Error('Foydalanuvchi aniqlanmadi');
    return this.paymentsService.startPayment(createPaymentDto, userId);
  }

  @All('webhook')
  @HttpCode(200)
  async handleWebhook(@Req() req: Request) {
    const contentType = req.get('Content-Type') || 'application/json';
    const rawBody = req.body;
    console.log('Webhook received:', { rawBody, contentType, headers: req.headers }); // Qo‘shimcha log

    if (!rawBody) {
      console.warn('Webhook tanasi bo‘sh');
      return { ok: true, error: 'Webhook tanasi bo‘sh' };
    }

    return this.paymentsService.handleCallback(rawBody, contentType);
  }

  @Get('status/:requestId')
  async checkPaymentStatus(@Param('requestId') requestId: string) {
    return this.paymentsService.checkPaymentStatus(requestId);
  }
}