import { IsNumber, IsOptional } from 'class-validator';

export class CreatePurchaseDto {
  @IsNumber()
  userId: number;

  @IsNumber()
  courseId: number;

  @IsNumber()
  @IsOptional()
  categoryId?: number;
}