import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators';
import type { User } from '../auth/users.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreateSessionDto, CreateSessionSchema, ListSessionsQuerySchema } from './session.dto';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(ListSessionsQuerySchema)) query: { limit: number },
  ) {
    return this.sessions.findRecent(user.id, query.limit);
  }

  @Get('stats/progression')
  progression(@CurrentUser() user: User) {
    return this.sessions.progression(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.findOne(user.id, id);
  }

  @Post()
  async create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(CreateSessionSchema)) dto: CreateSessionDto,
  ) {
    const session = await this.sessions.create(user.id, dto);
    this.sessions.changed(user);
    return session;
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    await this.sessions.remove(user.id, id);
    this.sessions.changed(user);
  }
}
