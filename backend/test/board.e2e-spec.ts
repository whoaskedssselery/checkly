import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, createApp, firstBoard, register, type Session, task } from './helpers';

describe('boards, columns and tasks (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  describe('boards', () => {
    it('creates a board with the three starter columns, hex colours and a shareable code', async () => {
      const s = await register(app);
      const res = await http().post('/boards').set(bearer(s)).send({ name: '  Курсовой  ' }).expect(201);

      expect(res.body.name).toBe('Курсовой');
      expect(res.body.code).toMatch(/^CHK-[A-Z0-9]{4}$/);
      expect(res.body.columns.map((c: { name: string }) => c.name)).toEqual(['Backlog', 'In progress', 'Done']);
      for (const c of res.body.columns) expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(res.body.tasks).toEqual([]);
      expect(res.body.members).toHaveLength(1);
    });

    it('returns columns, tasks and members in ONE call', async () => {
      const s = await register(app);
      const board = await firstBoard(app, s);
      await http().post(`/boards/${board.id}/tasks`).set(bearer(s)).send(task(board.columns[0].id)).expect(201);

      const res = await http().get(`/boards/${board.id}`).set(bearer(s)).expect(200);
      expect(res.body.columns).toHaveLength(3);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.members[0]).toMatchObject({ id: s.user.id, role: 'owner' });
    });

    it.each([
      ['blank', '   '],
      ['151 characters', 'x'.repeat(151)],
    ])('rejects a %s name', async (_l, name) => {
      const s = await register(app);
      await http().post('/boards').set(bearer(s)).send({ name }).expect(400);
    });

    it('lists only the boards the caller belongs to', async () => {
      const a = await register(app);
      const b = await register(app);
      await http().post('/boards').set(bearer(a)).send({ name: 'A2' }).expect(201);
      const listA = await http().get('/boards').set(bearer(a)).expect(200);
      const listB = await http().get('/boards').set(bearer(b)).expect(200);
      expect(listA.body).toHaveLength(2);
      expect(listB.body).toHaveLength(1);
    });

    describe('joining by code', () => {
      it('adds the caller as a member, accepts any letter case, and is idempotent', async () => {
        const owner = await register(app);
        const guest = await register(app);
        const board = await firstBoard(app, owner);

        const first = await http().post('/boards/join').set(bearer(guest)).send({ code: board.code.toLowerCase() }).expect(200);
        expect(first.body.id).toBe(board.id);
        expect(first.body.members).toHaveLength(2);

        const again = await http().post('/boards/join').set(bearer(guest)).send({ code: board.code }).expect(200);
        expect(again.body.members).toHaveLength(2);
        await http().get(`/boards/${board.id}`).set(bearer(guest)).expect(200);
      });

      it('an unknown code is a 404, a malformed one is a 400', async () => {
        const s = await register(app);
        await http().post('/boards/join').set(bearer(s)).send({ code: 'CHK-0000' }).expect(404);
        const res = await http().post('/boards/join').set(bearer(s)).send({ code: 'hello' }).expect(400);
        expect(res.body.error.fields.code).toBeTruthy();
      });

      it('needs a token', async () => {
        await http().post('/boards/join').send({ code: 'CHK-AAAA' }).expect(401);
      });
    });

    describe('members', () => {
      it('only the owner can add a member by email', async () => {
        const owner = await register(app);
        const member = await register(app);
        const stranger = await register(app);
        const board = await firstBoard(app, owner);

        await http().post(`/boards/${board.id}/members`).set(bearer(owner)).send({ email: member.email }).expect(201);
        // a plain member may not invite anyone
        await http().post(`/boards/${board.id}/members`).set(bearer(member)).send({ email: stranger.email }).expect(403);
      });

      it('does not reveal which emails have an account (unknown and already-in answer alike)', async () => {
        const owner = await register(app);
        const other = await register(app);
        const board = await firstBoard(app, owner);
        await http().post(`/boards/${board.id}/members`).set(bearer(owner)).send({ email: other.email }).expect(201);

        const known = await http().post(`/boards/${board.id}/members`).set(bearer(owner)).send({ email: other.email });
        const unknown = await http().post(`/boards/${board.id}/members`).set(bearer(owner)).send({ email: 'nobody.at.all@test.dev' });
        expect(known.body.error.message).toBe(unknown.body.error.message);
      });
    });

    describe('access control', () => {
      let owner: Session;
      let outsider: Session;
      let board: Awaited<ReturnType<typeof firstBoard>>;
      beforeAll(async () => {
        owner = await register(app);
        outsider = await register(app);
        board = await firstBoard(app, owner);
      });

      it.each([
        ['GET board', (b: string) => http().get(`/boards/${b}`)],
        ['GET columns', (b: string) => http().get(`/boards/${b}/columns`)],
        ['GET tasks', (b: string) => http().get(`/boards/${b}/tasks`)],
        ['POST column', (b: string) => http().post(`/boards/${b}/columns`).send({ name: 'x', position: { x: 0, y: 0 } })],
        ['POST task', (b: string) => http().post(`/boards/${b}/tasks`).send(task(null))],
      ])('%s as a non-member is 403', async (_label, call) => {
        const res = await call(board.id).set(bearer(outsider)).expect(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });

      it('a board id that does not exist answers like one you may not see (403, not 500)', async () => {
        await http().get('/boards/not-a-real-id').set(bearer(owner)).expect(403);
      });

      it('a non-member cannot patch or delete a column or a task of that board', async () => {
        const col = await http().post(`/boards/${board.id}/columns`).set(bearer(owner)).send({ name: 'C', position: { x: 0, y: 0 } }).expect(201);
        const t = await http().post(`/boards/${board.id}/tasks`).set(bearer(owner)).send(task(col.body.id)).expect(201);

        await http().patch(`/columns/${col.body.id}`).set(bearer(outsider)).send({ name: 'hack' }).expect(403);
        await http().delete(`/columns/${col.body.id}`).set(bearer(outsider)).expect(403);
        await http().patch(`/tasks/${t.body.id}`).set(bearer(outsider)).send({ title: 'stolen' }).expect(403);
        await http().delete(`/tasks/${t.body.id}`).set(bearer(outsider)).expect(403);
      });
    });
  });

  describe('columns', () => {
    let s: Session;
    let board: Awaited<ReturnType<typeof firstBoard>>;
    beforeEach(async () => {
      s = await register(app);
      board = await firstBoard(app, s);
    });

    it('creates a column with a hex colour and no size, then stores a size the user gives it', async () => {
      const plain = await http().post(`/boards/${board.id}/columns`).set(bearer(s)).send({ name: '  Review  ', position: { x: 5, y: 6 } }).expect(201);
      expect(plain.body).toMatchObject({ name: 'Review', position: { x: 5, y: 6 } });
      expect(plain.body.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(plain.body.width).toBeUndefined();

      const sized = await http().patch(`/columns/${plain.body.id}`).set(bearer(s)).send({ position: { x: -40, y: -30 }, width: 640, height: 900 }).expect(200);
      expect(sized.body).toMatchObject({ position: { x: -40, y: -30 }, width: 640, height: 900 });

      const reread = await http().get(`/boards/${board.id}`).set(bearer(s)).expect(200);
      const stored = reread.body.columns.find((c: { id: string }) => c.id === plain.body.id);
      expect(stored).toMatchObject({ width: 640, height: 900 });
    });

    it.each([
      ['blank name', { name: '   ' }],
      ['name over 50 characters', { name: 'x'.repeat(51) }],
      ['a CSS variable as colour (the database holds #rrggbb)', { color: 'var(--reel-1)' }],
      ['non-numeric position', { position: { x: 'a', y: 1 } }],
      ['width under 200', { width: 50 }],
      ['height over 5000', { height: 99999 }],
    ])('rejects %s', async (_label, over) => {
      await http().post(`/boards/${board.id}/columns`).set(bearer(s)).send({ name: 'ok', position: { x: 0, y: 0 }, ...over }).expect(400);
    });

    it('PATCH with nothing to change is a 400', async () => {
      await http().patch(`/columns/${board.columns[0].id}`).set(bearer(s)).send({}).expect(400);
    });

    it('deleting a column moves its cards to the first remaining column instead of losing them', async () => {
      const [first, second] = board.columns;
      await http().post(`/boards/${board.id}/tasks`).set(bearer(s)).send(task(second.id, { title: 'stays alive' })).expect(201);

      const res = await http().delete(`/columns/${second.id}`).set(bearer(s)).expect(200);
      expect(res.body).toMatchObject({ removedColumnId: second.id, movedTo: first.id, movedTasks: 1 });

      const after = await http().get(`/boards/${board.id}`).set(bearer(s)).expect(200);
      expect(after.body.columns.map((c: { id: string }) => c.id)).not.toContain(second.id);
      expect(after.body.tasks[0]).toMatchObject({ title: 'stays alive', columnId: first.id });
    });

    it('refuses to delete the last column (400)', async () => {
      for (const c of board.columns.slice(1)) await http().delete(`/columns/${c.id}`).set(bearer(s)).expect(200);
      await http().delete(`/columns/${board.columns[0].id}`).set(bearer(s)).expect(400);
    });

    it('a non-uuid id is a 404, not a 500', async () => {
      await http().patch('/columns/not-a-uuid').set(bearer(s)).send({ name: 'x' }).expect(404);
    });
  });

  describe('tasks', () => {
    let s: Session;
    let board: Awaited<ReturnType<typeof firstBoard>>;
    beforeEach(async () => {
      s = await register(app);
      board = await firstBoard(app, s);
    });
    const create = (body: object) => http().post(`/boards/${board.id}/tasks`).set(bearer(s)).send(body);

    it('create → edit → move → delete round trip keeps the contract shape', async () => {
      const col = board.columns[0].id;
      const created = await create(task(col, { title: '  Padded  ', tags: ['qa'], dueDate: '2026-10-01', description: 'd' })).expect(201);
      expect(created.body).toMatchObject({
        title: 'Padded',
        columnId: col,
        priority: 'medium',
        tags: ['qa'],
        dueDate: '2026-10-01',
        description: 'd',
        position: { x: 1, y: 2 },
      });
      expect(created.body.id).toBeTruthy();

      const edited = await http().patch(`/tasks/${created.body.id}`).set(bearer(s)).send({ priority: 'high', position: { x: 9, y: 9 }, columnId: board.columns[1].id }).expect(200);
      expect(edited.body).toMatchObject({ priority: 'high', position: { x: 9, y: 9 }, columnId: board.columns[1].id, title: 'Padded' });
      expect(new Date(edited.body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.body.updatedAt).getTime());

      await http().delete(`/tasks/${created.body.id}`).set(bearer(s)).expect(200);
      await http().delete(`/tasks/${created.body.id}`).set(bearer(s)).expect(404);
    });

    it('defaults the priority to medium when none is sent', async () => {
      const res = await create({ title: 'x', columnId: board.columns[0].id, position: { x: 0, y: 0 } }).expect(201);
      expect(res.body.priority).toBe('medium');
    });

    describe('a card that belongs to no column', () => {
      it('can be created with columnId null, attached to a column, and detached again', async () => {
        const free = await create(task(null, { title: 'Free' })).expect(201);
        expect(free.body.columnId).toBeNull();

        const attached = await http().patch(`/tasks/${free.body.id}`).set(bearer(s)).send({ columnId: board.columns[0].id }).expect(200);
        expect(attached.body.columnId).toBe(board.columns[0].id);

        const detached = await http().patch(`/tasks/${free.body.id}`).set(bearer(s)).send({ columnId: null, position: { x: 5, y: 5 } }).expect(200);
        expect(detached.body.columnId).toBeNull();
        expect(detached.body.position).toEqual({ x: 5, y: 5 });
      });

      it('survives deleting the column it used to be in', async () => {
        const free = await create(task(null)).expect(201);
        await http().delete(`/columns/${board.columns[1].id}`).set(bearer(s)).expect(200);
        const after = await http().get(`/boards/${board.id}`).set(bearer(s)).expect(200);
        expect(after.body.tasks.find((t: { id: string }) => t.id === free.body.id).columnId).toBeNull();
      });
    });

    it.each([
      ['empty title', { title: '' }],
      ['whitespace-only title (must not be stored as an empty title)', { title: '     ' }],
      ['title over 255 characters', { title: 'x'.repeat(256) }],
      ['unknown priority', { priority: 'urgent' }],
      ['non-numeric position', { position: { x: 'a', y: 1 } }],
      ['position out of range', { position: { x: 1e9, y: 0 } }],
      ['description over 10 000 characters', { description: 'd'.repeat(10_001) }],
      ['more than 20 tags', { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
      ['a tag over 30 characters', { tags: ['x'.repeat(31)] }],
      ['a due date that is not a date', { dueDate: 'tomorrow' }],
    ])('rejects %s', async (_label, over) => {
      await create(task(board.columns[0].id, over)).expect(400);
    });

    it('an unknown column is a 404', async () => {
      await create(task('00000000-0000-0000-0000-000000000000')).expect(404);
    });

    it("a card can never go into ANOTHER board's column — on create or on move", async () => {
      const other = await register(app);
      const otherBoard = await firstBoard(app, other);

      await create(task(otherBoard.columns[0].id)).expect(404);
      const mine = await create(task(board.columns[0].id)).expect(201);
      await http().patch(`/tasks/${mine.body.id}`).set(bearer(s)).send({ columnId: otherBoard.columns[0].id }).expect(404);
    });

    it('PATCH with nothing to change is a 400', async () => {
      const t = await create(task(board.columns[0].id)).expect(201);
      await http().patch(`/tasks/${t.body.id}`).set(bearer(s)).send({}).expect(400);
    });

    it('stores hostile text as plain text — it comes back exactly as sent, and the table survives', async () => {
      const payload = `'; DROP TABLE "Task";-- <img src=x onerror=alert(1)>`;
      const t = await create(task(board.columns[0].id, { title: payload })).expect(201);
      expect(t.body.title).toBe(payload);
      await http().get(`/boards/${board.id}/tasks`).set(bearer(s)).expect(200);
    });

    it('caps a board at 500 cards', async () => {
      // Seed the cap directly, then confirm the API says no rather than growing forever.
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      try {
        await prisma.task.createMany({
          data: Array.from({ length: 500 }, (_, i) => ({
            boardId: board.id,
            columnId: board.columns[0].id,
            title: `bulk ${i}`,
            posX: 0,
            posY: 0,
            tags: [],
          })),
        });
        const res = await create(task(board.columns[0].id)).expect(400);
        expect(res.body.error.message).toMatch(/500/);
      } finally {
        await prisma.$disconnect();
      }
    });

    it('rejects a body over the size limit', async () => {
      const res = await create(task(board.columns[0].id, { description: 'y'.repeat(300_000) }));
      expect([400, 413]).toContain(res.status);
    });
  });
});
