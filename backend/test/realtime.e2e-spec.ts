import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { bearer, createApp, firstBoard, register, type Session, task } from './helpers';

/** Wait for one event, or fail with a clear message instead of hanging. */
function once<T = unknown>(socket: Socket, event: string, ms = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${event}" within ${ms} ms`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Assert that an event does NOT arrive in the window. */
function never(socket: Socket, event: string, ms = 400): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`unexpected "${event}"`));
    socket.once(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
  });
}

describe('realtime: presence and board changes (e2e)', () => {
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });

  afterEach(() => {
    for (const s of sockets.splice(0)) s.close();
  });

  afterAll(async () => {
    await app.close();
  });

  const connect = (token: string | undefined): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = io(url, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
      setTimeout(() => reject(new Error('connect timeout')), 3000);
    });

  const join = async (socket: Socket, boardId: string) => {
    const state = once<{ users: { clientId: string; userId: string }[] }>(socket, 'presence:state');
    socket.emit('board:join', { boardId });
    return state;
  };

  it('refuses to connect at all without a token, or with a bad one', async () => {
    await expect(connect(undefined)).rejects.toThrow(/Unauthorized/);
    await expect(connect('not.a.token')).rejects.toThrow(/Unauthorized/);
  });

  it('refuses a refresh token where an access token is required', async () => {
    const s = await register(app);
    await expect(connect(s.refreshToken)).rejects.toThrow(/Unauthorized/);
  });

  it('a client may emit board:join the instant it connects (no race with authentication)', async () => {
    const owner = await register(app);
    const board = await firstBoard(app, owner);
    const socket = await connect(owner.accessToken);
    const state = once<{ users: unknown[] }>(socket, 'presence:state');
    socket.emit('board:join', { boardId: board.id }); // straight away, no wait
    expect((await state).users).toEqual([]);
  });

  it('refuses to put a non-member into a board room', async () => {
    const owner = await register(app);
    const outsider = await register(app);
    const board = await firstBoard(app, owner);

    const socket = await connect(outsider.accessToken);
    const err = once<{ message: string }>(socket, 'error');
    socket.emit('board:join', { boardId: board.id });
    expect((await err).message).toMatch(/доступ/i);
  });

  it('tells the joiner who is already there, and tells those there about the joiner', async () => {
    const a = await register(app);
    const b = await register(app);
    const board = await firstBoard(app, a);
    await request(app.getHttpServer()).post('/boards/join').set(bearer(b)).send({ code: board.code }).expect(200);

    const sa = await connect(a.accessToken);
    expect((await join(sa, board.id)).users).toEqual([]);

    const sawJoin = once<{ user: { userId: string; name: string; clientId: string } }>(sa, 'presence:join');
    const sb = await connect(b.accessToken);
    const state = await join(sb, board.id);

    expect(state.users.map((u) => u.userId)).toEqual([a.user.id]);
    const joined = await sawJoin;
    expect(joined.user.userId).toBe(b.user.id);
    expect(joined.user.clientId).toBe(sb.id);
  });

  it('relays cursor moves to the others (with the sender\'s clientId), never back to the sender', async () => {
    const a = await register(app);
    const b = await register(app);
    const board = await firstBoard(app, a);
    await request(app.getHttpServer()).post('/boards/join').set(bearer(b)).send({ code: board.code }).expect(200);
    const sa = await connect(a.accessToken);
    const sb = await connect(b.accessToken);
    await join(sa, board.id);
    await join(sb, board.id);

    const heard = once<{ userId: string; clientId: string; x: number; y: number }>(sa, 'cursor:move');
    const echo = never(sb, 'cursor:move');
    sb.emit('cursor:move', { x: 12.5, y: -3 });

    expect(await heard).toEqual({ userId: b.user.id, clientId: sb.id, x: 12.5, y: -3 });
    await echo;
  });

  it('ignores a cursor that is not a finite number, and a cursor from a socket on no board', async () => {
    const a = await register(app);
    const b = await register(app);
    const board = await firstBoard(app, a);
    await request(app.getHttpServer()).post('/boards/join').set(bearer(b)).send({ code: board.code }).expect(200);
    const sa = await connect(a.accessToken);
    const sb = await connect(b.accessToken);
    await join(sa, board.id);

    const silent = never(sa, 'cursor:move');
    sb.emit('cursor:move', { x: 1, y: 1 }); // not joined yet
    await join(sb, board.id);
    sb.emit('cursor:move', { x: Number.NaN, y: 1 });
    sb.emit('cursor:move', { x: 'a', y: 1 });
    sb.emit('cursor:move', { x: null, y: 1 });
    await silent;
  });

  it('only delivers to people on the same board', async () => {
    const a = await register(app);
    const b = await register(app);
    const boardA = await firstBoard(app, a);
    const boardB = await firstBoard(app, b);
    const sa = await connect(a.accessToken);
    const sb = await connect(b.accessToken);
    await join(sa, boardA.id);
    await join(sb, boardB.id);

    const silent = never(sa, 'cursor:move');
    sb.emit('cursor:move', { x: 5, y: 5 });
    await silent;
  });

  it('a person with two tabs stays present until BOTH are gone (presence is per tab)', async () => {
    const a = await register(app);
    const b = await register(app);
    const board = await firstBoard(app, a);
    await request(app.getHttpServer()).post('/boards/join').set(bearer(b)).send({ code: board.code }).expect(200);
    const sa = await connect(a.accessToken);
    await join(sa, board.id);

    const tab1 = await connect(b.accessToken);
    const tab2 = await connect(b.accessToken);
    await join(tab1, board.id);
    await join(tab2, board.id);

    const left = once<{ userId: string; clientId: string }>(sa, 'presence:leave');
    tab1.emit('board:leave', {});
    expect(await left).toEqual({ userId: b.user.id, clientId: tab1.id });

    // the other tab is still in the room and still heard
    const stillHeard = once<{ clientId: string }>(sa, 'cursor:move');
    tab2.emit('cursor:move', { x: 1, y: 1 });
    expect((await stillHeard).clientId).toBe(tab2.id);
  });

  it('announces a disconnect', async () => {
    const a = await register(app);
    const b = await register(app);
    const board = await firstBoard(app, a);
    await request(app.getHttpServer()).post('/boards/join').set(bearer(b)).send({ code: board.code }).expect(200);
    const sa = await connect(a.accessToken);
    const sb = await connect(b.accessToken);
    await join(sa, board.id);
    await join(sb, board.id);

    const left = once<{ userId: string }>(sa, 'presence:leave');
    sb.close();
    expect((await left).userId).toBe(b.user.id);
  });

  it('relays a short emoji reaction and drops an over-long one', async () => {
    const a = await register(app);
    const b = await register(app);
    const board = await firstBoard(app, a);
    await request(app.getHttpServer()).post('/boards/join').set(bearer(b)).send({ code: board.code }).expect(200);
    const sa = await connect(a.accessToken);
    const sb = await connect(b.accessToken);
    await join(sa, board.id);
    await join(sb, board.id);

    const got = once<{ emoji: string; userId: string }>(sa, 'reaction:send');
    sb.emit('reaction:send', { emoji: '🔥' });
    expect(await got).toEqual({ userId: b.user.id, emoji: '🔥' });

    const silent = never(sa, 'reaction:send');
    sb.emit('reaction:send', { emoji: 'x'.repeat(50) });
    await silent;
  });

  describe('board:changed — the live-update signal', () => {
    let owner: Session;
    let board: Awaited<ReturnType<typeof firstBoard>>;
    let watcher: Socket;
    beforeEach(async () => {
      owner = await register(app);
      board = await firstBoard(app, owner);
      watcher = await connect(owner.accessToken);
      await join(watcher, board.id);
    });

    it.each([
      ['creating a task', async () => request(app.getHttpServer()).post(`/boards/${board.id}/tasks`).set(bearer(owner)).send(task(board.columns[0].id))],
      ['creating a column', async () => request(app.getHttpServer()).post(`/boards/${board.id}/columns`).set(bearer(owner)).send({ name: 'C', position: { x: 0, y: 0 } })],
      ['resizing a column', async () => request(app.getHttpServer()).patch(`/columns/${board.columns[0].id}`).set(bearer(owner)).send({ width: 500 })],
      ['deleting a column', async () => request(app.getHttpServer()).delete(`/columns/${board.columns[1].id}`).set(bearer(owner))],
    ])('is sent to everyone on the board after %s', async (_label, act) => {
      const heard = once<{ boardId: string }>(watcher, 'board:changed');
      const res = await act();
      expect(res.status).toBeLessThan(300);
      expect(await heard).toEqual({ boardId: board.id });
    });

    it('is sent after editing, moving and deleting a task', async () => {
      const t = await request(app.getHttpServer()).post(`/boards/${board.id}/tasks`).set(bearer(owner)).send(task(board.columns[0].id)).expect(201);
      for (const act of [
        () => request(app.getHttpServer()).patch(`/tasks/${t.body.id}`).set(bearer(owner)).send({ position: { x: 3, y: 3 } }),
        () => request(app.getHttpServer()).delete(`/tasks/${t.body.id}`).set(bearer(owner)),
      ]) {
        await new Promise((r) => setTimeout(r, 50));
        const heard = once(watcher, 'board:changed');
        await act();
        await heard;
      }
    });

    it('is NOT sent for a rejected write, or to people on other boards', async () => {
      const other = await register(app);
      const otherWatcher = await connect(other.accessToken);
      await join(otherWatcher, (await firstBoard(app, other)).id);

      const silentOwn = never(watcher, 'board:changed');
      const silentOther = never(otherWatcher, 'board:changed');
      await request(app.getHttpServer()).post(`/boards/${board.id}/tasks`).set(bearer(owner)).send(task(board.columns[0].id, { title: '' })).expect(400);
      await request(app.getHttpServer()).post(`/boards/${board.id}/tasks`).set(bearer(other)).send(task(board.columns[0].id)).expect(403);
      await Promise.all([silentOwn, silentOther]);
    });

    it('is sent when someone joins the board by code', async () => {
      const guest = await register(app);
      const heard = once(watcher, 'board:changed');
      await request(app.getHttpServer()).post('/boards/join').set(bearer(guest)).send({ code: board.code }).expect(200);
      await heard;
    });
  });
});
