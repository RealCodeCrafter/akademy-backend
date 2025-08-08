import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  parentName?: string;

  @IsOptional()
  @IsString()
  parentPhone?: string;

  @IsOptional()
  @IsString()
  parentSurname?: string;

  @IsOptional()
  @IsString()
  parentPatronymic?: string;

  @IsOptional()
  @IsString()
  parentAddress?: string;

  @IsOptional()
  @IsString()
  studentName?: string;

  @IsOptional()
  @IsString()
  studentSurname?: string;

  @IsOptional()
  @IsString()
  studentPatronymic?: string;

  @IsOptional()
  @IsString()
  studentAddress?: string;

  @IsOptional()
  @IsString()
  studentBirthDate?: string;
}


