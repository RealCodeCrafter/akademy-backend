import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from '../auth/dto/create-user.dto';
import { UpdateUserDto } from '../auth/dto/update-user.dto';
import { RequestsService } from '../request/request.service';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  private algorithm = 'aes-256-cbc';
  private key = crypto.scryptSync(process.env.PASSWORD_SECRET || 'secret_key', 'salt', 32);
  private iv = Buffer.alloc(16, 0);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private requestsService: RequestsService,
  ) {}

  private validateId(id: number) {
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException("ID raqam bo'lishi va musbat bo'lishi kerak");
    }
  }

  public encryptPassword(password: string): string {
    const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  public decryptPassword(encrypted: string): string {
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, this.iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.usersRepository.findOne({ where: { username: createUserDto.username } });
    if (existingUser) throw new BadRequestException('Bu username bilan foydalanuvchi allaqachon mavjud');
    const encryptedPassword = this.encryptPassword(createUserDto.password);
    const user = this.usersRepository.create({ ...createUserDto, password: encryptedPassword, role: createUserDto.role || 'user' });
    return this.usersRepository.save(user);
  }

  async createFromRequest(requestId: number, createUserDto: CreateUserDto) {
    this.validateId(requestId);
    const request = await this.requestsService.findOne(requestId);
    if (!request) throw new NotFoundException(`Zayavka ID ${requestId} bilan topilmadi`);
    if (request.status !== 'accepted') throw new BadRequestException('Faqat qabul qilingan zayavkadan foydalanuvchi yaratish mumkin');
    const existingUser = await this.usersRepository.findOne({ where: { username: createUserDto.username } });
    if (existingUser) throw new BadRequestException('Bu username bilan foydalanuvchi allaqachon mavjud');
    const encryptedPassword = this.encryptPassword(createUserDto.password);
    const user = this.usersRepository.create({
      ...createUserDto,
      password: encryptedPassword,
      email: createUserDto.email || request.parentEmail,
      parentName: request.parentName,
      parentPhone: request.parentPhone,
    });
    const savedUser = await this.usersRepository.save(user);
    await this.requestsService.update(requestId, { user: savedUser });
    return savedUser;
  }

  async createAdminUser(createUserDto: CreateUserDto) {
    const existingUser = await this.usersRepository.findOne({ where: [{ username: createUserDto.username }, { email: createUserDto.email }] });
    if (existingUser) throw new BadRequestException('Bu username yoki email bilan foydalanuvchi allaqachon mavjud');
    const encryptedPassword = this.encryptPassword(createUserDto.password);
    const user = this.usersRepository.create({ ...createUserDto, password: encryptedPassword, role: createUserDto.role || 'user' });
    return this.usersRepository.save(user);
  }

  async findOne(id: number) {
    this.validateId(id);
    const user = await this.usersRepository.findOne({
      where: { id },
      select: ['id', 'username', 'email', 'role', 'parentName', 'parentPhone', 'parentSurname', 'parentPatronymic', 'parentAddress', 'studentName', 'studentSurname', 'studentPatronymic', 'studentAddress', 'studentBirthDate', 'createdAt'],
      relations: ['purchases', 'requests', 'userCourses', 'documents'],
    });
    if (!user) throw new NotFoundException(`Foydalanuvchi ID ${id} bilan topilmadi`);
    return { ...user, password: this.decryptPassword(user.password) };
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [users, total] = await this.usersRepository.findAndCount({
      where: { role: 'user' },
      select: ['id', 'username', 'email', 'role', 'parentName', 'parentPhone', 'parentSurname', 'parentPatronymic', 'parentAddress', 'studentName', 'studentSurname', 'studentPatronymic', 'studentAddress', 'studentBirthDate', 'createdAt'],
      relations: {
        purchases: true,
        requests: true,
        userCourses: true,
        documents: true,
      },
      order: { createdAt: 'ASC' },
      skip,
      take: limit,
    });
    return {
      data: users.map(user => ({
        ...user,
        password: this.decryptPassword(user.password),
        documents: user.documents.map(doc => ({
          id: doc.id,
          fileName: doc.fileName,
          // fileData ni qaytarmaymiz
        })),
      })),
      total,
      page,
      limit,
    };
  }

  async findByUsername(username: string) {
    if (!username) throw new BadRequestException("Username bo'sh bo'lmasligi kerak");
    return this.usersRepository.findOne({ where: { username } });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    this.validateId(id);
    const user = await this.findOne(id);
    if (updateUserDto.password) updateUserDto.password = this.encryptPassword(updateUserDto.password);
    await this.usersRepository.update(id, updateUserDto);
    return this.findOne(id);
  }

  async delete(id: number) {
    this.validateId(id);
    await this.findOne(id); // Foydalanuvchi mavjudligini tekshirish
    await this.usersRepository.delete(id);
    return { message: `Foydalanuvchi ID ${id} o'chirildi` };
  }

  async findByUsernameOrEmail(username: string, email: string) {
    if (!username && !email) throw new BadRequestException('Username yoki email kiritilishi kerak');
    return this.usersRepository.findOne({ where: [{ username }, { email }] });
  }
}