import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserCourse } from './entities/user-course.entity';
import { User } from '../user/entities/user.entity';
import { Course } from '../course/entities/course.entity';

@Injectable()
export class UserCourseService {
  constructor(
    @InjectRepository(UserCourse)
    private userCourseRepository: Repository<UserCourse>,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
  ) {}

  async assignCourseToUser(userId: number, courseId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Foydalanuvchi ID ${userId} bilan topilmadi`);
    }

    const course = await this.courseRepository.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException(`Kurs ID ${courseId} bilan topilmadi`);
    }

    const existingUserCourse = await this.userCourseRepository.findOne({
      where: { user: { id: userId }, course: { id: courseId } },
    });
    if (existingUserCourse && existingUserCourse.expiresAt > new Date()) {
      return existingUserCourse;
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + (course.durationMonths || 6));

    const userCourse = this.userCourseRepository.create({
      user,
      course,
      expiresAt,
    });

    return this.userCourseRepository.save(userCourse);
  }

  async findUserCourse(userId: number, courseId: number) {
    return this.userCourseRepository.findOne({
      where: { user: { id: userId }, course: { id: courseId } },
    });
  }

  async findUserCourses(userId: number) {
    const userCourses = await this.userCourseRepository.find({
      where: { user: { id: userId } },
      relations: ['course', 'course.categories'],
      order: { createdAt: 'ASC' },
    });

    return userCourses.map(userCourse => ({
      id: userCourse.id,
      course: {
        id: userCourse.course.id,
        name: userCourse.course.name,
        durationMonths: userCourse.course.durationMonths,
        categories: userCourse.course.categories.map(category => ({
          id: category.id,
          name: category.name,
          price: category.price,
        })),
      },
      expiresAt: userCourse.expiresAt,
      createdAt: userCourse.createdAt,
    }));
  }
}