import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon';

let openCount = 0;

export function Sheet({
  title,
  onClose,
  children,
  label,
}: {
  title?: ComponentChildren;
  onClose: () => void;
  children: ComponentChildren;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    openCount++;
    document.documentElement.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      openCount--;
      if (openCount <= 0) document.documentElement.style.overflow = '';
    };
  }, []);
  return (
    <div
      class="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="sheet" role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)} tabIndex={-1} ref={ref}>
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h2>{title}</h2>
          <button class="icon-btn filled" onClick={onClose} aria-label="Zamknij">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
