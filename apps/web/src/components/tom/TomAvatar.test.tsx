import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TomAvatar } from './TomAvatar';

describe('TomAvatar', () => {
  it('stays a flat, decorative face by default', () => {
    const { container } = render(<TomAvatar />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelector('defs')).toBeNull();
  });

  it('adds shading with ids unique to each instance in the floating version', () => {
    const { container } = render(
      <>
        <TomAvatar dimensional />
        <TomAvatar dimensional />
      </>,
    );
    const ids = Array.from(container.querySelectorAll('radialGradient')).map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const skin = container.querySelector('.sc-tom__skin') as SVGElement;
    expect(skin.style.fill).toContain(`#${ids[0]}`);
    expect(container.querySelector('.sc-tom__face--3d')).toHaveAttribute('aria-hidden', 'true');
  });
});
