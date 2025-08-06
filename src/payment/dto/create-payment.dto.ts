import { IsNumber, IsOptional } from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  courseId: number;

  @IsNumber()
  categoryId: number;

  @IsNumber()
  @IsOptional()
  levelId?: number;
}