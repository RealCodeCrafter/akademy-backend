import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDocument } from './entities/user-document.entity';
import { UsersService } from '../user/user.service';
import { unlink, writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'fs';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(UserDocument)
    private documentRepository: Repository<UserDocument>,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {}

  async uploadDocument(userId: number, file: Express.Multer.File) {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException(`Foydalanuvchi ID ${userId} bilan topilmadi`);
    }

    const uploadsPath = this.configService.get<string>('UPLOADS_PATH') ?? join(process.cwd(), 'Uploads');
    
    // Uploads jildini yaratish, agar mavjud bo‘lmasa
    if (!existsSync(uploadsPath)) {
      mkdirSync(uploadsPath, { recursive: true });
    }

    // Faylni diskka asinxron yozamiz
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`;
    const filePath = join(uploadsPath, fileName);

    try {
      await writeFile(filePath, file.buffer); // memoryStorage'dan keladi
    } catch (err) {
      throw new BadRequestException(`Faylni saqlashda xato: ${err.message}`);
    }

    const baseUrl = this.configService.get<string>('BASE_URL') || 'https://akademy-backend-production.up.railway.app';

    const document = this.documentRepository.create({
      fileName: file.originalname,
      fileUrl: `${baseUrl}/uploads/${fileName}`,
      user,
    });

    const savedDoc = await this.documentRepository.save(document);

    return {
      id: savedDoc.id,
      fileName: savedDoc.fileName,
      fileUrl: savedDoc.fileUrl,
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
      fileUrl: doc.fileUrl,
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
      fileUrl: doc.fileUrl,
      createdAt: doc.createdAt,
      user: {
        id: doc.user?.id,
        username: doc.user?.username,
        email: doc.user?.email,
      },
    }));
  }

  async deleteDocument(docId: number) {
    const document = await this.documentRepository.findOne({
      where: { id: docId },
    });

    if (!document) {
      throw new NotFoundException(`Hujjat ID ${docId} topilmadi`);
    }

    if (!document.fileUrl) {
      throw new NotFoundException(`Hujjatning fayl manzili topilmadi`);
    }

    const fileName = document.fileUrl.split('/').pop();
    if (!fileName) {
      throw new NotFoundException(`Fayl nomi aniqlanmadi`);
    }

    const uploadsPath = this.configService.get<string>('UPLOADS_PATH') ?? join(process.cwd(), 'Uploads');
    const filePath = join(uploadsPath, fileName);

    if (existsSync(filePath)) {
      try {
        await unlink(filePath);
      } catch (err) {
        console.warn(`Fayl o‘chirilmadi: ${filePath}`, err.message);
      }
    }

    await this.documentRepository.remove(document);

    return { message: 'Hujjat muvaffaqiyatli o‘chirildi' };
  }
}