import { Controller, Post, Param, UploadedFile, UseInterceptors, Get } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './user-document.service';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post(':userId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
        if (!allowedTypes.includes(extname(file.originalname).toLowerCase())) {
          return cb(new Error('Faqat PDF, DOC, DOCX, JPG, JPEG, PNG fayllar ruxsat etiladi'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadDocument(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.uploadDocument(+userId, file);
  }

  @Get(':userId/documents')
  findUserDocuments(@Param('userId') userId: string) {
    return this.documentsService.findUserDocuments(+userId);
  }
}
