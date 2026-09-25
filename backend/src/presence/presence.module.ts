import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BoardsModule } from '../boards/boards.module';
import { PresenceGateway } from './presence.gateway';

@Module({
  imports: [
    ConfigModule,
    // Same JwtService the HTTP side uses, but with no default secret — the
    // gateway names the access secret explicitly on every verify.
    JwtModule.register({}),
    BoardsModule,
  ],
  providers: [PresenceGateway],
})
export class PresenceModule {}