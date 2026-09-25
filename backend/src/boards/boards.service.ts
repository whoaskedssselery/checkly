import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AddMemberDto } from './dto/add-member.dto';
import type { CreateBoardDto } from './dto/create-board.dto';

/**
 * What a brand-new board opens with. These are ordinary rows, not an enum:
 * rename them, move them, delete them. They exist because a board with zero
 * columns is a board you cannot put a task on, and the very first thing the
 * frontend does is drop a card somewhere.
 */
const DEFAULT_COLUMNS = [
  { name: 'Backlog', color: 'var(--reel-1)', posX: 20, posY: 0 },
  { name: 'In progress', color: 'var(--reel-2)', posX: 340, posY: 0 },
  { name: 'Done', color: 'var(--reel-3)', posX: 660, posY: 0 },
];

// No I, O, 0, 1 — the code gets read off a screen and typed by hand.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const BOARD_SUMMARY_SELECT = {
  id: true,
  name: true,
  code: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: true, tasks: true, columns: true } },
} satisfies Prisma.BoardSelect;

type BoardSummaryRow = Prisma.BoardGetPayload<{ select: typeof BOARD_SUMMARY_SELECT }>;

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    const boards = await this.prisma.board.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
      select: BOARD_SUMMARY_SELECT,
    });
    return boards.map(toBoardSummary);
  }

  async create(userId: string, dto: CreateBoardDto) {
    const name = dto.name?.trim() || 'Моя доска';
    const code = await this.mintCode();

    const board = await this.prisma.board.create({
      data: {
        name,
        code,
        ownerId: userId,
        members: { create: { userId, role: 'owner' } },
        columns: { create: DEFAULT_COLUMNS },
      },
      select: BOARD_SUMMARY_SELECT,
    });

    return toBoardSummary(board);
  }

  async getForUser(userId: string, boardId: string) {
    await this.assertMember(boardId, userId);

    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      select: {
        ...BOARD_SUMMARY_SELECT,
        members: {
          orderBy: { createdAt: 'asc' },
          select: {
            role: true,
            user: {
              select: { id: true, email: true, name: true, avatarColor: true },
            },
          },
        },
      },
    });

    if (!board) throw new NotFoundException('Доска не найдена');

    return {
      ...toBoardSummary(board),
      members: board.members.map((m) => ({ role: m.role, ...m.user })),
    };
  }

  async addMember(userId: string, boardId: string, dto: AddMemberDto) {
    await this.assertMember(boardId, userId);

    const email = dto.email.trim().toLowerCase();
    const invitee = await this.prisma.user.findUnique({ where: { email } });
    if (!invitee) {
      throw new NotFoundException('Пользователь с таким email не найден');
    }

    const already = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: invitee.id } },
    });
    if (already) throw new ConflictException('Пользователь уже в этой доске');

    const member = await this.prisma.boardMember.create({
      data: { boardId, userId: invitee.id, role: 'member' },
      select: {
        role: true,
        user: { select: { id: true, email: true, name: true, avatarColor: true } },
      },
    });

    return { role: member.role, ...member.user };
  }

  /**
   * Every board-scoped route funnels through here. A board you are not a
   * member of and a board that does not exist answer the same way, so the
   * API does not confirm which board ids are real to someone probing it.
   */
  async assertMember(boardId: string, userId: string): Promise<void> {
    const member = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException('Нет доступа к этой доске');
  }

  private async mintCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = `CHK-${randomCode(4)}`;
      const clash = await this.prisma.board.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!clash) return code;
    }
    throw new BadRequestException('Не удалось сгенерировать код доски');
  }
}

function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function toBoardSummary(board: BoardSummaryRow) {
  return {
    id: board.id,
    name: board.name,
    code: board.code,
    ownerId: board.ownerId,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    counts: {
      members: board._count.members,
      columns: board._count.columns,
      tasks: board._count.tasks,
    },
  };
}