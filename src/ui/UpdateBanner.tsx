import { useStore } from '../lib/store';
import { Store } from '../lib/store';

export const updateAvailable = new Store<null | (() => void)>(null);

export function UpdateBanner() {
  const update = useStore(updateAvailable);
  if (!update) return null;
  return (
    <div class="notice info" style={{ margin: 'calc(var(--safe-top) + 8px) 16px 0', maxWidth: 608, marginInline: 'auto' }} role="status">
      <div class="grow">Dostępna jest nowa wersja aplikacji.</div>
      <button class="btn small primary" onClick={() => update()}>
        Odśwież
      </button>
    </div>
  );
}
