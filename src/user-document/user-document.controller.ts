import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  Get,
  Delete,
  BadRequestException,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './user-document.service';
import { diskStorage } from 'multer';
import { Response } from 'express';
import { extname, join } from 'path';
import { existsSync } from 'fs';

@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post(':userId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(
            null,
            `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`,
          );
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          '.pdf',
          '.doc',
          '.docx',
          '.jpg',
          '.jpeg',
          '.png',
        ];
        if (
          !allowedTypes.includes(extname(file.originalname).toLowerCase())
        ) {
          return cb(
            new Error(
              'Faqat PDF, DOC, DOCX, JPG, JPEG, PNG fayllar ruxsat etiladi',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadDocument(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Fayl yuklanmadi');
    }
    return this.documentsService.uploadDocument(+userId, file);
  }

  @Get(':userId/documents')
  findUserDocuments(@Param('userId') userId: string) {
    return this.documentsService.findUserDocuments(+userId);
  }
  
  @Get('file/:fileName')
  getFile(@Param('fileName') fileName: string, @Res() res: Response) {
    const filePath = join(process.cwd(), 'uploads', fileName);

    if (!existsSync(filePath)) {
      throw new NotFoundException('Fayl topilmadi');
    }

    return res.sendFile(filePath); // sendFile endi ishlaydi
  }

  @Delete(':docId')
  deleteDocument(@Param('docId') docId: string) {
    return this.documentsService.deleteDocument(+docId);
  }
}
