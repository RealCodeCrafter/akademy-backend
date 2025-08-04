import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Purchase } from './entities/purchase.entity';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UsersService } from '../user/user.service';
import { CoursesService } from '../course/course.service';


@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase)
    private purchasesRepository: Repository<Purchase>,
    private usersService: UsersService,
    private coursesService: CoursesService,
  ) {}

  async create(createPurchaseDto: CreatePurchaseDto) {
    const user = await this.usersService.findOne(createPurchaseDto.userId);
    if (!user) {
      throw new NotFoundException(`Foydalanuvchi ID ${createPurchaseDto.userId} bilan topilmadi`);
    }

    const course = await this.coursesService.findOne(createPurchaseDto.courseId);
    if (!course) {
      throw new NotFoundException(`Kurs ID ${createPurchaseDto.courseId} bilan topilmadi`);
    }

    const purchase = new Purchase();
    purchase.user = user;
    purchase.course = course;
    purchase.purchaseDate = new Date();
    return this.purchasesRepository.save(purchase);
  }

  async findByUser(userId: number) {
    return this.purchasesRepository.find({ where: { user: { id: userId } }, relations: ['course'] });
  }

  async findAll() {
    return this.purchasesRepository.find({ relations: ['user', 'course'] });
  }
}