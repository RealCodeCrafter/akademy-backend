import { Controller, Get, Post, Body, Param, UseGuards, Delete } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
@Controller('purchases')
export class PurchasesController {
  constructor(private purchasesService: PurchasesService) {}

  // @UseGuards(AuthGuard)
  @Post()
  create(@Body() createPurchaseDto: CreatePurchaseDto) {
    return this.purchasesService.create(createPurchaseDto);
  }

  // @UseGuards(AuthGuard, RolesGuard)
  // @Roles('admin')
  @Get()
  findAll() {
    return this.purchasesService.findAll();
  }

  // @UseGuards(AuthGuard)
  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.purchasesService.findByUser(+userId);
  }

  // @UseGuards(AuthGuard, RolesGuard)
  // @Roles('admin')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.purchasesService.delete(+id);
  }
}