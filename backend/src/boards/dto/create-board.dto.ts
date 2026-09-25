import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../common/validation';

export class CreateBoardDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'Укажите название' })
  @MaxLength(150)
  name?: string;
}
