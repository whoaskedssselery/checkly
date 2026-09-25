import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { BoardsService } from '../boards/boards.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  BoardJoinPayload,
  CursorMovePayload,
  PresenceUser,
  ReactionPayload,
} from './presence.types';

/** Everything a socket carries between messages. */
interface SocketState {
  userId: string | null;
  name: string;
  avatarColor: string;
  boardId: string | null;
  cursor: { x: number; y: number };
}

const roomOf = (boardId: string) => `board:${boardId}`;
const MAX_EMOJI_LENGTH = 8;

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class PresenceGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(PresenceGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  /**
   * Authenticate before any message is accepted. An unauthenticated socket
   * is disconnected immediately rather than left connected and idle, so a
   * client cannot sit on the socket waiting for a subscription to slip past.
   */
  async handleConnection(client: Socket): Promise<void> {
    const state = client.data as Partial<SocketState>;

    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) throw new Error('missing token');

      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, avatarColor: true },
      });
      if (!user) throw new Error('unknown user');

      state.userId = user.id;
      state.name = user.name;
      state.avatarColor = user.avatarColor;
      state.boardId = null;
      state.cursor = { x: 0, y: 0 };
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('board:join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: BoardJoinPayload,
  ): Promise<void> {
    const state = client.data as Partial<SocketState>;
    if (!state.userId) return;

    const boardId = payload?.boardId;
    if (typeof boardId !== 'string' || !boardId) {
      client.emit('error', { message: 'Не указана доска' });
      return;
    }

    // Membership is checked on every join, not just on connect — a socket
    // that was valid when it opened is not automatically valid for a board.
    try {
      await this.boards.assertMember(boardId, state.userId);
    } catch {
      client.emit('error', { message: 'Нет доступа к этой доске' });
      return;
    }

    if (state.boardId && state.boardId !== boardId) {
      await this.detachFromBoard(client);
    }

    state.boardId = boardId;
    await client.join(roomOf(boardId));

    const me: PresenceUser = {
      userId: state.userId,
      name: state.name ?? '',
      avatarColor: state.avatarColor ?? 'var(--accent)',
      cursor: state.cursor ?? { x: 0, y: 0 },
    };

    // The joiner gets the roster; everyone else is told only about the join.
    client.emit('presence:state', { users: this.peersOn(boardId, client.id) });
    client.to(roomOf(boardId)).emit('presence:join', { user: me });
  }

  @SubscribeMessage('board:leave')
  async onLeave(@ConnectedSocket() client: Socket): Promise<void> {
    await this.detachFromBoard(client);
  }

  @SubscribeMessage('cursor:move')
  onCursor(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CursorMovePayload,
  ): void {
    const state = client.data as Partial<SocketState>;
    if (!state.userId || !state.boardId) return;
    if (!Number.isFinite(payload?.x) || !Number.isFinite(payload?.y)) return;

    state.cursor = { x: payload.x, y: payload.y };

    client.to(roomOf(state.boardId)).emit('cursor:move', {
      userId: state.userId,
      x: payload.x,
      y: payload.y,
    });
  }

  @SubscribeMessage('reaction:send')
  onReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ReactionPayload,
  ): void {
    const state = client.data as Partial<SocketState>;
    if (!state.userId || !state.boardId) return;

    const emoji = payload?.emoji;
    if (typeof emoji !== 'string' || emoji.length === 0 || emoji.length > MAX_EMOJI_LENGTH) {
      return;
    }

    client.to(roomOf(state.boardId)).emit('reaction:send', {
      userId: state.userId,
      emoji,
    });
  }

  async handleDisconnect(client: Socket): Promise<void> {
    await this.detachFromBoard(client);
  }

  /** Remove the socket from its room and tell the room it left. */
  private async detachFromBoard(client: Socket): Promise<void> {
    const state = client.data as Partial<SocketState>;
    if (!state.boardId) return;

    const room = roomOf(state.boardId);
    client.to(room).emit('presence:leave', { userId: state.userId });
    await client.leave(room);
    state.boardId = null;
  }

  /** Who is currently in the room, apart from the caller. */
  private peersOn(boardId: string, excludeSocketId: string): PresenceUser[] {
    const room = this.server.sockets.adapter.rooms.get(roomOf(boardId));
    if (!room) return [];

    const peers: PresenceUser[] = [];
    for (const socketId of room) {
      if (socketId === excludeSocketId) continue;

      const socket = this.server.sockets.sockets.get(socketId);
      if (!socket) continue;

      const state = socket.data as Partial<SocketState>;
      if (!state.userId) continue;

      peers.push({
        userId: state.userId,
        name: state.name ?? '',
        avatarColor: state.avatarColor ?? 'var(--accent)',
        cursor: state.cursor ?? { x: 0, y: 0 },
      });
    }
    return peers;
  }
}