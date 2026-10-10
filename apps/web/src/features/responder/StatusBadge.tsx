export interface StatusBadgeProps {
  label: string;
  icon: string;
  tone: string;
  description?: string;
}

/** Text label + icon + colour, so status never relies on colour alone. */
export function StatusBadge({ label, icon, tone, description }: StatusBadgeProps) {
  return (
    <span className={`sc-badge sc-badge--${tone}`} title={description} data-status-tone={tone}>
      <span aria-hidden="true" className="sc-badge__icon">
        {icon}
      </span>{" "}
      <span className="sc-badge__label">{label}</span>
    </span>
  );
}
