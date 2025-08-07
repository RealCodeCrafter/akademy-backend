import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from './entities/course.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { Category } from '../category/entities/category.entity';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private coursesRepository: Repository<Course>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
  ) {}

  async create(createCourseDto: CreateCourseDto) {
    const { name, categoryIds, durationMonths } = createCourseDto;
    const existingCourse = await this.coursesRepository.findOne({ where: { name } });
    if (existingCourse) {
      throw new BadRequestException(`"${name}" nomli kurs allaqachon mavjud`);
    }
    const course = this.coursesRepository.create({ name, durationMonths });

    if (categoryIds && categoryIds.length > 0) {
      const categories = await this.categoryRepository.find({
        where: categoryIds.map(id => ({ id })),
      });

      if (categories.length !== categoryIds.length) {
        throw new NotFoundException('Ba\'zi kategoriyalar topilmadi');
      }

      course.categories = categories;
    }

    return this.coursesRepository.save(course);
  }
async findAll() {
  return this.coursesRepository.find({
    relations: ['categories', 'categories.levels'],
    order: { createdAt: 'ASC' },
  });
}

  async findOne(id: number) {
    const course = await this.coursesRepository.findOne({
      where: { id },
      relations: ['categories'],
      order: { createdAt: 'ASC' },
    });
    if (!course) {
      throw new NotFoundException(`Kurs ID ${id} bilan topilmadi`);
    }
    return course;
  }

  async findCategories(id: number) {
    const course = await this.findOne(id);
    return course.categories.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async delete(id: number) {
    const course = await this.findOne(id);
    await this.coursesRepository.delete(id);
    return { message: `Kurs ID ${id} o'chirildi` };
  }
}