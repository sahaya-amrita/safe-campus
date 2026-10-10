import type { ElementType, ReactNode } from 'react';
import { useI18n, type SafetyCriticalKey } from './index';

interface Props {
  k: SafetyCriticalKey;
  as?: ElementType;
  className?: string;
  /** Optional content placed before the text (e.g. an icon). */
  leading?: ReactNode;
  role?: 'alert' | 'status' | 'note';
}

/**
 * Renders a safety-critical string. In a locale that has not been reviewed
 * for safety use, the English source is shown underneath as an explicit
 * fallback, so a draft translation is never the only version on screen.
 */
export function CriticalText({ k, as: Tag = 'p', className, leading, role }: Props) {
  const { t, source, reviewedForSafety } = useI18n();
  return (
    <Tag className={className} role={role}>
      {leading}
      <span>{t[k]}</span>
      {!reviewedForSafety && (
        <span className="sc-source" lang="en" data-testid="english-source">
          {source.englishSourceLabel}: {source[k]}
        </span>
      )}
    </Tag>
  );
}
