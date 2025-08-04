import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from "./entities/cateogry.entity";
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { CoursesModule } from '../course/course.module';

@Module({
  imports: [TypeOrmModule.forFeature([Category]), CoursesModule],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}