import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from "./entities/category.entity";
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { CoursesModule } from '../course/course.module';
import { LevelModule } from 'src/level/level.module';
import { Level } from 'src/level/entities/level.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Level]), CoursesModule,forwardRef(() => LevelModule),],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}