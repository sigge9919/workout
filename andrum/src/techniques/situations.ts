import type { Situation } from '../engine/types';

export interface SituationInfo {
  id: Situation;
  label: string;
  hint: string;
  /** Teknik som snabbvalet startar. */
  techniqueId: string;
}

export const SITUATIONS: SituationInfo[] = [
  { id: 'prematch', label: 'Före match', hint: 'Väck kroppen och skärp fokus', techniqueId: 'activation' },
  { id: 'break', label: 'Paus / periodvila', hint: 'Ner i puls på en minut', techniqueId: 'sigh' },
  { id: 'post', label: 'Efter träning', hint: 'Starta återhämtningen', techniqueId: 'cooldown' },
  { id: 'sleep', label: 'Sömn', hint: 'Varva ner inför natten', techniqueId: '478' },
  { id: 'focus', label: 'Fokus', hint: 'Lugn och kontroll', techniqueId: 'box' },
];

export const SITUATION_LABELS: Record<Situation, string> = Object.fromEntries(
  SITUATIONS.map((s) => [s.id, s.label]),
) as Record<Situation, string>;
