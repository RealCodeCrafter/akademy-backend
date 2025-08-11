import { IsString, IsOptional, IsArray, IsNumber } from 'class-validator';

export class UpdateCourseDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  categoryIds?: number[];

  @IsNumber()
  @IsOptional()
  durationMonths?: number;
}
