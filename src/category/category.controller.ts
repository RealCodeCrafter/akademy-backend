import { Controller, Get, Post, Body, Param, UseGuards, Delete } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';


@Controller('categories')
export class CategoryController {
  constructor(private categoryService: CategoryService) {}

//   @UseGuards(AuthGuard, RolesGuard)
//   @Roles('admin')
  @Post()
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(createCategoryDto);
  }

  @Get()
  findAll() {
    return this.categoryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(+id);
  }

//   @UseGuards(AuthGuard, RolesGuard)
//   @Roles('admin')
  @Post(':id/link-course/:courseId')
  linkCourse(@Param('id') id: string, @Param('courseId') courseId: string) {
    return this.categoryService.linkCourse(+id, +courseId);
  }

//   @UseGuards(AuthGuard, RolesGuard)
//   @Roles('admin')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.categoryService.delete(+id);
  }
}