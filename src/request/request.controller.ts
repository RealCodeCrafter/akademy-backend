import { Controller, Get, Post, Body, Patch, Param, UseGuards, Put, Delete } from '@nestjs/common';
import { RequestsService } from './request.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('requests')
export class RequestsController {
  constructor(private requestsService: RequestsService) {}

  @Post()
  create(@Body() createRequestDto: CreateRequestDto) {
    return this.requestsService.create(createRequestDto);
  }

  // @UseGuards(AuthGuard, RolesGuard)
  // @Roles('admin')
  @Get()
  findAll() {
    return this.requestsService.findAll();
  }

  // @UseGuards(AuthGuard, RolesGuard)
  // @Roles('admin')
  @Get('accepted')
  findAccepted() {
    return this.requestsService.findAccepted();
  }

  // @UseGuards(AuthGuard, RolesGuard)
  // @Roles('admin')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.requestsService.findOne(+id);
  }

  // @UseGuards(AuthGuard, RolesGuard)
  // @Roles('admin')
  @Put(':id')
  update(@Param('id') id: string, @Body() updateRequestDto: UpdateRequestDto) {
    return this.requestsService.update(+id, updateRequestDto);
  }

  // @UseGuards(AuthGuard, RolesGuard)
  // @Roles('admin')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.requestsService.delete(+id);
  }
}