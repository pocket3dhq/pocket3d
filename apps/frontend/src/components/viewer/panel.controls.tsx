'use client';

import { FC, KeyboardEvent, PointerEvent, ReactNode, useId, useRef, useState } from 'react';

// The small native controls the viewer's settings panel is built from

export const IconButton: FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}> = ({ label, onClick, disabled, pressed, children }) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={pressed}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className={`flex h-[28px] w-[28px] items-center justify-center rounded-control outline-none hover:bg-textColor/[0.08] focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
      pressed ? 'bg-accent/15 text-accent' : 'text-textMuted hover:text-textColor'
    }`}
  >
    {children}
  </button>
);

export const RowHeading: FC<{ label: string; unit?: string; id?: string; children?: ReactNode }> = ({
  label,
  unit,
  id,
  children,
}) => (
  <div className="flex min-h-[28px] items-center gap-[6px]">
    <span id={id} className="text-[14px] text-textColor/80">
      {label}
      {unit && <span className="ms-[5px] text-textMuted/70">{unit}</span>}
    </span>
    <span className="ms-auto flex items-center gap-[2px]">{children}</span>
  </div>
);

// A collapsible group: an uppercase heading with a chevron
export const Section: FC<{ title: string; defaultOpen?: boolean; children: ReactNode }> = ({
  title,
  defaultOpen = true,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="flex flex-col gap-[14px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="flex items-center gap-[8px] self-start text-[12px] font-semibold uppercase tracking-wider text-textColor"
      >
        {title}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={open ? undefined : '-rotate-90'}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-[16px]">
          {children}
        </div>
      )}
    </div>
  );
};

// The ⓘ after a setting's name: a click shows (or hides) what the setting
// does, under the row (works on touch screens, unlike a hover tooltip)
const InfoButton: FC<{ label: string; open: boolean; onToggle: () => void; controls: string }> = ({
  label,
  open,
  onToggle,
  controls,
}) => (
  <button
    type="button"
    aria-label={`About ${label}`}
    aria-expanded={open}
    aria-controls={controls}
    onClick={onToggle}
    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold leading-none outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
      open ? 'border-accent text-accent' : 'border-textMuted/60 text-textMuted hover:text-textColor'
    }`}
  >
    i
  </button>
);

const InfoText: FC<{ id: string; text: string }> = ({ id, text }) => (
  <p id={id} className="rounded-control bg-textColor/[0.04] px-[10px] py-[8px] text-[12px] leading-[1.45] text-textMuted">
    {text}
  </p>
);

// A setting's name with its optional ⓘ, and the explanation it opens
export const useInfo = (label: string, info?: string) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  return {
    button: info ? <InfoButton label={label} open={open} onToggle={() => setOpen(!open)} controls={id} /> : null,
    text: info && open ? <InfoText id={id} text={info} /> : null,
  };
};

// A labelled range: the value shows next to the name; double-click puts it
// back to `reset`
export const Slider: FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  reset?: number;
  disabled?: boolean;
  // captions under the ends, e.g. "Contact" / "Wide"
  ends?: [string, string];
  info?: string;
}> = ({ label, value, min, max, step, format, onChange, reset, disabled, ends, info }) => {
  const id = useId();
  const about = useInfo(label, info);
  return (
    <div className="flex flex-col gap-[6px]">
      <div className={`flex items-center gap-[6px] ${disabled ? 'opacity-50' : ''}`}>
        <label htmlFor={id} className="text-[14px] text-textColor/80">
          {label}
        </label>
        {about.button}
        <span className="ms-auto font-mono text-[12px] text-textMuted">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={format(value)}
        title={reset === undefined ? undefined : 'Double-click to reset'}
        onChange={(event) => onChange(Number(event.target.value))}
        onDoubleClick={() => reset !== undefined && onChange(reset)}
        className={`h-[18px] w-full cursor-pointer accent-accent disabled:cursor-not-allowed ${disabled ? 'opacity-50' : ''}`}
      />
      {ends && (
        <div className={`-mt-[4px] flex justify-between text-[11px] text-textMuted/80 ${disabled ? 'opacity-50' : ''}`}>
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
      {about.text}
    </div>
  );
};

// The on/off control alone (Switch adds its label)
export const Toggle: FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  labelledBy?: string;
  label?: string;
  id?: string;
}> = ({ checked, onChange, disabled, labelledBy, label, id }) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelledBy}
    aria-label={labelledBy ? undefined : label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-[22px] w-[40px] shrink-0 rounded-full border outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed ${
      checked ? 'border-accent bg-accent' : 'border-line bg-line'
    }`}
  >
    <span
      aria-hidden
      className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-textColor transition-[left] ${
        checked ? 'left-[20px]' : 'left-[2px]'
      }`}
    />
  </button>
);

export const Switch: FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  info?: string;
}> = ({ label, checked, onChange, disabled, info }) => {
  const id = useId();
  const about = useInfo(label, info);
  return (
    <div className="flex flex-col gap-[6px]">
      <div className={`flex min-h-[28px] items-center gap-[8px] ${disabled ? 'opacity-50' : ''}`}>
        {/* the name flips the switch too */}
        <label id={id} htmlFor={`${id}-switch`} className={`text-[14px] text-textColor/80 ${disabled ? '' : 'cursor-pointer'}`}>
          {label}
        </label>
        {about.button}
        <span className="ms-auto flex">
          <Toggle id={`${id}-switch`} checked={checked} onChange={onChange} disabled={disabled} labelledBy={id} />
        </span>
      </div>
      {about.text}
    </div>
  );
};

// A named row of choices (Segmented with its label above, and an ⓘ)
export const Choice = <T extends string | number>({
  label,
  info,
  ...rest
}: {
  label: string;
  info?: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) => {
  const about = useInfo(label, info);
  return (
    <div className="flex flex-col gap-[6px]">
      <div className={`flex items-center gap-[6px] ${rest.disabled ? 'opacity-50' : ''}`}>
        <span className="text-[14px] text-textColor/80">{label}</span>
        {about.button}
      </div>
      <Segmented label={label} {...rest} />
      {about.text}
    </div>
  );
};

// One choice out of a few, as a row of buttons
export const Segmented = <T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) => (
  <div
    role="group"
    aria-label={label}
    className={`grid gap-[2px] rounded-control bg-textColor/[0.06] p-[2px] ${disabled ? 'opacity-50' : ''}`}
    style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
  >
    {options.map((option) => {
      const selected = option.id === value;
      return (
        <button
          key={String(option.id)}
          type="button"
          aria-pressed={selected}
          disabled={disabled}
          onClick={() => onChange(option.id)}
          className={`h-[30px] truncate rounded-[6px] px-[6px] text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed ${
            selected ? 'bg-bgInner text-textColor shadow-sm' : 'text-textMuted hover:text-textColor'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export const SelectField = <T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) => {
  const id = useId();
  return (
    <div className={`flex items-center gap-[10px] ${disabled ? 'opacity-50' : ''}`}>
      <label htmlFor={id} className="text-[14px] text-textColor/80">
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => {
          const picked = options.find((option) => String(option.id) === event.target.value);
          if (picked) onChange(picked.id);
        }}
        className="ms-auto h-[32px] min-w-0 max-w-[60%] rounded-control border border-transparent bg-textColor/[0.06] px-[8px] text-[13px] text-textColor outline-none focus:border-accent disabled:cursor-not-allowed"
      >
        {options.map((option) => (
          <option key={String(option.id)} value={String(option.id)} className="bg-bgInner">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// A value field: type a value (Enter or leaving the field applies it,
// Escape gives up; something unreadable is marked on Enter and dropped on
// leaving), ↑ / ↓ step it (Shift: ×10), and dragging sideways on
// its label scrubs it, like a 3D editor. Without a label it's a plain
// number box (`compact`: as tall as a slider row)
export const ValueField: FC<{
  label?: ReactNode;
  // the name screen readers hear, e.g. "Position X"
  name: string;
  labelClass?: string;
  value: number;
  format: (value: number) => string;
  parse: (text: string) => number | null;
  onChange: (value: number) => void;
  // what one ↑ / ↓ press does
  step: (value: number, direction: 1 | -1) => number;
  // what dragging the label by `dx` pixels does, from where the drag started
  drag: (start: number, dx: number) => number;
  stepper?: boolean;
  disabled?: boolean;
  wide?: boolean;
  compact?: boolean;
}> = ({ label, name, labelClass, value, format, parse, onChange, step, drag, stepper, disabled, wide, compact }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const scrub = useRef<{ x: number; start: number; pointer: number } | null>(null);

  // false when the text can't be read
  const commit = () => {
    if (draft === null) return true;
    const parsed = parse(draft);
    if (parsed === null) return false;
    setInvalid(false);
    setDraft(null);
    if (parsed !== value) onChange(parsed);
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      if (commit()) event.currentTarget.blur();
      else setInvalid(true);
    } else if (event.key === 'Escape') {
      setDraft(null);
      setInvalid(false);
      event.currentTarget.blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? 1 : -1;
      let next = value;
      for (let i = 0; i < (event.shiftKey ? 10 : 1); i++) next = step(next, direction);
      setDraft(null);
      setInvalid(false);
      onChange(next);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub.current = { x: event.clientX, start: value, pointer: event.pointerId };
    setDraft(null);
    setInvalid(false);
  };
  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const current = scrub.current;
    if (!current || current.pointer !== event.pointerId) return;
    onChange(drag(current.start, event.clientX - current.x));
  };
  const endScrub = (event: PointerEvent<HTMLSpanElement>) => {
    if (scrub.current?.pointer === event.pointerId) scrub.current = null;
  };

  return (
    <div
      className={`flex min-w-0 items-center gap-[6px] rounded-control border bg-textColor/[0.06] pe-[4px] focus-within:border-accent ${
        compact ? 'h-[32px]' : 'h-[40px]'
      } ${
        invalid ? 'border-danger' : 'border-transparent'
      } ${disabled ? 'opacity-50' : ''} ${wide ? 'ps-[10px]' : 'ps-[8px]'}`}
    >
      {label !== undefined && (
        <span
          aria-hidden
          title={disabled ? undefined : 'Drag sideways to change'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          className={`flex shrink-0 touch-none select-none items-center gap-[8px] text-[13px] ${
            disabled ? '' : 'cursor-ew-resize'
          } ${labelClass ?? ''}`}
        >
          {label}
        </span>
      )}
      <input
        aria-label={name}
        aria-invalid={invalid || undefined}
        inputMode="decimal"
        spellCheck={false}
        autoComplete="off"
        disabled={disabled}
        value={draft ?? format(value)}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={() => {
          if (!commit()) {
            setDraft(null);
            setInvalid(false);
          }
        }}
        onKeyDown={onKeyDown}
        className={`min-w-0 flex-1 bg-transparent font-mono text-[13px] text-textColor outline-none ${
          wide ? 'text-end' : ''
        }`}
      />
      {stepper && (
        <span className="flex shrink-0 flex-col">
          {([1, -1] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={`${name} ${direction === 1 ? 'up' : 'down'}`}
              onClick={() => onChange(step(value, direction))}
              className="flex h-[14px] w-[16px] items-center justify-center text-textMuted hover:text-textColor disabled:cursor-not-allowed"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <polyline points={direction === 1 ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} />
              </svg>
            </button>
          ))}
        </span>
      )}
    </div>
  );
};

// A slider and a typed value side by side (as LePoly and Blender show a
// material's numbers). Typed values may go past the slider, within `limits`
export const SliderField: FC<{
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  limits?: readonly [number, number];
  format: (value: number) => string;
  parse: (text: string) => number | null;
  onChange: (value: number) => void;
  // double-clicking the slider puts this back
  reset?: number;
  disabled?: boolean;
}> = ({ name, value, min, max, step, limits, format, parse, onChange, reset, disabled }) => {
  const [low, high] = limits ?? [min, max];
  const fit = (next: number) => Math.min(high, Math.max(low, next));
  const tidy = (next: number) => Math.round(next / step) * step;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-[8px]">
      <input
        type="range"
        aria-label={name}
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : max}
        disabled={disabled}
        aria-valuetext={format(value)}
        title={reset === undefined ? undefined : 'Double-click to reset'}
        onChange={(event) => onChange(Number(event.target.value))}
        onDoubleClick={() => reset !== undefined && onChange(reset)}
        className="h-[18px] min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="w-[72px] shrink-0">
        <ValueField
          compact
          name={name}
          value={value}
          format={format}
          parse={(text) => {
            const parsed = parse(text);
            return parsed === null ? null : fit(parsed);
          }}
          disabled={disabled}
          onChange={onChange}
          step={(current, direction) => fit(tidy(current + direction * step * 10))}
          drag={(start) => start}
        />
      </div>
    </div>
  );
};

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

// "#abc" / "abc" → "#AABBCC"
export const normalizeHex = (text: string) => {
  const match = HEX.exec(text.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? match[1].replace(/./g, (c) => c + c) : match[1];
  return `#${digits.toUpperCase()}`;
};

// A colour: the swatch opens the system picker, the hex can be typed
export const ColourField: FC<{
  name: string;
  // #RRGGBB (sRGB)
  hex: string;
  // shown on hover, e.g. the linear values
  title?: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}> = ({ name, hex, title, onChange, disabled }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (draft === null) return true;
    const next = normalizeHex(draft);
    if (!next) return false;
    setDraft(null);
    setInvalid(false);
    if (next !== hex) onChange(next);
    return true;
  };
  return (
    <div className={`flex min-w-0 items-center gap-[8px] ${disabled ? 'opacity-50' : ''}`} title={title}>
      <label
        className="relative h-[28px] w-[28px] shrink-0 cursor-pointer overflow-hidden rounded-control border border-line focus-within:ring-2 focus-within:ring-accent/50"
        style={{ backgroundColor: hex }}
      >
        <span className="sr-only">{name}</span>
        <input
          type="color"
          value={hex.toLowerCase()}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </label>
      <input
        aria-label={`${name}, hex`}
        aria-invalid={invalid || undefined}
        spellCheck={false}
        autoComplete="off"
        disabled={disabled}
        value={draft ?? hex}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={() => {
          if (!commit()) {
            setDraft(null);
            setInvalid(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            if (commit()) event.currentTarget.blur();
            else setInvalid(true);
          } else if (event.key === 'Escape') {
            setDraft(null);
            setInvalid(false);
            event.currentTarget.blur();
          }
        }}
        className={`h-[28px] w-[84px] min-w-0 rounded-control border bg-transparent px-[6px] font-mono text-[13px] text-textColor outline-none focus:border-accent ${
          invalid ? 'border-danger' : 'border-transparent'
        }`}
      />
    </div>
  );
};

// A small mono button, e.g. "RGB" or "UV0" next to a texture
export const Chip: FC<{
  label: string;
  title: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}> = ({ label, title, onClick, active, disabled }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    disabled={disabled || !onClick}
    className={`h-[24px] shrink-0 rounded-control px-[7px] font-mono text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default ${
      active ? 'bg-accent/15 text-accent' : 'bg-textColor/[0.08] text-textColor/80 enabled:hover:text-textColor'
    }`}
  >
    {label}
  </button>
);
