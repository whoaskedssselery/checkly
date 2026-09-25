import { IsEmail } from 'class-validator';

export class AddMemberDto {
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;
}