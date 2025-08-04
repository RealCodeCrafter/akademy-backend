import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from './entities/request.entity';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(Request)
    private requestsRepository: Repository<Request>,
  ) {}

  async create(createRequestDto: CreateRequestDto) {
    const request = this.requestsRepository.create(createRequestDto);
    return this.requestsRepository.save(request);
  }

  async findAll() {
    return this.requestsRepository.find({
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async findAccepted() {
    return this.requestsRepository.find({
      where: { status: 'accepted' },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: number) {
    const request = await this.requestsRepository.findOne({
      where: { id },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
    if (!request) {
      throw new NotFoundException(`Zayavka ID ${id} bilan topilmadi`);
    }
    return request;
  }

  async update(id: number, updateRequestDto: UpdateRequestDto) {
    const request = await this.findOne(id);
    if (updateRequestDto.user) {
      request.user = updateRequestDto.user;
    }
    if (updateRequestDto.status) {
      request.status = updateRequestDto.status;
    }
    return this.requestsRepository.save(request);
  }

  async delete(id: number) {
    const request = await this.findOne(id);
    await this.requestsRepository.delete(id);
    return { message: `Zayavka ID ${id} o'chirildi` };
  }
}