import { IsNumber, IsOptional } from 'class-validator';

export class CreatePurchaseDto {
  @IsNumber()
  courseId: number;

  @IsNumber()
  categoryId: number;

  @IsNumber()
  @IsOptional()
  levelId?: number;
}