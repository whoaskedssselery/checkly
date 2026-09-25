import { Type } from 'class-transformer';
import {
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

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export class CreateTaskDto {
  @IsString()
  @MinLength(1, { message: 'Укажите название' })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // The column is the task's home. There is no status enum any more —
  // columns are user-created rows on the board.
  @IsString()
  @MinLength(1)
  columnId!: string;

  @IsIn(TASK_PRIORITIES)
  priority!: TaskPriority;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ValidateNested()
  @Type(() => PositionDto)
  position!: PositionDto;
}