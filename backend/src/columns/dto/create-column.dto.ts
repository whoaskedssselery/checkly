import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PositionDto } from '../../common/dto/position.dto';
import { Trim } from '../../common/validation';

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class CreateColumnDto {
  @Trim()
  @IsString()
  @MinLength(1, { message: 'Укажите название' })
  @MaxLength(50)
  name!: string;

  /** #rrggbb, the same value the frontend palette uses. Optional: the server picks one. */
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR, { message: 'Цвет должен быть в формате #rrggbb' })
  color?: string;

  @ValidateNested()
  @Type(() => PositionDto)
  position!: PositionDto;

  /** Size the user gave the column by dragging its edges; omitted = standard. */
  @IsOptional()
  @IsNumber()
  @Min(200)
  @Max(5000)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(120)
  @Max(5000)
  height?: number;
}
