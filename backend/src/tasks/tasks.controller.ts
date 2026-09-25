import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('boards/:boardId/tasks')
  list(@CurrentUser() user: AuthUser, @Param('boardId') boardId: string) {
    return this.tasks.listForBoard(user.id, boardId);
  }

  @Post('boards/:boardId/tasks')
  create(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(user.id, boardId, dto);
  }

  // The hot path: dragging a card hits this with `{ position }` only.
  @Patch('tasks/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(user.id, id, dto);
  }

  @Delete('tasks/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.remove(user.id, id);
  }
}