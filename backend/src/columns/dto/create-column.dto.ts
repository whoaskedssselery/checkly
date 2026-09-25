import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { PositionDto } from '../../common/dto/position.dto';

export class CreateColumnDto {
  @IsString()
  @MinLength(1, { message: 'Укажите название' })
  @MaxLength(60)
  name!: string;

  /**
   * The frontend already owns reel colours; the server just stores whatever
   * string comes in (a CSS var like `var(--reel-2)` today). No enum here.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  color?: string;

  @ValidateNested()
  @Type(() => PositionDto)
  position!: PositionDto;
}