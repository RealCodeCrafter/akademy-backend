import { IsNumber, IsNotEmpty } from 'class-validator';

export class CreatePurchaseDto {
  @IsNumber()
  @IsNotEmpty()
  userId: number;

  @IsNumber()
  @IsNotEmpty()
  courseId: number;
}