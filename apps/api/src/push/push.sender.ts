import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';

export const PUSH_SENDER = Symbol('PUSH_SENDER');

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Envoi d'un message push ; remplacé par un faux dans les tests. */
export interface PushSender {
  readonly publicKey: string | null;
  send(target: PushTarget, payload: string): Promise<void>;
}

/** Erreur du service push : 404 et 410 veulent dire que l'abonnement n'existe plus. */
export function isGone(err: unknown): boolean {
  const status = (err as { statusCode?: number } | null)?.statusCode;
  return status === 404 || status === 410;
}

@Injectable()
export class WebPushSender implements PushSender {
  readonly publicKey: string | null;
  private readonly privateKey: string | null;
  private readonly subject: string;

  constructor(config: ConfigService) {
    this.publicKey = config.get<string>('VAPID_PUBLIC_KEY') || null;
    this.privateKey = config.get<string>('VAPID_PRIVATE_KEY') || null;
    this.subject = config.get<string>('VAPID_SUBJECT') ?? 'mailto:climb-coach@localhost';
    if (!this.privateKey) this.publicKey = null;
  }

  async send(target: PushTarget, payload: string): Promise<void> {
    if (!this.publicKey || !this.privateKey) return;
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
      {
        vapidDetails: {
          subject: this.subject,
          publicKey: this.publicKey,
          privateKey: this.privateKey,
        },
        // Une fin de bloc annoncée une minute trop tard ne sert plus à rien
        TTL: 60,
        // Réveille un Android en veille profonde (Doze)
        urgency: 'high',
        // Remplace une alerte du minuteur encore en attente chez le service push
        topic: 'minuteur',
      },
    );
  }
}
