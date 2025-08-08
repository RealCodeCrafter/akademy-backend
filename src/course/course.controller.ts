import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { CoursesService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { AuthGuard } from 'src/auth/auth.guard';

@Controller('courses')
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  
    // @UseGuards(AuthGuard, RolesGuard)
    // @Roles('admin')
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