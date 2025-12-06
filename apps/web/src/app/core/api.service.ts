import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateSession, GeneratedPlan, ProgressionPoint, Session } from './models';

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

  generatePlan(availableMinutes: number): Observable<GeneratedPlan> {
    return this.http.post<GeneratedPlan>(`${this.base}/plans/generate`, { availableMinutes });
  }
}
