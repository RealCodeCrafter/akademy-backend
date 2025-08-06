import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserDocument } from './entities/user-document.entity';
import { DocumentsController } from './user-document.controller';
import { DocumentsService } from './user-document.service';
import { UsersModule } from '../user/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserDocument]),
  forwardRef(() => UsersModule)
],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class UserDocumentModule {}