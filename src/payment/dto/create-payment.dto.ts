import { IsNumber, IsString, IsIn } from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  courseId: number;

  @IsNumber()
  categoryId: number;

  @IsString()
  degree: string;
}