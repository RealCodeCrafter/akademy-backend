import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Level } from './entities/level.entity';
import { CreateLevelDto } from './dto/create-level.dto';

@Injectable()
export class LevelService {
  constructor(
    @InjectRepository(Level)
    private levelRepository: Repository<Level>,
  ) {}

  async create(createLevelDto: CreateLevelDto) {
    const existingLevel = await this.levelRepository.findOne({
      where: { name: createLevelDto.name },
    });

    if (existingLevel) {
      throw new BadRequestException(`"${createLevelDto.name}" nomli daraja allaqachon mavjud`);
    }

    const level = this.levelRepository.create(createLevelDto);
    return this.levelRepository.save(level);
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

  async delete(id: number) {
    const level = await this.findOne(id);
    await this.levelRepository.delete(id);
    return { message: `Daraja ID ${id} o'chirildi` };
  }
}