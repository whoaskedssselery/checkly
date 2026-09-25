import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BoardsService } from '../boards/boards.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  async listForBoard(userId: string, boardId: string) {
    await this.boards.assertMember(boardId, userId);
    const tasks = await this.prisma.task.findMany({
      where: { boardId },
      orderBy: { createdAt: 'asc' },
    });
    return tasks.map(toTask);
  }

  async create(userId: string, boardId: string, dto: CreateTaskDto) {
    await this.boards.assertMember(boardId, userId);
    await this.assertColumnInBoard(dto.columnId, boardId);

    const task = await this.prisma.task.create({
      data: {
        boardId,
        columnId: dto.columnId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        priority: dto.priority,
        tags: dto.tags ?? [],
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        posX: dto.position.x,
        posY: dto.position.y,
      },
    });

    return toTask(task);
  }

  async update(userId: string, taskId: string, dto: UpdateTaskDto) {
    const existing = await this.loadAuthorised(userId, taskId);

    const data: Prisma.TaskUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.dueDate !== undefined) {
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.position !== undefined) {
      data.posX = dto.position.x;
      data.posY = dto.position.y;
    }
    if (dto.columnId !== undefined && dto.columnId !== existing.columnId) {
      await this.assertColumnInBoard(dto.columnId, existing.boardId);
      data.column = { connect: { id: dto.columnId } };
    }

    const task = await this.prisma.task.update({ where: { id: taskId }, data });
    return toTask(task);
  }

  async remove(userId: string, taskId: string) {
    await this.loadAuthorised(userId, taskId);
    await this.prisma.task.delete({ where: { id: taskId } });
    return { removedTaskId: taskId };
  }

  private async loadAuthorised(userId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, boardId: true, columnId: true },
    });
    if (!task) throw new NotFoundException('Задача не найдена');
    await this.boards.assertMember(task.boardId, userId);
    return task;
  }

  private async assertColumnInBoard(columnId: string, boardId: string): Promise<void> {
    const column = await this.prisma.column.findUnique({
      where: { id: columnId },
      select: { boardId: true },
    });
    if (!column || column.boardId !== boardId) {
      throw new NotFoundException('Колонка не найдена на этой доске');
    }
  }
}

function toTask(task: {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: string;
  tags: string[];
  dueDate: Date | null;
  posX: number;
  posY: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: task.id,
    boardId: task.boardId,
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