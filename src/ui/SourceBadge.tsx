import type { FoodSource } from '../lib/types';

const LABELS: Record<FoodSource, string | null> = {
  builtin: null,
  custom: 'własny',
  off: 'OFF',
  usda: 'USDA',
  recipe: 'przepis',
  ai: 'AI',
};

export function SourceBadge({ source }: { source: FoodSource }) {
  const l = LABELS[source];
  if (!l) return null;
  return <span class={`badge ${source}`} title={source === 'off' ? 'Open Food Facts' : undefined}>{l}</span>;
}
