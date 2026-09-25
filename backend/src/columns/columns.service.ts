import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BoardsService } from '../boards/boards.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateColumnDto } from './dto/create-column.dto';
import type { UpdateColumnDto } from './dto/update-column.dto';

const PALETTE = ['var(--reel-1)', 'var(--reel-2)', 'var(--reel-3)', 'var(--reel-4)'];

const COLUMN_SELECT = {
  id: true,
  boardId: true,
  name: true,
  color: true,
  posX: true,
  posY: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { tasks: true } },
} satisfies Prisma.ColumnSelect;

type ColumnRow = Prisma.ColumnGetPayload<{ select: typeof COLUMN_SELECT }>;

@Injectable()
export class ColumnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  async listForBoard(userId: string, boardId: string) {
    await this.boards.assertMember(boardId, userId);
    const columns = await this.prisma.column.findMany({
      where: { boardId },
      orderBy: { createdAt: 'asc' },
      select: COLUMN_SELECT,
    });
    return columns.map(toColumn);
  }

  async create(userId: string, boardId: string, dto: CreateColumnDto) {
    await this.boards.assertMember(boardId, userId);
    const existing = await this.prisma.column.count({ where: { boardId } });

    const column = await this.prisma.column.create({
      data: {
        boardId,
        name: dto.name.trim(),
        color: dto.color ?? PALETTE[existing % PALETTE.length],
        posX: dto.position.x,
        posY: dto.position.y,
      },
      select: COLUMN_SELECT,
    });

    return toColumn(column);
  }

  async update(userId: string, columnId: string, dto: UpdateColumnDto) {
    const existing = await this.loadAuthorised(userId, columnId);

    const data: Prisma.ColumnUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.position !== undefined) {
      data.posX = dto.position.x;
      data.posY = dto.position.y;
    }

    const column = await this.prisma.column.update({
      where: { id: existing.id },
      data,
      select: COLUMN_SELECT,
    });

    return toColumn(column);
  }

  async remove(userId: string, columnId: string) {
    const existing = await this.loadAuthorised(userId, columnId);

    const siblings = await this.prisma.column.findMany({
      where: { boardId: existing.boardId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (siblings.length <= 1) {
      throw new BadRequestException('Нельзя удалить последнюю колонку доски');
    }

    const fallback = siblings.find((c) => c.id !== columnId);
    if (!fallback) throw new BadRequestException('Нельзя удалить последнюю колонку доски');

    // Tasks are not cascade-deleted with their column — they move into the
    // first remaining column, because losing a card because you tidied up a
    // bin is the worst thing this API could do.
    const [moved] = await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { columnId },
        data: { columnId: fallback.id },
      }),
      this.prisma.column.delete({ where: { id: columnId } }),
    ]);

    return { removedColumnId: columnId, movedTo: fallback.id, movedTasks: moved.count };
  }

  private async loadAuthorised(userId: string, columnId: string) {
    const column = await this.prisma.column.findUnique({
      where: { id: columnId },
      select: { id: true, boardId: true },
    });
    if (!column) throw new NotFoundException('Колонка не найдена');
    await this.boards.assertMember(column.boardId, userId);
    return column;
  }
}

function toColumn(column: ColumnRow) {
  return {
    id: column.id,
    boardId: column.boardId,
    name: column.name,
    color: column.color,
    position: { x: column.posX, y: column.posY },
    taskCount: column._count.tasks,
    createdAt: column.createdAt,
    updatedAt: column.updatedAt,
  };
}