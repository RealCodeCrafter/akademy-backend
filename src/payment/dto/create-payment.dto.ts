import { IsEnum, IsInt, IsOptional } from 'class-validator';

export enum PaymentMethod {
  TOCHKA = 'tochka',
  DOLYAME = 'dolyame',
}

export class CreatePaymentDto {
  @IsInt()
  courseId: number;

  @IsInt()
  categoryId: number;

  @IsOptional()
  @IsInt()
  levelId?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}