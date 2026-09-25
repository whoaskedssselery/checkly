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
import { TASK_PRIORITIES, type TaskPriority } from './create-task.dto';

/**
 * Every field optional. A drag sends `{ position }` alone; dropping a card
 * into another bin sends `{ position, columnId }`; dropping it outside every
 * column sends `{ position, columnId: null }`. `@IsOptional()` also skips
 * `null`, so `{ description: null }` and `{ dueDate: null }` clear those
 * fields on purpose instead of being ignored.
 */
export class UpdateTaskDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'Укажите название' })
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

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
  dueDate?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;
}
