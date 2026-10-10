/**
 * Amrita Sahaya brand — shared by every module (student, responder, maps, drills).
 * TEMPORARY SCAFFOLD LOCATION: integration-owned; see apps/web/SCAFFOLD.md.
 *
 * Source: "Amrita Sahaya Brand Identity Board.png" (raster). The emblem was
 * extracted with an alpha matte from the board's primary logo (≈385×444 px);
 * replace with vector/high-resolution transparent masters when available.
 * Institutional approval of the "Amrita" name and identity is not confirmed.
 */
import emblemUrl from './emblem.png';

export const BRAND = {
  name: 'Amrita Sahaya',
  nameParts: ['Amrita', 'Sahaya'] as const,
  tagline: 'Prepared Together. Protected Together.',
  /** Exact hex values stated on the brand board (the rendered swatches differ slightly). */
  colors: {
    maroon: '#A4123F',
    teal: '#176B65',
    navy: '#15273B',
    ivory: '#F7F5F1',
  },
  /** Transparent primary emblem (250×288). On dark backgrounds, place it on an ivory tile: its navy arc disappears on navy. */
  emblemUrl,
  emblemSize: { width: 250, height: 288 },
} as const;
