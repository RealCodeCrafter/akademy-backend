import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';

export class CreateRequestDto {
  @IsString()
  @IsNotEmpty()
  parentName: string;

  @IsString()
  @IsNotEmpty()
  parentPhone: string;

  @IsEmail()
  @IsNotEmpty()
  parentEmail: string;

  @IsString()
  @IsOptional()
  comment: string;
}