import { IsNumber, IsString, IsIn } from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  courseId: number;

  @IsNumber()
  categoryId: number;

  @IsString()
  @IsIn(['Beginner', 'Intermediate', 'Advanced'])
  degree: string;
}