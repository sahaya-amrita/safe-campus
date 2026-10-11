import { useEffect, useRef } from 'react';
import { BRAND } from '../../brand';
import { AppIcon, Button } from '../../design-system';

/**
 * Shown once after an email code creates a student account. It explains the
 * app and asks for nothing: no permissions are requested here.
 */
export function WelcomeScreen({ name, onContinue }: { name: string; onContinue: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <main className="as-welcome">
      <span className="as-welcome__emblem">
        <img src={BRAND.emblemUrl} alt="" width={44} height={51} />
      </span>
      <div>
        <h1 className="as-welcome__title" ref={heading} tabIndex={-1}>
          Welcome, {name}
        </h1>
        <p className="as-welcome__tag">{BRAND.tagline}</p>
      </div>
      <ul className="as-welcome__points">
        <li>
          <AppIcon name="phone" />
          <span>
            <strong>In an emergency, call 112 first.</strong> This app does not replace emergency
            services or campus security.
          </span>
        </li>
        <li>
          <AppIcon name="check" />
          <span>
            Tell campus you are safe, or ask for help, during a drill or incident. The app always
            shows whether your message was only saved on this phone or received by the server.
          </span>
        </li>
        <li>
          <AppIcon name="pin" />
          <span>
            Location and camera are used only when you choose to add them, and only after your
            browser asks you.
          </span>
        </li>
        <li>
          <AppIcon name="info" />
          <span>
            {BRAND.name} is a student prototype. It is not approved by the university, and its maps
            and contacts are not verified.
          </span>
        </li>
      </ul>
      <Button block onClick={onContinue}>
        Continue
      </Button>
    </main>
  );
}
