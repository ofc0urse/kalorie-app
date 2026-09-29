import { BACKUP_STORES, dumpStores, kvGet, kvSet, restoreStores } from '../db/db';
import type { Settings } from './types';

export const BACKUP_FORMAT = 'kalorie-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  settings: Partial<Settings> | null;
  data: Record<string, unknown[]>;
}

export async function createBackup(): Promise<Backup> {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: (await kvGet<Partial<Settings>>('settings')) ?? null,
    data: await dumpStores(),
  };
}

export function validateBackup(x: unknown): Backup {
  if (!x || typeof x !== 'object') throw new Error('Plik nie zawiera poprawnego JSON-a.');
  const b = x as Partial<Backup>;
  if (b.format !== BACKUP_FORMAT) throw new Error('To nie jest kopia zapasowa tej aplikacji.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new Error('Nieobsługiwana wersja kopii – zaktualizuj aplikację.');
  if (!b.data || typeof b.data !== 'object') throw new Error('Kopia nie zawiera danych.');
  for (const s of BACKUP_STORES) {
    const rows = (b.data as Record<string, unknown>)[s];
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Uszkodzona sekcja: ${s}`);
  }
  const entries = ((b.data as Record<string, unknown[]>).entries ?? []) as Record<string, unknown>[];
  for (const e of entries) {
    if (typeof e?.id !== 'string' || typeof e?.date !== 'string' || typeof e?.grams !== 'number' || typeof e?.food !== 'object') {
      throw new Error('Uszkodzony wpis w dzienniku.');
    }
  }
  return b as Backup;
}

export async function restoreBackup(b: Backup, mode: 'replace' | 'merge'): Promise<void> {
  await restoreStores(b.data, mode);
  if (b.settings && mode === 'replace') await kvSet('settings', b.settings);
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `kalorie-kopia-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}
