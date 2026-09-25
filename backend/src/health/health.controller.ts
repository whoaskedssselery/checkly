import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness + database reachability. Public: load balancers call it. */
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new HttpException(
        { code: 'SERVER_ERROR', message: 'Database is unreachable' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: 'ok' };
  }
}
