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
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreateSessionDto, CreateSessionSchema, ListSessionsQuerySchema } from './session.dto';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(ListSessionsQuerySchema)) query: { limit: number }) {
    return this.sessions.findRecent(query.limit);
  }

  @Get('stats/progression')
  progression() {
    return this.sessions.progression();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateSessionSchema)) dto: CreateSessionDto) {
    return this.sessions.create(dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.remove(id);
  }
}
