import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { DbModule } from './db/db.module';
import { HealthController } from './health.controller';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DbModule, SessionsModule],
  controllers: [HealthController],
})
export class AppModule {}
