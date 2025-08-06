import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersController } from './user.controller';
import { UsersService } from './user.service';
import { RequestsModule } from '../request/request.module';
import { UserCourseModule } from '../user-course/user-course.module';
import { UserDocumentModule } from '../user-document/user-document.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => UserDocumentModule),
    forwardRef(() => RequestsModule),
    UserCourseModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}