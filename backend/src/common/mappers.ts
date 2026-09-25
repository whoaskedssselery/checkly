/** Database rows → the JSON the API sends. One place, so every route agrees. */

export interface ColumnRow {
  id: string;
  boardId: string;
  name: string;
  color: string;
  posX: number;
  posY: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toColumn(column: ColumnRow) {
  return {
    id: column.id,
    boardId: column.boardId,
    name: column.name,
    color: column.color,
    position: { x: column.posX, y: column.posY },
    // Only present when the user resized the column by hand.
    width: column.width ?? undefined,
    height: column.height ?? undefined,
    createdAt: column.createdAt,
    updatedAt: column.updatedAt,
  };
}

export interface TaskRow {
  id: string;
  boardId: string;
  columnId: string | null;
  title: string;
  description: string | null;
  priority: string;
  tags: string[];
  dueDate: Date | null;
  posX: number;
  posY: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toTask(task: TaskRow) {
  return {
    id: task.id,
    boardId: task.boardId,
    // null = a free-floating card that belongs to no column.
    columnId: task.columnId,
    title: task.title,
    description: task.description ?? undefined,
    priority: task.priority,
    tags: task.tags,
    // The frame carries a date, not a timestamp: `YYYY-MM-DD`.
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : undefined,
    position: { x: task.posX, y: task.posY },
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
