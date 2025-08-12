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
  Header,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './user-document.service';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { extname } from 'path';

@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post(':userId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
        if (!allowedTypes.includes(extname(file.originalname).toLowerCase())) {
          return cb(
            new BadRequestException('Faqat PDF, DOC, DOCX, JPG, JPEG, PNG fayllar ruxsat etiladi'),
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
  @Header('Content-Type', 'application/json; charset=utf-8')
  findUserDocuments(@Param('userId') userId: string) {
    return this.documentsService.findUserDocuments(+userId);
  }

  @Get()
  @Header('Content-Type', 'application/json; charset=utf-8')
  findAllDocuments() {
    return this.documentsService.findAll();
  }

  @Get('file/:docId')
  async getFile(@Param('docId') docId: string, @Res() res: Response) {
    try {
      const { buffer, fileName, mimeType } = await this.documentsService.getFileBuffer(+docId);
      const encodedFileName = encodeURIComponent(fileName);
      res.set({
        'Content-Type': `${mimeType}; charset=utf-8`,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFileName}`,
      });
      res.send(buffer);
    } catch (err) {
      if (err.status === 404) {
        throw new NotFoundException(err.message);
      }
      throw new BadRequestException(err.message);
    }
  }

  @Delete(':docId')
  deleteDocument(@Param('docId') docId: string) {
    return this.documentsService.deleteDocument(+docId);
  }
}