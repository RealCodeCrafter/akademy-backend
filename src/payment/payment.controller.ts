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
    this.logger.log(
      `To'lov boshlash so'rovi: userId=${req.user?.sub}, courseId=${createPaymentDto.courseId}, categoryId=${createPaymentDto.categoryId}, levelId=${createPaymentDto.levelId}`,
    );

    const userId = req.user?.sub;
    if (!userId) {
      this.logger.error(
        'Foydalanuvchi aniqlanmadi: Auth tokeni noto‘g‘ri yoki yo‘q',
      );
      throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    }

    try {
      const result = await this.paymentsService.startPayment(
        createPaymentDto,
        userId,
      );
      this.logger.log(
        `To'lov muvaffaqiyatli boshlandi: paymentId=${result.paymentId}, transactionId=${result.transactionId}`,
      );
      return result;
    } catch (err) {
      this.logger.error(`To'lov boshlashda xato: ${err.message}`);
      throw err;
    }
  }

  @Post('webhook')
  async handleWebhook(@Body() payload: any, @Req() req: Request) {
    this.logger.log(`Webhook so'rovi keldi: ${JSON.stringify(payload)}`);

    try {
      const result = await this.paymentsService.handleWebhook(payload);
      this.logger.log(
        `Webhook muvaffaqiyatli qayta ishlendi: result=${JSON.stringify(result)}`,
      );
      return result;
    } catch (err) {
      this.logger.error(`Webhook qayta ishlashda xato: ${err.message}`);
      throw err;
    }
  }
}