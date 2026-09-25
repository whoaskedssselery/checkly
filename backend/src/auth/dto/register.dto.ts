import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Минимум 6 символов' })
  // bcrypt silently truncates past 72 bytes; reject it instead of letting a
  // long password mean less than the user thinks it does.
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}