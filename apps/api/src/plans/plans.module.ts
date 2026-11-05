import { Module } from '@nestjs/common';
import { GymsModule } from '../gyms/gyms.module';
import { SessionsModule } from '../sessions/sessions.module';
import { MistralGenerator } from './mistral.generator';
import { PlansController } from './plans.controller';
import { CLOCK, PlansService } from './plans.service';
import { RuleBasedGenerator } from './rule-based.generator';

@Module({
  imports: [SessionsModule, GymsModule],
  controllers: [PlansController],
  providers: [
    PlansService,
    MistralGenerator,
    RuleBasedGenerator,
    { provide: CLOCK, useValue: () => new Date() },
  ],
})
export class PlansModule {}
