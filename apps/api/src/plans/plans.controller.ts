import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import type { User } from '../auth/users.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PlansService } from './plans.service';

const GeneratePlanSchema = z.object({
  availableMinutes: z.number().int().min(30).max(300),
  /** Salle du jour (optionnelle) : la séance parle alors en couleurs. */
  gymId: z.string().min(1).optional(),
});

@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Post('generate')
  generate(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(GeneratePlanSchema)) body: z.infer<typeof GeneratePlanSchema>,
  ) {
    return this.plans.generate(user.id, body.availableMinutes, body.gymId);
  }

  @Get()
  recent(@CurrentUser() user: User) {
    return this.plans.recent(user.id);
  }
}
