import { IsString, IsNumber, IsOptional } from 'class-validator';
export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsNumber()
  price: number;

  @IsNumber()
  @IsOptional()
  durationMonths?: number;
}