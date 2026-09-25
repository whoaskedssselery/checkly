import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ColumnsService } from './columns.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

// Two resource shapes in one controller: columns are listed and created
// under their board, but patched and deleted by their own id. Nest allows
// the full path on each handler, so no second controller is needed.
@UseGuards(JwtAuthGuard)
@Controller()
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  @Get('boards/:boardId/columns')
  list(@CurrentUser() user: AuthUser, @Param('boardId') boardId: string) {
    return this.columns.listForBoard(user.id, boardId);
  }

  @Post('boards/:boardId/columns')
  create(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
    @Body() dto: CreateColumnDto,
  ) {
    return this.columns.create(user.id, boardId, dto);
  }

  @Patch('columns/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.columns.update(user.id, id, dto);
  }

  @Delete('columns/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.columns.remove(user.id, id);
  }
}