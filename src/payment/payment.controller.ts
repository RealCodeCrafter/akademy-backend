import { Controller, Post, Body, Req, UseGuards, HttpCode, All, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
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
    if (!userId) throw new HttpException('Foydalanuvchi aniqlanmadi', HttpStatus.UNAUTHORIZED);
    return this.paymentsService.startPayment(createPaymentDto, userId);
  }

  @UseGuards(AuthGuard)
  @Post('dolyame/:orderId/commit')
  async commitDolyameOrder(@Param('orderId') orderId: string, @Body() body: { amount: number; items: any[] }) {
    return this.paymentsService.commitDolyameOrder(orderId, body.amount, body.items);
  }

  @UseGuards(AuthGuard)
  @Post('dolyame/:orderId/cancel')
  async cancelDolyameOrder(@Param('orderId') orderId: string) {
    return this.paymentsService.cancelDolyameOrder(orderId);
  }

  @UseGuards(AuthGuard)
  @Post('dolyame/:orderId/refund')
  async refundDolyameOrder(@Param('orderId') orderId: string, @Body() body: { amount: number; items: any[] }) {
    return this.paymentsService.refundDolyameOrder(orderId, body.amount, body.items);
  }

  @UseGuards(AuthGuard)
  @Get('dolyame/:orderId/info')
  async getDolyameOrderInfo(@Param('orderId') orderId: string) {
    return this.paymentsService.getDolyameOrderInfo(orderId);
  }

  @UseGuards(AuthGuard)
  @Post('dolyame/:orderId/complete-delivery')
  async completeDolyameDelivery(@Param('orderId') orderId: string, @Body() body: { amount: number; items: any[] }) {
    return this.paymentsService.completeDolyameDelivery(orderId, body.amount, body.items);
  }

  @All('webhook')
  @HttpCode(200)
  async handleTochkaWebhook(@Body() body: any, @Req() req: Request) {
    const contentType = req.get('Content-Type') || 'application/json';
    return this.paymentsService.handleTochkaWebhook(body, contentType);
  }

  @All('webhook/dolyame')
  @HttpCode(200)
  async handleDolyameWebhook(@Body() body: any, @Req() req: Request) {
    return this.paymentsService.handleDolyameWebhook(body, req);
  }

  @Get('webhook/dolyame')
  @HttpCode(200)
  async verifyDolyameWebhook(@Req() req: Request) {
    const verificationHeader = req.headers['x-dolyame-webhook-verification'];
    if (verificationHeader) {
      return { verification: verificationHeader };
    }
    throw new HttpException('Verification header topilmadi', HttpStatus.BAD_REQUEST);
  }

  @Get('status/:provider/:requestId')
  async checkPaymentStatus(@Param('provider') provider: string, @Param('requestId') requestId: string) {
    return this.paymentsService.checkPaymentStatus(requestId, provider);
  }
}




