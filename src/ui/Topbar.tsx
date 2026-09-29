import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';
import { goBack } from '../router';

export function Topbar({ title, back = true, right }: { title: ComponentChildren; back?: boolean; right?: ComponentChildren }) {
  return (
    <header class="topbar">
      {back ? (
        <button class="icon-btn" onClick={() => goBack()} aria-label="Wstecz">
          <Icon name="back" />
        </button>
      ) : (
        <span class="spacer" />
      )}
      <h1>{title}</h1>
      {right ?? <span class="spacer" />}
    </header>
  );
}
