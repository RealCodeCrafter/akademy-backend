import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentsController } from './payment.controller';
import { PaymentsService } from './payment.service';
import { UsersModule } from '../user/user.module';
import { CoursesModule } from '../course/course.module';
import { CategoryModule } from '../category/category.module';
import { PurchasesModule } from '../purchases/purchases.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    UsersModule,
    CoursesModule,
    CategoryModule,
    PurchasesModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentModule {}