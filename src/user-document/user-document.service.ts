import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDocument } from './entities/user-document.entity';
import { UsersService } from '../user/user.service';
import { Response } from 'express';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(UserDocument)
    private documentRepository: Repository<UserDocument>,
    private usersService: UsersService,
  ) {}

  async uploadDocument(userId: number, file: Express.Multer.File) {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException(`Foydalanuvchi ID ${userId} topilmadi`);
    }

    const document = this.documentRepository.create({
      fileName: file.originalname,
      fileData: file.buffer,
      user,
    });

    const savedDoc = await this.documentRepository.save(document);

    return {
      id: savedDoc.id,
      fileName: savedDoc.fileName,
      createdAt: savedDoc.createdAt,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };
  }

  async findUserDocuments(userId: number) {
    const documents = await this.documentRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'ASC' },
    });

    return documents.map(doc => ({
      id: doc.id,
      fileName: doc.fileName,
      createdAt: doc.createdAt,
    }));
  }

  async findAll() {
    const documents = await this.documentRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    return documents.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      createdAt: doc.createdAt,
      user: {
        id: doc.user?.id,
        username: doc.user?.username,
        email: doc.user?.email,
      },
    }));
  }

  async getFileBuffer(docId: number): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const document = await this.documentRepository.findOne({ where: { id: docId } });
    if (!document) {
      throw new NotFoundException(`Hujjat ID ${docId} topilmadi`);
    }

    // MIME turini original fayl nomidan olish uchun:
    const extension = document.fileName.split('.').pop()?.toLowerCase();
    let mimeType = 'application/octet-stream'; // default

    if (extension) {
      if (['pdf'].includes(extension)) mimeType = 'application/pdf';
      else if (['doc'].includes(extension)) mimeType = 'application/msword';
      else if (['docx'].includes(extension)) mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (['jpg', 'jpeg'].includes(extension)) mimeType = 'image/jpeg';
      else if (['png'].includes(extension)) mimeType = 'image/png';
    }

    return { buffer: document.fileData, fileName: document.fileName, mimeType };
  }

  async deleteDocument(docId: number) {
    const document = await this.documentRepository.findOne({ where: { id: docId } });
    if (!document) {
      throw new NotFoundException(`Hujjat ID ${docId} topilmadi`);
    }

    await this.documentRepository.remove(document);
    return { message: 'Hujjat muvaffaqiyatli o‘chirildi' };
  }
}
