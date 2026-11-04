import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { DbModule } from './db/db.module';
import { GradesController } from './grades/grades.controller';
import { GymsModule } from './gyms/gyms.module';
import { HealthController } from './health.controller';
import { PlansModule } from './plans/plans.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    GymsModule,
    SessionsModule,
    PlansModule,
  ],
  controllers: [HealthController, GradesController],
})
export class AppModule {}
