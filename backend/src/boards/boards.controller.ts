import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { BoardsService } from './boards.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateBoardDto } from './dto/create-board.dto';
import { JoinBoardDto } from './dto/join-board.dto';

@UseGuards(JwtAuthGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.boards.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBoardDto) {
    return this.boards.create(user.id, dto);
  }

  // Declared before `:id` routes so "join" is never read as a board id.
  @Post('join')
  @HttpCode(HttpStatus.OK)
  join(@CurrentUser() user: AuthUser, @Body() dto: JoinBoardDto) {
    return this.boards.joinByCode(user.id, dto.code);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.boards.getForUser(user.id, id);
  }

  @Post(':id/members')
  addMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.boards.addMember(user.id, id, dto);
  }
}
