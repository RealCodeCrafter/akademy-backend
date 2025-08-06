import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from './entities/course.entity';
import { CoursesController } from './course.controller';
import { CoursesService } from './course.service';
import { Category } from '../category/entities/cateogry.entity';
import { UserCourse } from '../user-course/entities/user-course.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Course, Category, UserCourse])],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}