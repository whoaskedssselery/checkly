/**
 * Presence protocol. This is the contract between the gateway and the board
 * client, and it is what the frontend needs to implement.
 *
 *   client → server
 *     board:join      { boardId }        join a board's room
 *     board:leave     {}                 leave it (disconnect also leaves)
 *     cursor:move     { x, y }           board coordinates, throttled client-side
 *     reaction:send   { emoji }          a single short emoji
 *
 *   server → client
 *     presence:state  { users: PresenceUser[] }   sent to the joiner only
 *     presence:join   { user: PresenceUser }      sent to everyone else
 *     presence:leave  { userId, clientId }        sent to everyone else
 *     cursor:move     { userId, clientId, x, y }  sent to everyone else
 *     board:changed   { boardId }                 sent to the whole room after any write
 *     reaction:send   { userId, emoji }           sent to everyone else
 *     error           { message }
 *
 * A socket is on at most one board at a time; joining a second board moves
 * it rather than subscribing it to both. Rooms are named `board:<boardId>`.
 * The token travels in `handshake.auth.token`, because the browser WebSocket
 * API cannot set an Authorization header.
 */

export interface PresenceUser {
  /** The socket id: one per open tab. */
  clientId: string;
  userId: string;
  name: string;
  avatarColor: string;
  cursor: { x: number; y: number };
}

export interface BoardJoinPayload {
  boardId: string;
}

export interface CursorMovePayload {
  x: number;
  y: number;
}

export interface ReactionPayload {
  emoji: string;
}