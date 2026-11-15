import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { DbModule } from './db/db.module';
import { GradesController } from './grades/grades.controller';
import { GymsModule } from './gyms/gyms.module';
import { HealthController } from './health.controller';
import { PlansModule } from './plans/plans.module';
import { PushModule } from './push/push.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    AuthModule,
    GymsModule,
    SessionsModule,
    PlansModule,
    PushModule,
  ],
  controllers: [HealthController, GradesController],
})
export class AppModule {}
