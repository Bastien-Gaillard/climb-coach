import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { Database, DB } from '../db/db.module';
import { PushAlert, pushSubscriptions } from '../db/schema';
import { takeDue, upcoming } from './alerts';
import { isGone, PUSH_SENDER, PushSender, PushTarget } from './push.sender';

/** Fréquence de vérification des alertes dues : précision de la notification de fin de bloc. */
export const PUSH_POLL_MS = 1000;

/** Ouvre la séance en cours quand on touche la notification. */
const URL = '/seance-en-cours';

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  get publicKey(): string | null {
    return this.sender.publicKey;
  }

  onModuleInit(): void {
    if (!this.publicKey) {
      this.logger.log('Pas de clés VAPID : notifications push désactivées');
      return;
    }
    this.timer = setInterval(() => void this.dispatchDue(), PUSH_POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Enregistre (ou rattache au compte) l'abonnement d'un appareil. */
  async subscribe(userId: string, target: PushTarget): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values({ ...target, userId })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: target.p256dh, auth: target.auth },
      });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)));
  }

  /** Remplace les alertes à venir de l'appareil (liste vide : minuteur en pause ou séance finie). */
  async schedule(
    userId: string,
    endpoint: string,
    alerts: PushAlert[],
    now = Date.now(),
  ): Promise<{ scheduled: number }> {
    const next = upcoming(alerts, now);
    const updated = await this.db
      .update(pushSubscriptions)
      .set({ alerts: next, nextAt: next[0] ? new Date(next[0].at) : null })
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
      .returning({ endpoint: pushSubscriptions.endpoint });
    if (!updated.length) throw new NotFoundException('Appareil non abonné aux notifications');
    return { scheduled: next.length };
  }

  /** Envoie les alertes arrivées à échéance. Appelée chaque seconde. */
  async dispatchDue(now = Date.now()): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    let sent = 0;
    try {
      const rows = await this.db
        .select()
        .from(pushSubscriptions)
        .where(
          and(isNotNull(pushSubscriptions.nextAt), lte(pushSubscriptions.nextAt, new Date(now))),
        );
      for (const row of rows) {
        const { send, rest } = takeDue(row.alerts, now);
        await this.db
          .update(pushSubscriptions)
          .set({ alerts: rest, nextAt: rest[0] ? new Date(rest[0].at) : null })
          .where(eq(pushSubscriptions.endpoint, row.endpoint));
        if (!send) continue;
        try {
          await this.sender.send(
            row,
            JSON.stringify({ title: send.title, body: send.body, at: send.at, url: URL }),
          );
          sent++;
        } catch (err) {
          if (isGone(err)) {
            await this.db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.endpoint, row.endpoint));
          } else {
            this.logger.warn(`Notification non envoyée : ${(err as Error).message}`);
          }
        }
      }
    } catch (err) {
      this.logger.error(`Envoi des notifications impossible : ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
    return sent;
  }
}
