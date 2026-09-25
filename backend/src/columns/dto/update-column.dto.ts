import { PartialType } from '@nestjs/mapped-types';
import { CreateColumnDto } from './create-column.dto';

/**
 * Dragging a column sends `{ position }` alone, dozens of times a second.
 * The endpoint never asks for the whole column back.
 */
export class UpdateColumnDto extends PartialType(CreateColumnDto) {}