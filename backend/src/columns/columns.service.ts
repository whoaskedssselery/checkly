import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BoardsService } from '../boards/boards.service';
import { toColumn } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { CreateColumnDto } from './dto/create-column.dto';
import type { UpdateColumnDto } from './dto/update-column.dto';

const PALETTE = ['#d9a441', '#cfc6b2', '#9aa35e', '#8d97a3'];

@Injectable()
export class ColumnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
    private readonly realtime: RealtimeService,
  ) {}

  async listForBoard(userId: string, boardId: string) {
    await this.boards.assertMember(boardId, userId);
    const columns = await this.prisma.column.findMany({
      where: { boardId },
      orderBy: { createdAt: 'asc' },
    });
    return columns.map(toColumn);
  }

  async create(userId: string, boardId: string, dto: CreateColumnDto) {
    await this.boards.assertMember(boardId, userId);
    const existing = await this.prisma.column.count({ where: { boardId } });

    const column = await this.prisma.column.create({
      data: {
        boardId,
        name: dto.name,
        color: dto.color ?? PALETTE[existing % PALETTE.length],
        posX: dto.position.x,
        posY: dto.position.y,
        width: dto.width,
        height: dto.height,
      },
    });

    this.realtime.boardChanged(boardId);
    return toColumn(column);
  }

  async update(userId: string, columnId: string, dto: UpdateColumnDto) {
    const existing = await this.loadAuthorised(userId, columnId);

    const data: Prisma.ColumnUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.position !== undefined) {
      data.posX = dto.position.x;
      data.posY = dto.position.y;
    }
    if (dto.width !== undefined) data.width = dto.width;
    if (dto.height !== undefined) data.height = dto.height;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Nothing to update',
      });
    }

    const column = await this.prisma.column.update({ where: { id: existing.id }, data });

    this.realtime.boardChanged(existing.boardId);
    return toColumn(column);
  }

  async remove(userId: string, columnId: string) {
    const existing = await this.loadAuthorised(userId, columnId);

    const siblings = await this.prisma.column.findMany({
      where: { boardId: existing.boardId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    const fallback = siblings.find((c) => c.id !== columnId);
    if (!fallback) throw new BadRequestException('Нельзя удалить последнюю колонку доски');

    // Cards are never lost with their column: they move into the first
    // remaining one, in the same transaction as the delete.
    const [moved] = await this.prisma.$transaction([
      this.prisma.task.updateMany({ where: { columnId }, data: { columnId: fallback.id } }),
      this.prisma.column.delete({ where: { id: columnId } }),
    ]);

    this.realtime.boardChanged(existing.boardId);
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
