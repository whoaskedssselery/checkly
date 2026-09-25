import { PartialType } from '@nestjs/mapped-types';
import { CreateColumnDto } from './create-column.dto';

/**
 * Dragging a column sends `{ position }` alone; resizing an edge sends
 * `{ position, width, height }` (a left/top edge moves the origin too).
 */
export class UpdateColumnDto extends PartialType(CreateColumnDto) {}
