import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDocument } from './entities/user-document.entity';
import { UsersService } from '../user/user.service';
import * as iconv from 'iconv-lite';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(UserDocument)
    private documentRepository: Repository<UserDocument>,
    private usersService: UsersService,
  ) {}

  // Fayl nomini to‘g‘rilovchi yordamchi funksiya
  private fixFileName(fileName: string): string {
    // Agar faqat normal belgilar bo‘lsa — o‘z holicha
    if (/^[\w\s\p{L}\p{N}().,_-]+$/u.test(fileName)) {
      return fileName;
    }
    // Aks holda latin1 → utf8
    return iconv.decode(Buffer.from(fileName, 'latin1'), 'utf8');
  }

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
      fileName: this.fixFileName(savedDoc.fileName),
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
      fileName: this.fixFileName(doc.fileName),
      createdAt: doc.createdAt,
    }));
  }

  async findAll() {
    const documents = await this.documentRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    return documents.map(doc => ({
      id: doc.id,
      fileName: this.fixFileName(doc.fileName),
      createdAt: doc.createdAt,
      user: {
        id: doc.user?.id,
        username: doc.user?.username,
        email: doc.user?.email,
      },
    }));
  }

  async getFileBuffer(
    docId: number,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const document = await this.documentRepository.findOne({ where: { id: docId } });
    if (!document) {
      throw new NotFoundException(`Hujjat ID ${docId} topilmadi`);
    }

    const extension = document.fileName.split('.').pop()?.toLowerCase();
    let mimeType = 'application/octet-stream';

    if (extension) {
      if (extension === 'pdf') mimeType = 'application/pdf';
      else if (extension === 'doc') mimeType = 'application/msword';
      else if (extension === 'docx')
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (['jpg', 'jpeg'].includes(extension)) mimeType = 'image/jpeg';
      else if (extension === 'png') mimeType = 'image/png';
    }

    return {
      buffer: document.fileData,
      fileName: this.fixFileName(document.fileName),
      mimeType,
    };
  }

  async getDocumentFileName(docId: number) {
    const document = await this.documentRepository.findOne({
      where: { id: docId },
      select: ['id', 'fileName'],
    });

    if (!document) {
      throw new NotFoundException(`Hujjat ID ${docId} topilmadi`);
    }

    return {
      id: document.id,
      fileName: this.fixFileName(document.fileName),
    };
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
