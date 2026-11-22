import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { errorMessage, FOCUS_LABEL } from '../../core/labels';
import { ClimbingPoint, Equipment, Focus, Profile } from '../../core/models';
import { Icon } from '../../shared/icon';

interface EquipmentOption {
  id: Equipment;
  label: string;
  hint: string;
}

/** Même ordre que l'API. */
export const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  {
    id: 'elastic',
    label: 'Élastique',
    hint: 'Exercices d’équilibre pour les épaules',
  },
  {
    id: 'hangboard',
    label: 'Poutre',
    hint: 'Suspensions max ou répétitions 7/3 en bonus',
  },
  {
    id: 'pullup-bar',
    label: 'Barre de traction',
    hint: 'Tractions et blocages en bonus',
  },
];

interface PointGroup {
  label: string;
  points: { id: ClimbingPoint; label: string }[];
}

/** Même ordre que l'API, regroupés comme dans la liste des points faibles d'un grimpeur. */
export const POINT_GROUPS: PointGroup[] = [
  {
    label: 'Force',
    points: [
      { id: 'crimps', label: 'Réglettes' },
      { id: 'slopers', label: 'Plats' },
      { id: 'pinches', label: 'Pinces' },
      { id: 'lock-off', label: 'Tirage et blocages' },
      { id: 'power', label: 'Mouvements explosifs' },
      { id: 'tension', label: 'Tension en dévers' },
      { id: 'pushing', label: 'Poussée et rétablissements' },
      { id: 'compression', label: 'Compression' },
    ],
  },
  {
    label: 'Endurance',
    points: [
      { id: 'resistance', label: 'Blocs longs et traversées' },
      { id: 'recovery', label: 'Récupération entre les essais' },
      { id: 'volume', label: 'Volume de séance' },
    ],
  },
  {
    label: 'Technique',
    points: [
      { id: 'footwork', label: 'Placement des pieds' },
      { id: 'slab', label: 'Dalle et adhérence' },
      { id: 'hips', label: 'Placement des hanches' },
      { id: 'balance', label: 'Équilibre' },
      { id: 'hooks', label: 'Crochets talon et pointe' },
      { id: 'reading', label: 'Lecture et blocs à vue' },
      { id: 'coordination', label: 'Coordination' },
      { id: 'wall-styles', label: 'Tous les murs' },
    ],
  },
  {
    label: 'Mobilité',
    points: [
      { id: 'hip-mobility', label: 'Hanches' },
      { id: 'shoulder-mobility', label: 'Épaules' },
    ],
  },
  {
    label: 'Mental',
    points: [
      { id: 'fall', label: 'Peur de la chute' },
      { id: 'commitment', label: 'Engagement' },
      { id: 'projecting', label: 'Persévérance sur un bloc dur' },
    ],
  },
];

const POINT_ORDER: ClimbingPoint[] = [
  'crimps',
  'slopers',
  'pinches',
  'lock-off',
  'power',
  'tension',
  'pushing',
  'compression',
  'hooks',
  'resistance',
  'recovery',
  'volume',
  'footwork',
  'slab',
  'hips',
  'balance',
  'reading',
  'coordination',
  'wall-styles',
  'hip-mobility',
  'shoulder-mobility',
  'fall',
  'commitment',
  'projecting',
];

export type PointList = 'weakPoints' | 'likedPoints';

/** Choix de l'objectif d'entraînement, « Aucun » d'abord. */
export const GOAL_OPTIONS: { id: Focus | null; label: string }[] = [
  { id: null, label: 'Aucun' },
  { id: 'strength', label: 'Force' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'technique', label: 'Technique' },
];

/**
 * Profil : le matériel disponible, que l'échauffement utilise quand il est coché, puis les points
 * faibles (travaillés en premier) et ce qu'on aime faire (gardé dans chaque séance).
 */
@Component({
  selector: 'app-profile',
  imports: [Icon, NgTemplateOutlet],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfilePage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);

  protected readonly options = EQUIPMENT_OPTIONS;
  protected readonly groups = POINT_GROUPS;
  protected readonly goals = GOAL_OPTIONS;
  protected readonly focusLabel = FOCUS_LABEL;
  protected readonly profile = signal<Profile | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  /** Dernier commit déployé, pour vérifier qu'une mise à jour est bien en ligne. */
  protected readonly version = signal<string | null>(null);

  ngOnInit(): void {
    this.api.version().subscribe({
      next: (v) => this.version.set(v.version),
      error: () => this.version.set(null),
    });
    this.api.profile().subscribe({
      next: (p) => this.profile.set(p),
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  protected has(id: Equipment): boolean {
    return this.profile()?.equipment.includes(id) ?? false;
  }

  /** Coche ou décoche, enregistré tout de suite (annulé si l'API refuse). */
  protected toggle(id: Equipment): void {
    const p = this.profile();
    if (!p || this.saving()) return;
    const set = new Set(p.equipment);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const equipment = EQUIPMENT_OPTIONS.map((o) => o.id).filter((e) => set.has(e));
    this.save(p, { ...p, equipment }, { equipment });
  }

  /**
   * Choisit l'objectif d'entraînement. Son type s'affiche tout de suite comme favorisé ; sans
   * objectif, on attend l'API, qui dit ce que désignent les points faibles.
   */
  protected pickGoal(goal: Focus | null): void {
    const p = this.profile();
    if (!p || this.saving() || p.focusGoal === goal) return;
    const favoredFocus = goal ? { focus: goal, source: 'goal' as const } : p.favoredFocus;
    this.save(p, { ...p, focusGoal: goal, favoredFocus }, { focusGoal: goal });
  }

  protected checked(list: PointList, id: ClimbingPoint): boolean {
    return this.profile()?.[list].includes(id) ?? false;
  }

  /**
   * Coche ou décoche un point. Un point ne peut pas être à la fois faible et aimé : le cocher
   * d'un côté le retire de l'autre.
   */
  protected togglePoint(list: PointList, id: ClimbingPoint): void {
    const p = this.profile();
    if (!p || this.saving()) return;
    const other: PointList = list === 'weakPoints' ? 'likedPoints' : 'weakPoints';
    const set = new Set(p[list]);
    const adding = !set.has(id);
    if (adding) set.add(id);
    else set.delete(id);
    const points = {
      [list]: POINT_ORDER.filter((x) => set.has(x)),
      [other]: adding ? p[other].filter((x) => x !== id) : p[other],
    } as Pick<Profile, PointList>;
    this.save(p, { ...p, ...points }, points);
  }

  /** Affiche tout de suite, enregistre, et revient en arrière si l'API refuse. */
  private save(
    previous: Profile,
    next: Profile,
    body: Parameters<ApiService['updateSettings']>[0],
  ): void {
    this.profile.set(next);
    this.saving.set(true);
    this.error.set(null);
    this.api.updateSettings(body).subscribe({
      next: (saved) => {
        this.profile.set(saved);
        this.saving.set(false);
      },
      error: (err) => {
        this.profile.set(previous);
        this.saving.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}
