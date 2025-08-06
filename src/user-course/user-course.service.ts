import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
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

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + (course.durationMonths || 6));

    const userCourse = this.userCourseRepository.create({
      user,
      course,
      expiresAt,
    });

    return this.userCourseRepository.save(userCourse);
  }

  async findUserCourses(userId: number) {
    const userCourses = await this.userCourseRepository.find({
      where: { user: { id: userId }, expiresAt: MoreThan(new Date()) },
      relations: ['course', 'course.categories'],
      order: { createdAt: 'ASC' },
    });

    return userCourses.map(userCourse => ({
      id: userCourse.id,
      course: {
        id: userCourse.course.id,
        name: userCourse.course.name,
        durationMonths: userCourse.course.durationMonths,
      },
      expiresAt: userCourse.expiresAt,
      createdAt: userCourse.createdAt,
    }));
  }
}