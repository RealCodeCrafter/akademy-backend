import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from './entities/course.entity';
import { CoursesController } from './course.controller';
import { CoursesService } from './course.service';
import { Category } from 'src/category/entities/cateogry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Course, Category])],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}