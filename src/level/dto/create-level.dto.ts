import { IsString } from 'class-validator';

export class CreateLevelDto {
  @IsString()
  name: string;
}