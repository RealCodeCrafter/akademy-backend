import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../user/user.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(createAuthDto: CreateAuthDto) {
    const user = await this.usersService.create({
      ...createAuthDto,
      role: createAuthDto.role || 'user',
    });
    const payload = { username: user.username, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      message: 'Foydalanuvchi muvaffaqiyatli ro‘yxatdan o‘tdi',
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByUsername(loginDto.username);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Noto‘g‘ri parol');
    }
    const payload = { username: user.username, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      message: 'Kirish muvaffaqiyatli amalga oshirildi',
    };
  }

  async addAdmin(createAuthDto: CreateAuthDto) {
    const user = await this.usersService.create({
      ...createAuthDto,
      role: 'admin',
    });
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      message: 'Admin muvaffaqiyatli qo‘shildi',
    };
  }
}