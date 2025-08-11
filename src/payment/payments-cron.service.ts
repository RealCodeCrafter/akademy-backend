import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Payment } from './entities/payment.entity';

@Injectable()
export class PaymentsCronService {
  private readonly logger = new Logger(PaymentsCronService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {}

  // Очистка pending платежей старше 24 часов (включая фейковые)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanPendingPayments() {
    const thresholdDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      const oldPayments = await this.paymentRepository.find({
        where: { status: 'pending', createdAt: LessThan(thresholdDate) },
      });

      if (oldPayments.length > 0) {
        await this.paymentRepository.delete({ status: 'pending', createdAt: LessThan(thresholdDate) });
        this.logger.log(`Очищено ${oldPayments.length} старых pending платежей`);
      } else {
        this.logger.log('Нет старых pending платежей');
      }
    } catch (err) {
      this.logger.error(`Ошибка очистки: ${err.message}`);
    }
  }
}