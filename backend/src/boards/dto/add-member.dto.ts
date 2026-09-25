import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class AddMemberDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;
}
