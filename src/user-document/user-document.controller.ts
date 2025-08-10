import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  Get,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './user-document.service';
import { diskStorage } from 'multer';
import { extname, join } from 'path';

@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post(':userId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
        if (!allowed.includes(extname(file.originalname).toLowerCase())) {
          return cb(new Error('Faqat PDF, DOC, DOCX, JPG, JPEG, PNG fayllar ruxsat etiladi'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadDocument(@Param('userId') userId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');
    return await this.documentsService.uploadDocument(+userId, file);
  }

  @Get(':userId')
  async findUserDocuments(@Param('userId') userId: string) {
    return await this.documentsService.findUserDocuments(+userId);
  }

  @Get()
  async findAll() {
    return await this.documentsService.findAll();
  }

  @Delete(':docId')
  async deleteDocument(@Param('docId') docId: string) {
    return await this.documentsService.deleteDocument(+docId);
  }
}
