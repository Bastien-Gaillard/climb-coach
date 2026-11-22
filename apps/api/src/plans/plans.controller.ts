import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import { normalizePreferences } from '../auth/climbing-points';
import { normalizeEquipment } from '../auth/equipment';
import type { User } from '../auth/users.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FocusSchema } from './plan.schema';
import { PlansService } from './plans.service';

const GeneratePlanSchema = z.object({
  availableMinutes: z.number().int().min(30).max(300),
  /** Salle du jour (optionnelle) : la séance parle alors en couleurs. */
  gymId: z.string().min(1).optional(),
  /** Type de séance choisi à la place du planning (sinon, celui du planning). */
  focus: FocusSchema.optional(),
});

const ScheduleQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(42).default(7),
});

const profilePoints = (user: User) => ({
  ...normalizePreferences(user.weakPoints, user.likedPoints),
  focusGoal: user.focusGoal,
});

@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Post('generate')
  generate(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(GeneratePlanSchema)) body: z.infer<typeof GeneratePlanSchema>,
  ) {
    return this.plans.generate(
      user.id,
      body.availableMinutes,
      body.gymId,
      normalizeEquipment(user.equipment),
      profilePoints(user),
      body.focus,
    );
  }

  /** Bouton « Changer » de la consigne du jour : la suivante, pour 10 séances. */
  @Post('cue/next')
  nextCue(@CurrentUser() user: User) {
    return this.plans.changeCue(user.id, profilePoints(user).weakPoints);
  }

  /** Planning des prochains jours : quand grimper, quel type de séance, combien de temps. */
  @Get('schedule')
  schedule(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(ScheduleQuerySchema)) query: z.infer<typeof ScheduleQuerySchema>,
  ) {
    return this.plans.schedule(user.id, query.days, user.sessionsPerWeek, profilePoints(user));
  }

  /** Refait le planning du mois avec Mistral (sinon il ne change jamais tout seul). */
  @Post('schedule/regenerate')
  regenerateSchedule(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(ScheduleQuerySchema)) query: z.infer<typeof ScheduleQuerySchema>,
  ) {
    return this.plans.regenerateSchedule(
      user.id,
      query.days,
      user.sessionsPerWeek,
      profilePoints(user),
    );
  }

  /** État de Mistral : l'appli affiche une bannière quand le quota est atteint. */
  @Get('ai-status')
  aiStatus() {
    return this.plans.aiStatus();
  }

  @Get()
  recent(@CurrentUser() user: User) {
    return this.plans.recent(user.id);
  }
}
