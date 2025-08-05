import { Controller, Post, Body, Req, UseGuards, UnauthorizedException, BadRequestException, RawBodyRequest} from '@nestjs/common';
import { PaymentsService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AuthGuard } from '../auth/auth.guard';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: { sub: number; username: string; role: string };
}

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @UseGuards(AuthGuard)
  @Post('start')
  startPayment(@Body() createPaymentDto: CreatePaymentDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    }
    return this.paymentsService.startPayment(createPaymentDto, userId);
  }

  @Post('callback')
handleCallback(@Req() req: RawBodyRequest<Request>) {
  const callbackData = req.rawBody?.toString();
  if (!callbackData) {
    throw new BadRequestException('callbackData parametri taqdim etilmadi');
  }
  return this.paymentsService.handleCallback(callbackData);
}
}