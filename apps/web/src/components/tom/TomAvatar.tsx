/** Tom's face: a friendly helper in a safety hard hat. Decorative only. */
export function TomAvatar({ size = 32 }: { size?: number }) {
  return (
    <svg className="sc-tom__face" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="18" r="11.5" className="sc-tom__skin" />
      <path d="M5.5 15.5a10.5 10.5 0 0 1 21 0z" className="sc-tom__hat" />
      <rect x="3.5" y="14.5" width="25" height="3" rx="1.5" className="sc-tom__hat" />
      <rect x="15" y="6" width="2" height="5" rx="1" className="sc-tom__hat-ridge" />
      <circle cx="12" cy="21" r="1.5" className="sc-tom__ink" />
      <circle cx="20" cy="21" r="1.5" className="sc-tom__ink" />
      <path d="M12.5 25q3.5 2.6 7 0" fill="none" strokeWidth="1.6" strokeLinecap="round" className="sc-tom__smile" />
    </svg>
  );
}
