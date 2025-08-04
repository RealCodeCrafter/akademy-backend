import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/cateogry.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CoursesService } from '../course/course.service';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    private coursesService: CoursesService,
  ) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const category = this.categoryRepository.create(createCategoryDto);
    return this.categoryRepository.save(category);
  }

  async findAll() {
    return this.categoryRepository.find({
      relations: ['courses'],
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: number) {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['courses'],
      order: { createdAt: 'ASC' },
    });
    if (!category) {
      throw new NotFoundException(`Kategoriya ID ${id} bilan topilmadi`);
    }
    return category;
  }

  async linkCourse(categoryId: number, courseId: number) {
    const category = await this.findOne(categoryId);
    const course = await this.coursesService.findOne(courseId);
    if (!category.courses) {
      category.courses = [];
    }
    category.courses.push(course);
    return this.categoryRepository.save(category);
  }

  async delete(id: number) {
    const category = await this.findOne(id);
    await this.categoryRepository.delete(id);
    return { message: `Kategoriya ID ${id} o'chirildi` };
  }
}