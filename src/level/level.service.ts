import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Level } from './entities/level.entity';
import { CreateLevelDto } from './dto/create-level.dto';
import { CategoryService } from '../category/category.service';
import { UpdateLevelDto } from './dto/update-level.dto';

@Injectable()
export class LevelService {
  constructor(
    @InjectRepository(Level)
    private levelRepository: Repository<Level>,
    private categoryService: CategoryService,
  ) {}


  async create(createLevelDto: CreateLevelDto) {
  const { name, categoryId } = createLevelDto;

  const existingLevel = await this.levelRepository.findOne({
    where: {
      name,
      categories: { id: categoryId },
    },
    relations: ['categories'],
  });

  if (existingLevel) {
    throw new BadRequestException(`"${name}" nomli daraja ushbu kategoriyada allaqachon mavjud`);
  }

  const level = this.levelRepository.create({
    name,
    categories: [{ id: categoryId }],
  });

  const savedLevel = await this.levelRepository.save(level);
  return savedLevel;
}


  async findAll() {
    return this.levelRepository.find({
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: number) {
    const level = await this.levelRepository.findOne({
      where: { id },
      order: { createdAt: 'ASC' },
    });
    if (!level) {
      throw new NotFoundException(`Daraja ID ${id} bilan topilmadi`);
    }
    return level;
  }

  async update(id: number, updateLevelDto: UpdateLevelDto) {
  const level = await this.levelRepository.findOne({
    where: { id },
    relations: ['categories'],
  });

  if (!level) {
    throw new NotFoundException(`Daraja ID ${id} bilan topilmadi`);
  }

  if (updateLevelDto.name && updateLevelDto.categoryId) {
    const existingLevel = await this.levelRepository.findOne({
      where: {
        name: updateLevelDto.name,
        categories: { id: updateLevelDto.categoryId },
      },
      relations: ['categories'],
    });
    if (existingLevel && existingLevel.id !== id) {
      throw new BadRequestException(
        `"${updateLevelDto.name}" nomli daraja ushbu kategoriyada allaqachon mavjud`,
      );
    }
    level.name = updateLevelDto.name;
  } else if (updateLevelDto.name) {
    level.name = updateLevelDto.name;
  }

  if (updateLevelDto.categoryId) {
    const category = await this.categoryService.findOne(updateLevelDto.categoryId);
    level.categories = [category];
  }

  return this.levelRepository.save(level);
}



  async delete(id: number) {
    const level = await this.findOne(id);
    await this.levelRepository.delete(id);
    return { message: `Daraja ID ${id} o'chirildi` };
  }
}