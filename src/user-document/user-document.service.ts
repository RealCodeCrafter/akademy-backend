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
    if (!user) throw new NotFoundException(`Foydalanuvchi ID ${userId} topilmadi`);

    const baseUrl = process.env.BASE_URL || 'http://localhost:7000';

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
      user: { id: user.id, username: user.username, email: user.email },
    };
  }

  async findUserDocuments(userId: number) {
    const docs = await this.documentRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });

    return docs.map(d => ({
      id: d.id,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      createdAt: d.createdAt,
    }));
  }

  async findAll() {
    const docs = await this.documentRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    return docs.map(d => ({
      id: d.id,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      createdAt: d.createdAt,
      user: { id: d.user?.id, username: d.user?.username, email: d.user?.email },
    }));
  }

  async deleteDocument(docId: number) {
    const doc = await this.documentRepository.findOne({ where: { id: docId } });
    if (!doc) throw new NotFoundException(`Hujjat ID ${docId} topilmadi`);

    const fileName = doc.fileUrl.split('/').pop();
    if (fileName) {
      const filePath = join(process.cwd(), 'uploads', fileName);
      await unlink(filePath).catch(() => {});
    }

    await this.documentRepository.remove(doc);
    return { message: 'Hujjat o‘chirildi' };
  }
}
