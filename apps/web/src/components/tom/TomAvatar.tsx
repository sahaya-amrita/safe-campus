import { useId } from 'react';

/**
 * Tom's face: a friendly helper in a safety hard hat. Decorative only.
 *
 * `dimensional` (Phase 8, the floating launcher) adds light-and-shade
 * gradients so Tom reads as a rounded, three-dimensional figure. It is still
 * a small inline SVG: no WebGL, nothing to download, nothing that can fail.
 */
export function TomAvatar({
  size = 32,
  dimensional = false,
}: {
  size?: number;
  dimensional?: boolean;
}) {
  const id = `tom${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const skin = dimensional ? { fill: `url(#${id}-skin)` } : undefined;
  const hat = dimensional ? { fill: `url(#${id}-hat)` } : undefined;
  return (
    <svg
      className={dimensional ? 'sc-tom__face sc-tom__face--3d' : 'sc-tom__face'}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      {dimensional && (
        <defs>
          <radialGradient id={`${id}-skin`} cx="0.38" cy="0.32" r="0.75">
            <stop offset="0" style={{ stopColor: 'var(--tom-skin-light, #ffe2c4)' }} />
            <stop offset="0.55" style={{ stopColor: 'var(--tom-skin)' }} />
            <stop offset="1" style={{ stopColor: 'var(--tom-skin-shade, #c98b5e)' }} />
          </radialGradient>
          <linearGradient id={`${id}-hat`} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--tom-hat-light, #ffd54d)' }} />
            <stop offset="1" style={{ stopColor: 'var(--tom-hat)' }} />
          </linearGradient>
        </defs>
      )}
      <circle cx="16" cy="18" r="11.5" className="sc-tom__skin" style={skin} />
      <path d="M5.5 15.5a10.5 10.5 0 0 1 21 0z" className="sc-tom__hat" style={hat} />
      <rect x="3.5" y="14.5" width="25" height="3" rx="1.5" className="sc-tom__hat" style={hat} />
      <rect x="15" y="6" width="2" height="5" rx="1" className="sc-tom__hat-ridge" />
      {dimensional && <ellipse cx="11" cy="9.5" rx="3.2" ry="1.6" className="sc-tom__shine" />}
      <circle cx="12" cy="21" r="1.5" className="sc-tom__ink" />
      <circle cx="20" cy="21" r="1.5" className="sc-tom__ink" />
      <path
        d="M12.5 25q3.5 2.6 7 0"
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="sc-tom__smile"
      />
    </svg>
  );
}
