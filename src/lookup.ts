import { productByBarcode, type OffProduct } from './api/off';
import { foodByBarcode } from './db/db';
import { normalizeBarcode } from './lib/barcode';
import type { Food } from './lib/types';

export type LookupResult =
  | { status: 'found'; food: Food; from: 'local' | 'off' }
  | { status: 'notfound'; code: string; hint?: { name?: string; brand?: string } };

/**
 * Szuka produktu po kodzie: najpierw własne/zapisane produkty (działa offline),
 * potem Open Food Facts.
 */
export async function lookupBarcode(raw: string, signal?: AbortSignal): Promise<LookupResult> {
  const code = normalizeBarcode(raw);
  const local = (await foodByBarcode(code)) ?? (code !== raw ? await foodByBarcode(raw) : undefined);
  if (local) return { status: 'found', food: local, from: 'local' };
  if (!navigator.onLine) throw new Error('Brak internetu – nie mogę sprawdzić kodu w Open Food Facts.');
  const r = await productByBarcode(code, signal);
  if (r.food) return { status: 'found', food: r.food, from: 'off' };
  const inc: OffProduct | undefined = r.incomplete;
  const name = inc?.product_name_pl || inc?.product_name;
  const brand = typeof inc?.brands === 'string' ? inc.brands.split(',')[0]?.trim() : undefined;
  return { status: 'notfound', code, hint: name || brand ? { name, brand } : undefined };
}
