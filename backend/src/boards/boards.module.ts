import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';

@Module({
  controllers: [BoardsController],
  providers: [BoardsService],
  // Columns, tasks, auth (the personal board) and the presence gateway all need it.
  exports: [BoardsService],
})
export class BoardsModule {}
