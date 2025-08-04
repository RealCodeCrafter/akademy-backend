import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { CoursesService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';

@Controller('courses')
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  @Post()
  create(@Body() createCourseDto: CreateCourseDto) {
    return this.coursesService.create(createCourseDto);
  }

  @Get()
  findAll() {
    return this.coursesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coursesService.findOne(+id);
  }

  @Get(':id/categories')
  findCategories(@Param('id') id: string) {
    return this.coursesService.findCategories(+id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.coursesService.delete(+id);
  }
}