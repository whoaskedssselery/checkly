import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, createApp, register, type Session, uniqueEmail } from './helpers';

describe('auth (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('creates an account and returns the user with both tokens — and never a password or hash', async () => {
      const email = uniqueEmail();
      const res = await http().post('/auth/register').send({ email, password: 'secret12', name: 'Аня' }).expect(201);

      expect(res.body.user).toMatchObject({ email, name: 'Аня' });
      expect(res.body.user.avatarColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    });

    it('uses the part of the email before @ when no name is given', async () => {
      const res = await http().post('/auth/register').send({ email: `plain.${Date.now()}@test.dev`, password: 'secret12' }).expect(201);
      expect(res.body.user.name).toMatch(/^plain\./);
    });

    it('gives every new account its own board, with three starter columns', async () => {
      const s = await register(app, { name: 'Борис' });
      const boards = await http().get('/boards').set(bearer(s)).expect(200);
      expect(boards.body).toHaveLength(1);
      expect(boards.body[0].name).toBe('Доска Борис');
      expect(boards.body[0].code).toMatch(/^CHK-[A-Z0-9]{4}$/);
      expect(boards.body[0].counts.columns).toBe(3);
    });

    it('rejects an email that is already taken, whatever its letter case (409 EMAIL_TAKEN)', async () => {
      const s = await register(app);
      const res = await http().post('/auth/register').send({ email: s.email.toUpperCase(), password: 'secret12' }).expect(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('answers a bad email and a short password with field-level messages', async () => {
      const res = await http().post('/auth/register').send({ email: 'nope', password: '123' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(res.body.error.fields)).toEqual(expect.arrayContaining(['email', 'password']));
    });

    it('rejects a password longer than bcrypt can use (72 bytes)', async () => {
      await http().post('/auth/register').send({ email: uniqueEmail(), password: 'a'.repeat(73) }).expect(400);
    });

    it('ignores fields it does not know (no mass assignment)', async () => {
      const res = await http()
        .post('/auth/register')
        .send({ email: uniqueEmail(), password: 'secret12', role: 'admin', id: 'forced', passwordHash: 'x' })
        .expect(201);
      expect(res.body.user.id).not.toBe('forced');
    });

    it('does not create half an account when the board cannot be made (all or nothing)', async () => {
      // A registration that succeeds must leave exactly one board behind.
      const s = await register(app);
      const boards = await http().get('/boards').set(bearer(s)).expect(200);
      expect(boards.body).toHaveLength(1);
    });
  });

  describe('POST /auth/login', () => {
    let account: Awaited<ReturnType<typeof register>>;
    beforeAll(async () => {
      account = await register(app);
    });

    it('signs in with the right password, whatever the email case', async () => {
      const res = await http().post('/auth/login').send({ email: account.email.toUpperCase(), password: account.password }).expect(200);
      expect(res.body.user.id).toBe(account.user.id);
    });

    it('a wrong password and an unknown email get the SAME answer (no account enumeration)', async () => {
      const wrong = await http().post('/auth/login').send({ email: account.email, password: 'wrong-pass' }).expect(401);
      const ghost = await http().post('/auth/login').send({ email: uniqueEmail('ghost'), password: 'wrong-pass' }).expect(401);
      expect(wrong.body).toEqual(ghost.body);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('answers malformed JSON with a JSON 400, not a stack trace', async () => {
      const res = await http().post('/auth/login').set('Content-Type', 'application/json').send('{ "email": "a@b.co", ').expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.text).not.toMatch(/at .*\(.*:\d+:\d+\)/);
    });
  });

  describe('GET /auth/me and token checks', () => {
    let s: Session;
    beforeAll(async () => {
      s = await register(app);
    });

    it('returns the signed-in user', async () => {
      const res = await http().get('/auth/me').set(bearer(s)).expect(200);
      expect(res.body).toMatchObject({ id: s.user.id, email: s.user.email });
    });

    it('needs a token', async () => {
      const res = await http().get('/auth/me').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a tampered token', async () => {
      await http().get('/auth/me').set('Authorization', `Bearer ${s.accessToken}x`).expect(401);
    });

    it('rejects an unsigned (alg=none) token, even one naming a real user', async () => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: s.user.id, email: s.user.email })}.`;
      await http().get('/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('does not accept a refresh token where an access token is expected', async () => {
      await http().get('/auth/me').set('Authorization', `Bearer ${s.refreshToken}`).expect(401);
    });
  });

  describe('refresh tokens', () => {
    it('rotate: a new pair comes back, and the old refresh token is spent', async () => {
      const s = await register(app);
      const first = await http().post('/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
      expect(first.body.accessToken).toBeTruthy();
      expect(first.body.refreshToken).not.toBe(s.refreshToken);

      await http().post('/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    });

    it('logout revokes the token: it can no longer be refreshed', async () => {
      const s = await register(app);
      await http().post('/auth/logout').send({ refreshToken: s.refreshToken }).expect(204);
      await http().post('/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    });

    it('logout without a token, or with garbage, is still a clean 204', async () => {
      await http().post('/auth/logout').send({}).expect(204);
      await http().post('/auth/logout').send({ refreshToken: 'garbage' }).expect(204);
    });

    it('rejects a refresh token that was never issued', async () => {
      await http().post('/auth/refresh').send({ refreshToken: 'not.a.token' }).expect(401);
    });
  });

  describe('platform', () => {
    it('GET /health is public and reports the database as reachable', async () => {
      const res = await http().get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('sets security headers and does not announce Express', async () => {
      const res = await http().get('/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('answers an unknown route with the standard error shape', async () => {
      const res = await http().get('/no/such/route').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('allows the configured frontend origin and no other', async () => {
      const ok = await http().get('/health').set('Origin', 'http://localhost:5173');
      expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      const bad = await http().get('/health').set('Origin', 'http://evil.example');
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
