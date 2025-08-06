import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { LevelService } from './level.service';
import { CreateLevelDto } from './dto/create-level.dto';

@Controller('levels')
export class LevelController {
  constructor(private levelService: LevelService) {}

  @Post()
  create(@Body() createLevelDto: CreateLevelDto) {
    return this.levelService.create(createLevelDto);
  }

  @Get()
  findAll() {
    return this.levelService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.levelService.findOne(+id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.levelService.delete(+id);
  }
}