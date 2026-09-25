import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PositionDto } from '../../common/dto/position.dto';
import { Trim } from '../../common/validation';

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export class CreateTaskDto {
  @Trim()
  @IsString()
  @MinLength(1, { message: 'Укажите название' })
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  /**
   * The column is the card's home; null (or omitted) = a free-floating card
   * that belongs to no column.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  columnId?: string | null;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: TaskPriority;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ValidateNested()
  @Type(() => PositionDto)
  position!: PositionDto;
}
