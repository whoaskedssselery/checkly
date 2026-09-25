import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { toColumn, toTask } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { AddMemberDto } from './dto/add-member.dto';
import type { CreateBoardDto } from './dto/create-board.dto';

/**
 * What a brand-new board opens with. These are ordinary rows, not an enum:
 * rename them, move them, delete them. They exist because a board with zero
 * columns is a board you cannot put a task on, and the very first thing the
 * frontend does is drop a card somewhere. Colours are #rrggbb.
 */
const DEFAULT_COLUMNS = [
  { name: 'Backlog', color: '#d9a441', posX: 20, posY: 0 },
  { name: 'In progress', color: '#cfc6b2', posX: 340, posY: 0 },
  { name: 'Done', color: '#9aa35e', posX: 660, posY: 0 },
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

const MEMBER_USER_SELECT = { id: true, email: true, name: true, avatarColor: true } as const;

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async listForUser(userId: string) {
    const boards = await this.prisma.board.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
      select: BOARD_SUMMARY_SELECT,
    });
    return boards.map(toBoardSummary);
  }

  async create(userId: string, dto: CreateBoardDto) {
    const board = await this.prisma.$transaction((tx) =>
      this.createInTx(tx, userId, dto.name || 'Моя доска'),
    );
    return this.getForUser(userId, board.id);
  }

  /** A board with the starter columns, owned by `userId`. Runs in the caller's transaction. */
  async createInTx(tx: Prisma.TransactionClient, userId: string, name: string) {
    const code = await this.mintCode(tx);
    return tx.board.create({
      data: {
        name,
        code,
        ownerId: userId,
        members: { create: { userId, role: 'owner' } },
        columns: { create: DEFAULT_COLUMNS },
      },
      select: { id: true },
    });
  }

  /** The whole board in one response: summary, members, columns and tasks. */
  async getForUser(userId: string, boardId: string) {
    await this.assertMember(boardId, userId);

    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      select: {
        ...BOARD_SUMMARY_SELECT,
        members: {
          orderBy: { createdAt: 'asc' },
          select: { role: true, user: { select: MEMBER_USER_SELECT } },
        },
        columns: { orderBy: { createdAt: 'asc' } },
        tasks: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!board) throw new NotFoundException('Доска не найдена');

    return {
      ...toBoardSummary(board),
      members: board.members.map((m) => ({ role: m.role, ...m.user })),
      columns: board.columns.map(toColumn),
      tasks: board.tasks.map(toTask),
    };
  }

  /**
   * Join a board by its shareable code. Idempotent: joining twice is not an
   * error. An unknown code is a plain 404 — the code is the secret, and the
   * answer does not say which part was wrong.
   */
  async joinByCode(userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    const board = await this.prisma.board.findUnique({ where: { code }, select: { id: true } });
    if (!board) throw new NotFoundException('Доски с таким кодом нет');

    await this.prisma.boardMember.upsert({
      where: { boardId_userId: { boardId: board.id, userId } },
      update: {},
      create: { boardId: board.id, userId, role: 'member' },
    });
    this.realtime.boardChanged(board.id);
    return this.getForUser(userId, board.id);
  }

  /** Owner-only: add someone to the board by email. */
  async addMember(userId: string, boardId: string, dto: AddMemberDto) {
    await this.assertMember(boardId, userId);

    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      select: { ownerId: true },
    });
    if (board?.ownerId !== userId) {
      throw new ForbiddenException('Приглашать участников может только владелец доски');
    }

    const invitee = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Unknown email and already-a-member answer the same way, so this cannot
    // be used to find out who has an account.
    if (!invitee) throw new NotFoundException('Не удалось добавить участника');
    const already = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: invitee.id } },
    });
    if (already) throw new ConflictException('Не удалось добавить участника');

    const member = await this.prisma.boardMember.create({
      data: { boardId, userId: invitee.id, role: 'member' },
      select: { role: true, user: { select: MEMBER_USER_SELECT } },
    });
    this.realtime.boardChanged(boardId);
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

  private async mintCode(tx: Prisma.TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = `CHK-${randomCode(4)}`;
      const clash = await tx.board.findUnique({ where: { code }, select: { id: true } });
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
