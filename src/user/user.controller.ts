import { Controller, Get, Post, Body, Param, Delete, UseGuards, Put } from '@nestjs/common';
import { UsersService } from './user.service';
import { CreateUserDto } from '../auth/dto/create-user.dto';
import { AuthGuard } from '../auth/auth.guard';
import { UserCourseService } from '../user-course/user-course.service';
import { UpdateUserDto } from 'src/auth/dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private userCourseService: UserCourseService,
  ) {}

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

    @Post('from-request/:requestId')
  createFromRequest(
    @Param('requestId') requestId: string,
    @Body() createUserDto: CreateUserDto,
  ) {
    return this.usersService.createFromRequest(+requestId, createUserDto);
  }

  // @UseGuards(AuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  // @UseGuards(AuthGuard)
  @Get(':id/courses')
  findUserCourses(@Param('id') id: string) {
    return this.userCourseService.findUserCourses(+id);
  }

  // @UseGuards(AuthGuard)
  @Get(':id/documents')
  findUserDocuments(@Param('id') id: string) {
    return this.usersService.findOne(+id).then(user => user.documents);
  }

  
  // @UseGuards(AuthGuard)
  @Put(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto);
  }

  // @UseGuards(AuthGuard)
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.usersService.delete(+id);
  }
}