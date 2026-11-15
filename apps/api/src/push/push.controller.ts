import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import type { User } from '../auth/users.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MAX_ALERTS } from './alerts';
import { PushService } from './push.service';

const Endpoint = z.string().url().max(2000);

const SubscribeSchema = z.object({
  endpoint: Endpoint,
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

const UnsubscribeSchema = z.object({ endpoint: Endpoint });

const AlertsSchema = z.object({
  endpoint: Endpoint,
  alerts: z
    .array(
      z.object({
        at: z.number().int().positive(),
        title: z.string().min(1).max(120),
        body: z.string().max(240),
      }),
    )
    .max(MAX_ALERTS),
});

/** Notifications push de fin de bloc du minuteur. */
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Clé publique VAPID pour s'abonner ; null quand le serveur n'a pas de clés. */
  @Get('key')
  key() {
    return { publicKey: this.push.publicKey };
  }

  @Post('subscribe')
  @HttpCode(204)
  async subscribe(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(SubscribeSchema)) body: z.infer<typeof SubscribeSchema>,
  ) {
    await this.push.subscribe(user.id, { endpoint: body.endpoint, ...body.keys });
  }

  @Post('unsubscribe')
  @HttpCode(204)
  async unsubscribe(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(UnsubscribeSchema)) body: z.infer<typeof UnsubscribeSchema>,
  ) {
    await this.push.unsubscribe(user.id, body.endpoint);
  }

  /** Remplace les fins de bloc à annoncer sur cet appareil. */
  @Put('alerts')
  alerts(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(AlertsSchema)) body: z.infer<typeof AlertsSchema>,
  ) {
    return this.push.schedule(user.id, body.endpoint, body.alerts);
  }
}
