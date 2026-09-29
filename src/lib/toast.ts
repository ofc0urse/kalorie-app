import { Store } from './store';

export interface ToastMsg {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
  undo?: () => Promise<void> | void;
}

export const toastStore = new Store<ToastMsg | null>(null);
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string, opts: { kind?: ToastMsg['kind']; undo?: ToastMsg['undo']; ms?: number } = {}): void {
  const msg: ToastMsg = { id: ++seq, text, kind: opts.kind ?? 'info', undo: opts.undo };
  toastStore.set(msg);
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (toastStore.get()?.id === msg.id) toastStore.set(null);
  }, opts.ms ?? (opts.undo ? 7000 : 3500));
}

export function dismissToast(): void {
  toastStore.set(null);
}
