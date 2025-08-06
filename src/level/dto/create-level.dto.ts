import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateLevelDto {
  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  categoryId?: number;
}