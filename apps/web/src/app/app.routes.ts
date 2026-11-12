import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'connexion',
    title: 'Connexion',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'generer' },
      {
        path: 'generer',
        title: 'Générer ma séance',
        loadComponent: () => import('./pages/generate/generate').then((m) => m.GeneratePage),
      },
      {
        path: 'planning',
        title: 'Planning',
        loadComponent: () => import('./pages/planning/planning').then((m) => m.PlanningPage),
      },
      {
        path: 'seance-en-cours',
        title: 'Séance en cours',
        loadComponent: () => import('./pages/live/live').then((m) => m.LivePage),
      },
      {
        path: 'seance',
        title: 'Nouvelle séance',
        loadComponent: () =>
          import('./pages/new-session/new-session').then((m) => m.NewSessionPage),
      },
      {
        path: 'historique',
        title: 'Historique',
        loadComponent: () => import('./pages/history/history').then((m) => m.HistoryPage),
      },
      {
        path: 'salles',
        title: 'Mes salles',
        loadComponent: () => import('./pages/gyms/gyms').then((m) => m.GymsPage),
      },
      {
        path: 'convertisseur',
        title: 'Convertisseur',
        loadComponent: () => import('./pages/converter/converter').then((m) => m.ConverterPage),
      },
    ],
  },
  { path: '**', redirectTo: 'generer' },
];
