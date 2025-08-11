import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserCourse } from './entities/user-course.entity';
import { UserCourseService } from './user-course.service';
import { UserCourseCronService } from './user-course-cron.service';
import { User } from 'src/user/entities/user.entity';
import { Course } from 'src/course/entities/course.entity';
import { CategoryModule } from 'src/category/category.module';
import { Category } from 'src/category/entities/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserCourse, User, Course, Category]), CategoryModule],
  providers: [UserCourseService, UserCourseCronService],
  exports: [UserCourseService],
})
export class UserCourseModule {}