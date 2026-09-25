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
import { TASK_PRIORITIES, type TaskPriority } from './create-task.dto';

/**
 * Every field optional. A drag sends `{ position }` alone; dropping a card
 * into another bin sends `{ position, columnId }`. `@IsOptional()` also
 * skips `null`, so `{ description: null }` and `{ dueDate: null }` clear
 * those fields on purpose instead of being ignored.
 */
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Укажите название' })
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  columnId?: string;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: TaskPriority;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;
}