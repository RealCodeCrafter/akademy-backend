import { Controller, Get, Post, Body, Param, Delete, Patch } from '@nestjs/common';
import { LevelService } from './level.service';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';

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

   @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateLevelDto: UpdateLevelDto,
  ) {
    return this.levelService.update(+id, updateLevelDto);
  }


  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.levelService.delete(+id);
  }
}