/** Stroke icon set (24px grid). */
const P: Record<string, string> = {
  path: 'M5 19c3-1 4-4 7-4s4 3 7 2M5 12c3-1 4-4 7-4s4 3 7 2M12 3v2',
  review: 'M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5',
  practice: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  words: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h13M8 7h7',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  flame: 'M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8 0 4 3 7 7 7z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  speaker: 'M4 9v6h4l5 4V5L8 9H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12',
  slow: 'M3 16h13a4 4 0 0 0 4-4 4 4 0 0 0-4-4c-3 0-4 3-7 3-2 0-3-1-3-1M6 16v3M14 16v3M20 12h1',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zM5 11a7 7 0 0 0 14 0M12 18v3',
  close: 'M6 6l12 12M18 6 6 18', check: 'M5 12.5l4.5 4.5L19 7.5', lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  play: 'M7 5v14l12-7z', pen: 'M4 20l4-1L19 8l-3-3L5 16l-1 4zM14 6l3 3', chat: 'M4 5h16v11H9l-5 4V5z',
  chevron: 'M9 6l6 6-6 6', chevronDown: 'M6 9l6 6 6-6',
  book: 'M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3V5zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7V5z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z',
  ear: 'M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0M10 9a2 2 0 0 1 4 0',
  wave: 'M2 12h2l2-6 3 12 3-9 2 6 2-3h6', grid: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16',
  keyboard: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  alert: 'M12 3l10 18H2L12 3zM12 10v4M12 17h.01',
  skip: 'M5 5l8 7-8 7V5zM15 5v14', bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.3-1.3L17 5l-3-1-1 2h-2L10 4 7 5l.3 2L6 8.3 4 8l-1 3 2 1v0l-2 1 1 3 2-.3L7.3 17 7 19l3 1 1-2h2l1 2 3-1-.3-2 1.3-1.3 2 .3 1-3-2-1z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
};
const FILLED = new Set(['flame', 'bolt', 'play', 'star']);
export function Icon({ name, size, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={'icon ' + className} aria-hidden="true" width={size} height={size}
      fill={FILLED.has(name) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={P[name] || P.info} />
    </svg>
  );
}
export function ToneShape({ tone, className }: { tone: number; className?: string }) {
  const d: Record<number, string> = { 1: 'M4 5 L36 5', 2: 'M4 15 L36 4', 3: 'M4 11 L16 22 L36 9', 4: 'M4 4 L36 22', 5: 'M18 15 L22 15' };
  return (
    <svg viewBox="0 0 40 26" aria-hidden="true" className={className}>
      <path d="M2 2H38M2 24H38" stroke="currentColor" strokeOpacity=".15" fill="none" />
      <path d={d[tone]} stroke={`var(--t${tone})`} strokeWidth={tone === 5 ? 6 : 3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
