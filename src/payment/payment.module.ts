import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { Payment } from './entities/payment.entity';
import { PaymentsController } from './payment.controller';
import { PaymentsService } from './payment.service';
import { UsersModule } from '../user/user.module';
import { CoursesModule } from '../course/course.module';
import { CategoryModule } from '../category/category.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { PaymentsCronService } from './payments-cron.service';
import { LevelModule } from 'src/level/level.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Payment]),
    UsersModule,
    CoursesModule,
    CategoryModule,
    PurchasesModule,
    LevelModule
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsCronService],
})
export class PaymentModule {}