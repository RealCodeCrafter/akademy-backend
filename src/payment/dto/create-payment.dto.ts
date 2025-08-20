import { IsEnum, IsInt, IsOptional } from 'class-validator';

export enum PaymentMethod {
  TOCHKA = 'tochka',
  DOLYAME = 'dolyame',
}

export enum DolyameDemoFlow {
  PAYMENT_SUCCESS = 'payment-success',
  PAYMENT_FAIL = 'payment-fail',
  REJECT = 'reject',
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

  @IsOptional()
  @IsEnum(DolyameDemoFlow)
  demoFlow?: DolyameDemoFlow;
}