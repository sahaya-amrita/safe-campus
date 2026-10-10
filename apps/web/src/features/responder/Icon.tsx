/** Small stroke icons, always decorative (aria-hidden); text carries meaning. */
const PATHS = {
  inbox: 'M4 13h4l2 3h4l2-3h4M5 5h14l1 8v6H4v-6z',
  hazard: 'M12 4 2.5 20h19zM12 10v4.5M12 17.2v.1',
  rollcall: 'M9 4h6v3H9zM7 5.5H5V21h14V5.5h-2M8.5 13l2.5 2.5 4.5-5',
  phone:
    'M6 3h3l1.5 5-2 1.5a12 12 0 0 0 6 6l1.5-2 5 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  check: 'M5 12.5 10 17l9-10',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  back: 'M15 5 8 12l7 7',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="sc-icon"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
