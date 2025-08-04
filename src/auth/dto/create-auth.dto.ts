import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateAuthDto {
  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  role?: string;
}