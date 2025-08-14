import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { UserCourse } from './entities/user-course.entity';

@Injectable()
export class UserCourseCronService {
  private readonly logger = new Logger(UserCourseCronService.name);

  constructor(
    @InjectRepository(UserCourse)
    private readonly userCourseRepository: Repository<UserCourse>,
  ) {}
  
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanExpiredUserCourses() {
    const now = new Date();

    const deleted = await this.userCourseRepository.delete({
      expiresAt: LessThan(now),
    });

    if (deleted.affected && deleted.affected > 0) {
      this.logger.log(`Expired kurslar o‘chirildi: ${deleted.affected} ta yozuv`);
    } else {
      this.logger.log('Expired kurs topilmadi');
    }
  }
}
