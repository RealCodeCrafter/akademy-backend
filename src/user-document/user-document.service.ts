import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDocument } from './entities/user-document.entity';
import { UsersService } from '../user/user.service';
import { unlink } from 'fs/promises';
import { join } from 'path';

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
      throw new NotFoundException(`Foydalanuvchi ID ${userId} bilan topilmadi`);
    }

    const baseUrl = process.env.BASE_URL || 'https://akademy-backend-production.up.railway.app';

    const document = this.documentRepository.create({
      fileName: file.originalname,
      fileUrl: `${baseUrl}/uploads/${file.filename}`,
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

  // Fayl nomini olish
  const fileName = document.fileUrl.split('/').pop();
  if (!fileName) {
    throw new NotFoundException(`Fayl nomi aniqlanmadi`);
  }

  const filePath = join(__dirname, '..', '..', 'uploads', fileName);

  try {
    await unlink(filePath);
  } catch (err) {
    console.warn(`Fayl o‘chirilmadi: ${filePath}`, err.message);
  }

  await this.documentRepository.remove(document);

  return { message: 'Hujjat muvaffaqiyatli o‘chirildi' };
}

}
