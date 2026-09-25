import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';

@Module({
  controllers: [BoardsController],
  providers: [BoardsService],
  // Columns, tasks and the presence gateway all need assertMember.
  exports: [BoardsService],
})
export class BoardsModule {}