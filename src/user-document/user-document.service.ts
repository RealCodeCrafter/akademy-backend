import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDocument } from './entities/user-document.entity';
import { UsersService } from '../user/user.service';

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

  const document = this.documentRepository.create({
    fileName: file.originalname,
    fileUrl: `/uploads/${file.filename}`,
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
}
