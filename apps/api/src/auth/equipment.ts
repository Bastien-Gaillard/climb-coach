/** Matériel qu'un grimpeur peut avoir sous la main, coché dans son profil. */
export const EQUIPMENT = ['elastic', 'ball', 'hangboard', 'pullup-bar'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  elastic: 'élastique',
  ball: 'balle souple',
  hangboard: 'poutre',
  'pullup-bar': 'barre de traction',
};

/** Présent dans quasiment toutes les salles : coché d'office sur un nouveau compte. */
export const DEFAULT_EQUIPMENT: Equipment[] = ['elastic'];

/** Ne garde que le matériel connu, sans doublon, dans l'ordre de la liste. */
export function normalizeEquipment(list: readonly string[] | null | undefined): Equipment[] {
  const set = new Set(list ?? []);
  return EQUIPMENT.filter((e) => set.has(e));
}
