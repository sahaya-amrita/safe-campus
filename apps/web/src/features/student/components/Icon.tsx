/**
 * Minimal inline icon set (24×24, stroke-based). Icons are decorative:
 * every use sits next to visible text, so they are hidden from assistive tech.
 */
const PATHS = {
  shield: 'M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  hand: 'M8 13V5.5a1.5 1.5 0 013 0V11m0-6.5a1.5 1.5 0 013 0V11m0-5a1.5 1.5 0 013 0v7c0 4-2.5 7-6.5 7-2.6 0-4.2-1.3-5.6-3.5L4.3 13.6a1.4 1.4 0 012.3-1.6L8 13.5',
  phone: 'M6.6 3.5h3l1.5 4-2 1.3a11 11 0 005.1 5.1l1.3-2 4 1.5v3a2 2 0 01-2.2 2A16.5 16.5 0 014.6 5.7a2 2 0 012-2.2z',
  wifi: 'M2.5 9a14 14 0 0119 0M5.5 12.5a9.5 9.5 0 0113 0M8.7 16a5 5 0 016.6 0M12 19.5h.01',
  wifiOff: 'M3 3l18 18M8.7 16a5 5 0 016.6 0M5.5 12.5a9.4 9.4 0 014.2-2.3M14.6 10.3a9.5 9.5 0 013.9 2.2M2.5 9a14 14 0 014-2.6M12 19.5h.01',
  cloudAlert: 'M7 18h10a4 4 0 00.6-8 6 6 0 00-11.4 1.6A3.2 3.2 0 007 18zM12 10v3.5M12 16h.01',
  book: 'M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5zM4 20.5A2.5 2.5 0 016.5 18H20v3H6.5',
  users: 'M16 20v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 18.5V20M10 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM20 20v-1.5a3.5 3.5 0 00-2.5-3.4M15.5 4.6a3.5 3.5 0 010 6.8',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.7 3.6 5.7 3.6 9s-1.1 6.3-3.6 9c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3z',
  chevron: 'M6.5 9.5l5.5 5.5 5.5-5.5',
  x: 'M6 6l12 12M18 6L6 18',
  pause: 'M9 6v12M15 6v12',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5.5M12 7.5h.01',
  retry: 'M4 12a8 8 0 0113.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.6L4 15.5M4 20v-4.5h4.5',
  camera: 'M4 8.5A2.5 2.5 0 016.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0120 8.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  image: 'M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zM4 16l4.5-4.5 4 4 2.5-2.5L20 18M15.5 9.5h.01',
  locate: 'M12 19a7 7 0 100-14 7 7 0 000 14zM12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M2 12h3M19 12h3',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 008.5 21h7a1.5 1.5 0 001.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `sc-icon ${className}` : 'sc-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
