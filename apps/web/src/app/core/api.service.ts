import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, Observable, switchMap, timer } from 'rxjs';
import {
  AiStatus,
  ClimbingPoint,
  CreateSession,
  Equipment,
  Focus,
  Cue,
  GeneratedPlan,
  Gym,
  GymInput,
  Profile,
  ProgressionPoint,
  Schedule,
  Session,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  listSessions(limit = 50): Observable<Session[]> {
    return this.http.get<Session[]>(`${this.base}/sessions`, { params: { limit } });
  }

  createSession(body: CreateSession): Observable<Session> {
    return this.http.post<Session>(`${this.base}/sessions`, body);
  }

  deleteSession(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/sessions/${id}`);
  }

  progression(): Observable<ProgressionPoint[]> {
    return this.http.get<ProgressionPoint[]>(`${this.base}/sessions/stats/progression`);
  }

  /** `focus` : type de séance choisi à la place du planning. */
  /** « Changer » la consigne du jour : la suivante, pour 10 séances. */
  nextCue(): Observable<Cue> {
    return this.http.post<Cue>(`${this.base}/plans/cue/next`, {});
  }

  generatePlan(
    availableMinutes: number,
    gymId?: string | null,
    focus?: Focus | null,
  ): Observable<GeneratedPlan> {
    return this.http.post<GeneratedPlan>(`${this.base}/plans/generate`, {
      availableMinutes,
      ...(gymId && { gymId }),
      ...(focus && { focus }),
    });
  }

  /** Prochaines séances conseillées sur les `days` prochains jours. */
  schedule(days = 7): Observable<Schedule> {
    return this.http.get<Schedule>(`${this.base}/plans/schedule`, { params: { days } });
  }

  /**
   * Planning, puis ses mises à jour tant que Mistral relit les notes en arrière-plan
   * (il peut attendre son tour : le modèle gratuit n'accepte qu'un appel toutes les ~30 s).
   */
  liveSchedule(days = 7, everyMs = 6000, maxPolls = 25): Observable<Schedule> {
    return this.schedule(days).pipe(
      expand((s, i) =>
        s.advicePending && i < maxPolls
          ? timer(everyMs).pipe(switchMap(() => this.schedule(days)))
          : EMPTY,
      ),
    );
  }

  /** Refait le planning du mois avec Mistral (il ne change jamais tout seul). */
  regenerateSchedule(days = 7): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/plans/schedule/regenerate`, null, {
      params: { days },
    });
  }

  /** État de Mistral (quota atteint, saturé, en panne). */
  aiStatus(): Observable<AiStatus> {
    return this.http.get<AiStatus>(`${this.base}/plans/ai-status`);
  }

  /** Version déployée de l'appli (dernier commit), « dev » en local. */
  version(): Observable<{ version: string }> {
    return this.http.get<{ version: string }>(`${this.base}/health`);
  }

  /** Compte connecté et ses réglages. */
  profile(): Observable<Profile> {
    return this.http.get<Profile>(`${this.base}/auth/me`);
  }

  /** Réglages du compte connecté. */
  updateSettings(body: {
    sessionsPerWeek?: number;
    equipment?: Equipment[];
    weakPoints?: ClimbingPoint[];
    likedPoints?: ClimbingPoint[];
    focusGoal?: Focus | null;
  }): Observable<Profile> {
    return this.http.patch<Profile>(`${this.base}/auth/me`, body);
  }

  listGyms(): Observable<Gym[]> {
    return this.http.get<Gym[]>(`${this.base}/gyms`);
  }

  createGym(body: GymInput): Observable<Gym> {
    return this.http.post<Gym>(`${this.base}/gyms`, body);
  }

  updateGym(id: string, body: GymInput): Observable<Gym> {
    return this.http.put<Gym>(`${this.base}/gyms/${id}`, body);
  }

  deleteGym(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/gyms/${id}`);
  }
}
