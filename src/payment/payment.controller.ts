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

  // Старт платежа: возвращаем ссылку для фронта
  @UseGuards(AuthGuard)
  @Post('start')
  async startPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('Пользователь не авторизован');

    try {
      return await this.paymentsService.startPayment(createPaymentDto, userId);
    } catch (err) {
      this.logger.error(`Ошибка старта платежа: ${err.message}`);
      throw err;
    }
  }

  // Webhook от банка
  @Post('callback')
  async handleCallback(@Body() body: any) {
    const callbackData = typeof body === 'string' ? body : body?.callbackData;

    if (!callbackData) throw new BadRequestException('callbackData отсутствует');

    try {
      return await this.paymentsService.handleCallback(callbackData);
    } catch (err) {
      this.logger.error(`Ошибка webhook: ${err.message}`);
      throw err;
    }
  }
}