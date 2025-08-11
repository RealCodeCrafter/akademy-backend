import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { Level } from '../level/entities/level.entity';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(Level)
    private levelRepository: Repository<Level>,
  ) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const existingCategory = await this.categoryRepository.findOne({
      where: { name: createCategoryDto.name },
    });

    if (existingCategory) {
      throw new BadRequestException(`"${createCategoryDto.name}" nomli kategoriya allaqachon mavjud`);
    }

    const category = this.categoryRepository.create(createCategoryDto);
    return this.categoryRepository.save(category);
  }

  async findAll() {
    return this.categoryRepository.find({
      relations: ['courses', 'levels'],
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: number) {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['courses', 'levels'],
      order: { createdAt: 'ASC' },
    });
    if (!category) {
      throw new NotFoundException(`Kategoriya ID ${id} bilan topilmadi`);
    }
    return category;
  }

  async getLevelsByCategory(categoryId: number) {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
      relations: ['levels'],
    });
    if (!category) {
      throw new NotFoundException(`Kategoriya ID ${categoryId} bilan topilmadi`);
    }
    return category.levels || [];
  }

  async isLevelLinkedToCategory(categoryId: number, levelId: number) {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
      relations: ['levels'],
    });
    if (!category) {
      throw new NotFoundException(`Kategoriya ID ${categoryId} bilan topilmadi`);
    }
    return category.levels.some(level => level.id === levelId);
  }

  async addLevelToCategory(categoryId: number, levelId: number) {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
      relations: ['levels'],
    });
    if (!category) {
      throw new NotFoundException(`Kategoriya ID ${categoryId} bilan topilmadi`);
    }

    const level = await this.levelRepository.findOne({ where: { id: levelId } });
    if (!level) {
      throw new NotFoundException(`Daraja ID ${levelId} bilan topilmadi`);
    }

    if (!category.levels) {
      category.levels = [];
    }
    if (!category.levels.some(l => l.id === levelId)) {
      category.levels.push(level);
      await this.categoryRepository.save(category);
    }

    return category;
  }
  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
  const category = await this.categoryRepository.findOne({ where: { id } });

  if (!category) {
    throw new NotFoundException(`Kategoriya ID ${id} bilan topilmadi`);
  }

  if (
    updateCategoryDto.name &&
    updateCategoryDto.name !== category.name
  ) {
    const existingCategory = await this.categoryRepository.findOne({
      where: { name: updateCategoryDto.name },
    });
    if (existingCategory) {
      throw new BadRequestException(
        `"${updateCategoryDto.name}" nomli kategoriya allaqachon mavjud`
      );
    }
  }

  Object.assign(category, updateCategoryDto);
  return this.categoryRepository.save(category);
}

  async delete(id: number) {
    const category = await this.findOne(id);
    await this.categoryRepository.delete(id);
    return { message: `Kategoriya ID ${id} o'chirildi` };
  }
}
