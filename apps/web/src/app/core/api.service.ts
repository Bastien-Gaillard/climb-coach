import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateSession,
  GeneratedPlan,
  Gym,
  GymInput,
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

  generatePlan(availableMinutes: number, gymId?: string | null): Observable<GeneratedPlan> {
    return this.http.post<GeneratedPlan>(`${this.base}/plans/generate`, {
      availableMinutes,
      ...(gymId && { gymId }),
    });
  }

  /** Prochaines séances conseillées sur les `days` prochains jours. */
  schedule(days = 7): Observable<Schedule> {
    return this.http.get<Schedule>(`${this.base}/plans/schedule`, { params: { days } });
  }

  /** Réglages du compte connecté. */
  updateSettings(body: { sessionsPerWeek: number }): Observable<unknown> {
    return this.http.patch(`${this.base}/auth/me`, body);
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
