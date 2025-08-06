import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { UserCourse } from './entities/user-course.entity';

@Injectable()
export class UserCourseCronService {
  constructor(
    @InjectRepository(UserCourse)
    private userCourseRepository: Repository<UserCourse>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanExpiredUserCourses() {
    const expiredCourses = await this.userCourseRepository.find({
      where: { expiresAt: LessThan(new Date()) },
    });

    if (expiredCourses.length > 0) {
      await this.userCourseRepository.delete({
        expiresAt: LessThan(new Date()),
      });
    }
  }
}