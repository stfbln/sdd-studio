import { useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

/** Width each textarea was last fitted at: lines rewrap when it changes. */
const fittedWidth = new WeakMap<HTMLTextAreaElement, number>();

function fitHeight(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
  fittedWidth.set(el, el.clientWidth);
}

/** A textarea that grows with its content (and follows width changes, which rewrap lines). */
export function AutoTextarea({ value, onChange, className = '', ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (ref.current) fitHeight(ref.current);
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== fittedWidth.get(el)) fitHeight(el);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`input textarea ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}
