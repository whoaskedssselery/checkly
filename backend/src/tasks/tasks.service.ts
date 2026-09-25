import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BoardsService } from '../boards/boards.service';
import { toTask } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

/** A board holds at most this many cards: keeps one board from growing without bound. */
const MAX_TASKS_PER_BOARD = 500;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
    private readonly realtime: RealtimeService,
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
    if (dto.columnId) await this.assertColumnInBoard(dto.columnId, boardId);

    const count = await this.prisma.task.count({ where: { boardId } });
    if (count >= MAX_TASKS_PER_BOARD) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `На доске не может быть больше ${MAX_TASKS_PER_BOARD} задач`,
      });
    }

    const task = await this.prisma.task.create({
      data: {
        boardId,
        columnId: dto.columnId ?? null,
        title: dto.title,
        description: dto.description?.trim() || null,
        priority: dto.priority ?? 'medium',
        tags: dto.tags ?? [],
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        posX: dto.position.x,
        posY: dto.position.y,
      },
    });

    this.realtime.boardChanged(boardId);
    return toTask(task);
  }

  async update(userId: string, taskId: string, dto: UpdateTaskDto) {
    const existing = await this.loadAuthorised(userId, taskId);

    const data: Prisma.TaskUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
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
    if (dto.columnId === null) {
      data.column = { disconnect: true };
    } else if (dto.columnId !== undefined && dto.columnId !== existing.columnId) {
      await this.assertColumnInBoard(dto.columnId, existing.boardId);
      data.column = { connect: { id: dto.columnId } };
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Nothing to update' });
    }

    const task = await this.prisma.task.update({ where: { id: taskId }, data });
    this.realtime.boardChanged(existing.boardId);
    return toTask(task);
  }

  async remove(userId: string, taskId: string) {
    const existing = await this.loadAuthorised(userId, taskId);
    await this.prisma.task.delete({ where: { id: taskId } });
    this.realtime.boardChanged(existing.boardId);
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
