import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { BoardsModule } from '../boards/boards.module';
import { AuthRateLimitGuard } from '../common/guards/auth-rate-limit.guard';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [ConfigModule, PassportModule, UsersModule, BoardsModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AuthRateLimitGuard],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
