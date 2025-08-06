import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Purchase } from './entities/purchase.entity';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UsersService } from '../user/user.service';
import { CoursesService } from '../course/course.service';
import { CategoryService } from '../category/category.service';
import { UserCourseService } from '../user-course/user-course.service';
import { LevelService } from '../level/level.service';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase)
    private purchasesRepository: Repository<Purchase>,
    private usersService: UsersService,
    private coursesService: CoursesService,
    private categoryService: CategoryService,
    private userCourseService: UserCourseService,
    private levelService: LevelService,
  ) {}

  async create(createPurchaseDto: CreatePurchaseDto, userId: number) {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException(`Foydalanuvchi topilmadi`);
    }

    const course = await this.coursesService.findOne(createPurchaseDto.courseId);
    if (!course) {
      throw new NotFoundException(`Kurs topilmadi`);
    }

    const category = await this.categoryService.findOne(createPurchaseDto.categoryId);
    if (!category) {
      throw new NotFoundException(`Kategoriya topilmadi`);
    }

    const isCategoryLinked = course.categories?.some(cat => cat.id === category.id);
    if (!isCategoryLinked) {
      throw new NotFoundException(`Ushbu kursga bu kategoriya tegishli emas`);
    }

    let degree: string;
    if (createPurchaseDto.levelId) {
      const level = await this.levelService.findOne(createPurchaseDto.levelId);
      if (!level) {
        throw new NotFoundException(`Daraja topilmadi`);
      }
      const isLevelLinked = await this.categoryService.isLevelLinkedToCategory(createPurchaseDto.categoryId, createPurchaseDto.levelId);
      if (!isLevelLinked) {
        throw new BadRequestException(`Ushbu daraja bu kategoriyaga tegishli emas`);
      }
      degree = level.name;
    } else {
      degree = category.name; // Exams kabi kategoriyalar uchun
    }

    const existingUserCourse = await this.userCourseService.findUserCourse(userId, createPurchaseDto.courseId);
    if (existingUserCourse && existingUserCourse.expiresAt > new Date()) {
      throw new BadRequestException(`Foydalanuvchi ushbu kursga allaqachon ega va muddati hali tugamagan`);
    }

    const purchase = this.purchasesRepository.create({
      purchaseDate: new Date(),
      price: category.price,
      degree,
      status: 'pending',
      user,
      course,
      category,
    });

    const saved = await this.purchasesRepository.save(purchase);

    return {
      id: saved.id,
      purchaseDate: saved.purchaseDate,
      price: saved.price,
      createdAt: saved.createdAt,
      degree: saved.degree,
      status: saved.status,
      course: {
        id: course.id,
        name: course.name,
      },
      category: {
        id: category.id,
        name: category.name,
        price: category.price,
      },
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        parentName: user.parentName,
        parentPhone: user.parentPhone,
      },
    };
  }

  async confirmPurchase(purchaseId: number) {
    const purchase = await this.purchasesRepository.findOne({
      where: { id: purchaseId },
      relations: ['user', 'course', 'category'],
    });
    if (!purchase) {
      throw new NotFoundException(`Xarid topilmadi`);
    }

    if (!purchase.user || !purchase.course || !purchase.category) {
      throw new NotFoundException(`Xarid ma'lumotlari to'liq emas`);
    }

    purchase.status = 'paid';
    const saved = await this.purchasesRepository.save(purchase);

    const existingUserCourse = await this.userCourseService.findUserCourse(purchase.user.id, purchase.course.id);
    if (!existingUserCourse || existingUserCourse.expiresAt <= new Date()) {
      await this.userCourseService.assignCourseToUser(purchase.user.id, purchase.course.id, purchase.degree);
    }

    return {
      id: saved.id,
      purchaseDate: saved.purchaseDate,
      price: saved.price,
      createdAt: saved.createdAt,
      degree: saved.degree,
      status: saved.status,
      course: {
        id: saved.course.id,
        name: saved.course.name,
      },
      category: {
        id: saved.category.id,
        name: saved.category.name,
        price: saved.category.price,
      },
      user: {
        id: saved.user.id,
        username: saved.user.username,
        email: saved.user.email,
        parentName: saved.user.parentName,
        parentPhone: saved.user.parentPhone,
      },
    };
  }

  async findAll() {
    const purchases = await this.purchasesRepository.find({
      relations: ['user', 'course', 'category'],
      order: { createdAt: 'ASC' },
    });

    return purchases.map(purchase => ({
      id: purchase.id,
      purchaseDate: purchase.purchaseDate,
      price: purchase.price,
      createdAt: purchase.createdAt,
      degree: purchase.degree,
      status: purchase.status,
      course: {
        id: purchase.course.id,
        name: purchase.course.name,
      },
      category: {
        id: purchase.category.id,
        name: purchase.category.name,
        price: purchase.category.price,
      },
      user: {
        id: purchase.user.id,
        username: purchase.user.username,
        email: purchase.user.email,
        parentName: purchase.user.parentName,
        parentPhone: purchase.user.parentPhone,
      },
    }));
  }

  async findByUser(userId: number) {
    const purchases = await this.purchasesRepository.find({
      where: { user: { id: userId } },
      relations: ['course', 'category', 'user'],
      order: { createdAt: 'ASC' },
    });

    return purchases.map(purchase => ({
      id: purchase.id,
      purchaseDate: purchase.purchaseDate,
      price: purchase.price,
      createdAt: purchase.createdAt,
      degree: purchase.degree,
      status: purchase.status,
      course: {
        id: purchase.course.id,
        name: purchase.course.name,
      },
      category: {
        id: purchase.category.id,
        name: purchase.category.name,
        price: purchase.category.price,
      },
      user: {
        id: purchase.user.id,
        username: purchase.user.username,
        email: purchase.user.email,
        parentName: purchase.user.parentName,
        parentPhone: purchase.user.parentPhone,
      },
    }));
  }

  async delete(id: number) {
    const purchase = await this.purchasesRepository.findOne({ where: { id } });
    if (!purchase) {
      throw new NotFoundException(`Xarid topilmadi`);
    }

    await this.purchasesRepository.delete(id);
    return { message: `Xarid o‘chirildi` };
  }
}