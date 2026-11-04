import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'generer' },
  {
    path: 'generer',
    title: 'Générer ma séance',
    loadComponent: () => import('./pages/generate/generate').then((m) => m.GeneratePage),
  },
  {
    path: 'seance',
    title: 'Nouvelle séance',
    loadComponent: () => import('./pages/new-session/new-session').then((m) => m.NewSessionPage),
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
  { path: '**', redirectTo: 'generer' },
];
