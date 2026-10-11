/**
 * Amrita Sahaya 2.0 design system. Import the CSS once at the app root
 * (App.tsx does). See docs/v2/05-ui-design-system.md.
 */
import './tokens.css';
import './ds.css';

export * from './components';
// Existing primitives from the integrated app, shared until they move here.
export {
  AppIcon,
  Card,
  EmptyState,
  Loading,
  ModeBanner,
  Pill,
  type AppIconName,
  type Tone,
} from '../app/ui';
