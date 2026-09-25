import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

export const roomOf = (boardId: string) => `board:${boardId}`;

/**
 * Lets any service tell a board's viewers "this board changed" without
 * knowing about sockets. The presence gateway hands over its server on boot;
 * until then (and in tests without a socket server) it is a no-op.
 */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  /** After any successful write to a board: clients reload it. */
  boardChanged(boardId: string): void {
    this.server?.to(roomOf(boardId)).emit('board:changed', { boardId });
  }
}
