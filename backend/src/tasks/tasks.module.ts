import { Module } from '@nestjs/common';
import { BoardsModule } from '../boards/boards.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [BoardsModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}