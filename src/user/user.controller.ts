import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { UsersService } from './user.service';
import { CreateUserDto } from '../auth/dto/create-user.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // @UseGuards(AuthGuard)
  @Post()
  createAdminUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createAdminUser(createUserDto);
  }

  // @UseGuards(AuthGuard)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  // @UseGuards(AuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  // @UseGuards(AuthGuard)
  @Get(':id/courses')
  findUserCourses(@Param('id') id: string) {
    return this.usersService.findOne(+id).then(user => user.userCourses);
  }

  // @UseGuards(AuthGuard)
  @Get(':id/documents')
  findUserDocuments(@Param('id') id: string) {
    return this.usersService.findOne(+id).then(user => user.documents);
  }

  // @UseGuards(AuthGuard)
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.usersService.delete(+id);
  }
}