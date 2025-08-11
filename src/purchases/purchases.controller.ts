import { Controller, Get, Param, Delete, UseGuards } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('purchases')
export class PurchasesController {
  constructor(private purchasesService: PurchasesService) {}

  @Get()
  findAll() {
    return this.purchasesService.findAll();
  }

  @UseGuards(AuthGuard)
  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.purchasesService.findByUser(+userId);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.purchasesService.delete(+id);
  }
}
