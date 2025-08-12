import { Controller, Get, Post, Body, Param, Delete, Put, UseGuards, ParseIntPipe, Query, BadRequestException } from '@nestjs/common';
import { UsersService } from './user.service';
import { CreateUserDto } from '../auth/dto/create-user.dto';
import { AuthGuard } from '../auth/auth.guard';
import { UserCourseService } from '../user-course/user-course.service';
import { UpdateUserDto } from '../auth/dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private userCourseService: UserCourseService,
  ) {}

  @Post()
  createAdminUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createAdminUser(createUserDto);
  }

  @Get()
  findAll(@Query('page', ParseIntPipe) page: number = 1, @Query('limit', ParseIntPipe) limit: number = 10) {
    if (page < 1 || limit < 1) throw new BadRequestException('Sahifa va limit musbat bo‘lishi kerak');
    return this.usersService.findAll(page, limit);
  }

  @Post('from-request/:requestId')
  createFromRequest(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() createUserDto: CreateUserDto,
  ) {
    return this.usersService.createFromRequest(requestId, createUserDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Get(':id/courses')
  findUserCourses(@Param('id', ParseIntPipe) id: number) {
    return this.userCourseService.findUserCourses(id);
  }

  @Get(':id/documents')
  findUserDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id).then(user => user.documents.map(doc => ({ id: doc.id, fileName: doc.fileName })));
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.delete(id);
  }
}