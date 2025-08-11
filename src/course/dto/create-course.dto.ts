import { IsString, IsArray, IsNumber } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  name: string;

  @IsArray()
  @IsNumber({}, { each: true })
  categoryIds: number[];
}
