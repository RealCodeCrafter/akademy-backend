import { Controller, Post, Body, Req, UseGuards, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AuthGuard } from '../auth/auth.guard';
import { Logger } from '@nestjs/common';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: { sub: number; username: string; role: string };
}

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private paymentsService: PaymentsService) {}

  @UseGuards(AuthGuard)
  @Post('start')
  async startPayment(@Body() createPaymentDto: CreatePaymentDto, @Req() req: AuthenticatedRequest) {
    this.logger.log(`To'lov boshlash so'rovi: userId=${req.user?.sub}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, degree=${createPaymentDto.degree}`);
    const userId = req.user?.sub;
    if (!userId) {
      this.logger.error('Foydalanuvchi aniqlanmadi: Auth tokeni noto‘g‘ri yoki yo‘q');
      throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    }
    return this.paymentsService.startPayment(createPaymentDto, userId);
  }

  @Post('callback')
  async handleCallback(@Body() body: any) {
    this.logger.log(`Webhook so'rovi keldi: body=${JSON.stringify(body)}`);
    const callbackData = JSON.stringify(body);
    if (!callbackData) {
      this.logger.error('callbackData parametri taqdim etilmadi');
      throw new BadRequestException('callbackData parametri taqdim etilmadi');
    }
    const result = await this.paymentsService.handleCallback(callbackData);
    this.logger.log(`PaymentsService.handleCallback javobi: ${JSON.stringify(result)}`);
    return result;
  }
}