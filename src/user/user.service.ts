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

  private encryptPassword(password: string): string {
    const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  private decryptPassword(encrypted: string): string {
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
    const request = await this.requestsService.findOne(requestId);
    if (request.status !== 'accepted') throw new NotFoundException('Faqat qabul qilingan zayavkadan foydalanuvchi yaratish mumkin');
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
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['purchases', 'requests', 'userCourses', 'documents'],
      order: { createdAt: 'ASC' },
    });
    if (!user) throw new NotFoundException(`Foydalanuvchi ID ${id} bilan topilmadi`);
    return { ...user, password: this.decryptPassword(user.password) };
  }

  async findByUsername(username: string) {
    return this.usersRepository.findOne({ where: { username } });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.findOne(id);
    if (updateUserDto.password) updateUserDto.password = this.encryptPassword(updateUserDto.password);
    await this.usersRepository.update(id, updateUserDto);
    return this.findOne(id);
  }

  async findAll() {
    return this.usersRepository.find({
      where: { role: 'user' },
      relations: ['purchases', 'requests', 'userCourses', 'documents'],
      order: { createdAt: 'ASC' },
    });
  }

  async delete(id: number) {
    const user = await this.findOne(id);
    await this.usersRepository.delete(id);
    return { message: `Foydalanuvchi ID ${id} o'chirildi` };
  }

  async findByUsernameOrEmail(username: string, email: string) {
    return this.usersRepository.findOne({ where: [{ username }, { email }] });
  }
}
