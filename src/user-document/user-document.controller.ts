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
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { extname, join } from 'path';
import { existsSync } from 'fs';
import { ConfigService } from '@nestjs/config';

@Controller('documents')
export class DocumentsController {
  constructor(
    private documentsService: DocumentsService,
    private configService: ConfigService,
  ) {}

  @Post(':userId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
        if (!allowedTypes.includes(extname(file.originalname).toLowerCase())) {
          return cb(
            new Error('Faqat PDF, DOC, DOCX, JPG, JPEG, PNG fayllar ruxsat etiladi'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadDocument(
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

  @Get()
  findAllDocuments() {
    return this.documentsService.findAll();
  }

  @Get('file/:fileName')
  getFile(@Param('fileName') fileName: string, @Res() res: Response) {
    const uploadsPath = this.configService.get<string>('UPLOADS_PATH') ?? join(process.cwd(), 'Uploads');
    const filePath = join(uploadsPath, fileName);

    if (!existsSync(filePath)) {
      throw new NotFoundException(`Fayl topilmadi: ${fileName}`);
    }

    return res.sendFile(filePath);
  }

  @Delete(':docId')
  deleteDocument(@Param('docId') docId: string) {
    return this.documentsService.deleteDocument(+docId);
  }
}