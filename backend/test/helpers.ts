import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';

// The auth rate limit is tested on its own; here it must not get in the way
// of the dozens of registrations and logins a test run makes from one address.
process.env.AUTH_RATE_LIMIT = process.env.AUTH_RATE_LIMIT ?? '100000';
process.env.CORS_ORIGIN = 'http://localhost:5173,http://localhost:4173';

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; avatarColor: string };
}

let counter = 0;
export const uniqueEmail = (tag = 'u') =>
  `${tag}.${Date.now()}.${counter++}.${Math.random().toString(36).slice(2, 6)}@test.dev`;

export async function register(
  app: INestApplication,
  over: { email?: string; password?: string; name?: string } = {},
): Promise<Session & { email: string; password: string }> {
  const email = over.email ?? uniqueEmail();
  const password = over.password ?? 'secret12';
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password, name: over.name ?? 'Tester' })
    .expect(201);
  return { ...(res.body as Session), email, password };
}

export const bearer = (s: Session) => ({ Authorization: `Bearer ${s.accessToken}` });

/** The user's first board, with everything on it. */
export async function firstBoard(app: INestApplication, s: Session) {
  const list = await request(app.getHttpServer()).get('/boards').set(bearer(s)).expect(200);
  const id = (list.body as { id: string }[])[0].id;
  const board = await request(app.getHttpServer()).get(`/boards/${id}`).set(bearer(s)).expect(200);
  return board.body as {
    id: string;
    code: string;
    name: string;
    columns: { id: string; name: string; color: string; position: { x: number; y: number } }[];
    tasks: { id: string }[];
    members: { id: string; role: string }[];
  };
}

export const task = (columnId: string | null, over: Record<string, unknown> = {}) => ({
  title: 'Task',
  columnId,
  priority: 'medium',
  position: { x: 1, y: 2 },
  ...over,
});
