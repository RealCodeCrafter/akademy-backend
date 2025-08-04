import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from "./entities/course.entity";
import { CreateCourseDto } from './dto/create-course.dto';
@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private coursesRepository: Repository<Course>,
  ) {}

  async create(createCourseDto: CreateCourseDto) {
    const course = this.coursesRepository.create(createCourseDto);
    return this.coursesRepository.save(course);
  }

  async findAll() {
    return this.coursesRepository.find({
      relations: ['categories'],
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