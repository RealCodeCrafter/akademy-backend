import { IsString, IsNumber, IsOptional } from 'class-validator';

export class UpdateLevelDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  categoryId?: number;
}
