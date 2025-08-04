import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Request } from './entities/request.entity';
import { RequestsController } from './request.controller';
import { RequestsService } from './request.service';
import { UsersModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Request]),
    forwardRef(() => UsersModule), 
  ],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService]
})
export class RequestsModule {}
