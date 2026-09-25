import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { BoardsService } from '../boards/boards.service';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT, type PublicUser, UsersService } from '../users/users.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

const BCRYPT_ROUNDS = 10;

const AVATAR_COLORS = ['#d8a851', '#6fa8a0', '#c46d5e', '#8a86c9', '#7fae6a'];

// Computed once at boot. Comparing a submitted password against this when the
// email does not exist keeps "unknown user" and "wrong password" the same
// shape and roughly the same cost, so the response time does not tell an
// attacker which emails are registered.
const TIMING_DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly boards: BoardsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Email уже занят' });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const name = dto.name?.trim() || email.split('@')[0];

    // The account and its first board are made together: a new user is never
    // boardless, and a failure leaves neither behind.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          avatarColor: AVATAR_COLORS[randomBytes(1)[0] % AVATAR_COLORS.length],
        },
        select: PUBLIC_USER_SELECT,
      });
      await this.boards.createInTx(tx, created.id, `Доска ${name}`.slice(0, 80));
      return created;
    });

    return this.issueSession(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const found = await this.users.findByEmail(email);

    const passwordOk = await bcrypt.compare(
      dto.password,
      found?.passwordHash ?? TIMING_DUMMY_HASH,
    );

    if (!found || !passwordOk) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Неверный email или пароль',
      });
    }

    const user = await this.users.publicById(found.id);
    return this.issueSession(user);
  }

  async refresh(token: string): Promise<AuthResult> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh-токен недействителен');
    }

    const tokenHash = sha256(token);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (
      !stored ||
      stored.revokedAt !== null ||
      stored.expiresAt.getTime() <= Date.now() ||
      stored.userId !== payload.sub
    ) {
      throw new UnauthorizedException('Refresh-токен недействителен');
    }

    // Single-use rotation: this token is spent the moment it is redeemed,
    // so a stolen copy is useless after the legitimate client refreshes.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.users.publicById(payload.sub);
    return this.issueSession(user);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(user: PublicUser): Promise<AuthResult> {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? '7d',
      // A jti makes two tokens issued in the same second distinct strings,
      // so their hashes differ and neither collides on the unique index.
      jwtid: randomBytes(16).toString('hex'),
    });

    const decoded = this.jwt.decode(refreshToken) as { exp: number } | null;
    if (!decoded?.exp) throw new UnauthorizedException('Не удалось выпустить токен');

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: sha256(refreshToken),
        userId: user.id,
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { user, accessToken, refreshToken };
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}