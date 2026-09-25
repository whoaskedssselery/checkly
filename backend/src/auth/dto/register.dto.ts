import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../common/validation';

export class RegisterDto {
  @Trim()
  @IsEmail({}, { message: 'Некорректный email' })
  @MaxLength(150)
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Минимум 6 символов' })
  // bcrypt silently truncates past 72 bytes; reject it instead of letting a
  // long password mean less than the user thinks it does.
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  name?: string;
}
