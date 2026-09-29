import { useEffect, useState } from 'preact/hooks';
import { parseNum } from '../lib/nutrition';

/**
 * Pole liczbowe z inputmode="decimal" – akceptuje przecinek, nie zeruje się podczas pisania.
 */
export function NumField({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  name,
  min = 0,
  autoFocus,
  testId,
  ariaLabel,
}: {
  ariaLabel?: string;
  label?: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  suffix?: string;
  placeholder?: string;
  name?: string;
  min?: number;
  autoFocus?: boolean;
  testId?: string;
}) {
  const [text, setText] = useState(value == null || Number.isNaN(value) ? '' : fmtInput(value));
  useEffect(() => {
    const cur = parseNum(text);
    if (value == null) {
      if (text !== '' && !Number.isNaN(cur)) setText('');
    } else if (Number.isNaN(cur) || Math.abs(cur - value) > 1e-9) {
      setText(fmtInput(value));
    }
  }, [value]);
  const input = (
    <div class={suffix ? 'input-suffix' : ''}>
      <input
        class="input num"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        name={name}
        placeholder={placeholder}
        value={text}
        autoFocus={autoFocus}
        data-testid={testId}
        aria-label={ariaLabel ?? label}
        onFocus={(e) => (e.currentTarget as HTMLInputElement).select()}
        onInput={(e) => {
          const t = (e.currentTarget as HTMLInputElement).value.replace(/[^0-9.,]/g, '');
          setText(t);
          const n = parseNum(t);
          if (t === '') onChange(null);
          else if (!Number.isNaN(n) && n >= min) onChange(n);
        }}
      />
      {suffix && <span class="suffix">{suffix}</span>}
    </div>
  );
  if (!label) return input;
  return (
    <label class="field">
      <span>{label}</span>
      {input}
    </label>
  );
}

function fmtInput(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r).replace('.', ',');
}
