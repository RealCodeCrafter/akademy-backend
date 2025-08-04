import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Purchase } from './entities/purchase.entity';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UsersService } from '../user/user.service';
import { CoursesService } from '../course/course.service';
import { CategoryService } from '../category/category.service';
import { Category } from '../category/entities/cateogry.entity';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase)
    private purchasesRepository: Repository<Purchase>,
    private usersService: UsersService,
    private coursesService: CoursesService,
    private categoryService: CategoryService,
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

    if (!createPurchaseDto.categoryId) {
      throw new NotFoundException('Kategoriya ID kiritilishi shart');
    }

    const category: Category | null = await this.categoryService.findOne(createPurchaseDto.categoryId);
    if (!category) {
      throw new NotFoundException(`Kategoriya ID ${createPurchaseDto.categoryId} bilan topilmadi`);
    }

    if (!course.categories.some(cat => cat.id === category.id)) {
      throw new NotFoundException(`Kurs ${course.id} da kategoriya ${category.id} topilmadi`);
    }

    const purchase = this.purchasesRepository.create({
      purchaseDate: new Date(),
      user,
      course,
      category,
      price: category.price,
    });

    return this.purchasesRepository.save(purchase);
  }

  async findAll() {
    return this.purchasesRepository.find({
      relations: ['user', 'course', 'category'],
      order: { createdAt: 'ASC' },
    });
  }

  async findByUser(userId: number) {
    return this.purchasesRepository.find({
      where: { user: { id: userId } },
      relations: ['course', 'category'],
      order: { createdAt: 'ASC' },
    });
  }

  async delete(id: number) {
    const purchase = await this.purchasesRepository.findOne({ where: { id } });
    if (!purchase) {
      throw new NotFoundException(`Xarid ID ${id} bilan topilmadi`);
    }
    await this.purchasesRepository.delete(id);
    return { message: `Xarid ID ${id} o'chirildi` };
  }
}