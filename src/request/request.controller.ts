import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { RequestsService } from './request.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
// import { AuthGuard } from '../auth/auth.guard';
// import { RolesGuard } from '../auth/roles.guard';
// import { Roles } from '../auth/roles.decorator';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

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
  @Get('pending')
  findPending() {
    return this.requestsService.findPending();
  }

  // @UseGuards(AuthGuard, RolesGuard)
  // @Roles('admin')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRequestDto: UpdateRequestDto,
  ) {
    return this.requestsService.update(id, updateRequestDto);
  }

  // @UseGuards(AuthGuard, RolesGuard)
  // @Roles('admin')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.requestsService.findOne(id);
  }

  // @UseGuards(AuthGuard, RolesGuard)
  // @Roles('admin')
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.requestsService.delete(id);
  }
}
