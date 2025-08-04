import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Purchase } from './entities/purchase.entity';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { UsersModule } from '../user/user.module';
import { CoursesModule } from '../course/course.module';

@Module({
  imports: [TypeOrmModule.forFeature([Purchase]), UsersModule, CoursesModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}