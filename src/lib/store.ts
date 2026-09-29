import { useEffect, useState } from 'preact/hooks';

/** Minimalny reaktywny magazyn (bez zależności). */
export class Store<T> {
  private listeners = new Set<(v: T) => void>();
  constructor(private value: T) {}
  get(): T {
    return this.value;
  }
  set(v: T): void {
    this.value = v;
    this.listeners.forEach((l) => l(v));
  }
  update(fn: (v: T) => T): void {
    this.set(fn(this.value));
  }
  subscribe(fn: (v: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export function useStore<T>(store: Store<T>): T {
  const [v, setV] = useState(store.get());
  useEffect(() => {
    setV(store.get());
    return store.subscribe(setV);
  }, [store]);
  return v;
}
