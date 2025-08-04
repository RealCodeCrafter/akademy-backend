import { IsString, IsOptional } from 'class-validator';
import { User } from '../../user/entities/user.entity';

export class UpdateRequestDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsOptional()
  user?: User;
}