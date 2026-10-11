import type { ReactNode } from 'react';
import { BRAND } from '../../brand';
import { useRoute } from '../router';
import { ROUTES } from '../routes';
import { AppIcon, StatusBanner, Surface, TopBar } from '../../design-system';

/**
 * Public pages: readable signed in or not, and from the offline app shell.
 * They describe this prototype as it is. Nothing here is reviewed by the
 * university or by legal counsel, and the pages say so.
 */
function PublicLayout({ title, children }: { title: string; children: ReactNode }) {
  const { navigate } = useRoute();
  return (
    <div className="as-public">
      <TopBar
        start={
          <div className="as-brand">
            <span className="as-topbar__emblem">
              <img src={BRAND.emblemUrl} alt="" width={24} height={28} />
            </span>
            <div>
              <p className="as-brand__name">{BRAND.name}</p>
              <p className="as-brand__tag">{BRAND.tagline}</p>
            </div>
          </div>
        }
        end={
          <button
            type="button"
            className="ds-btn ds-btn--ghost ds-btn--sm"
            onClick={() => navigate('/')}
          >
            <AppIcon name="back" size={18} /> Back to app
          </button>
        }
      />
      <main className="as-public__main" id="as-public-main">
        <h1 className="as-public__title">{title}</h1>
        {children}
        <nav className="as-public__links" aria-label="Information pages">
          <a href={`#${ROUTES.help}`}>Help and support</a>
          <a href={`#${ROUTES.legal.privacy}`}>Privacy notice</a>
          <a href={`#${ROUTES.legal.prototype}`}>About this prototype</a>
        </nav>
      </main>
    </div>
  );
}

function EmergencyFirst() {
  return (
    <StatusBanner tone="danger" title="In an emergency, call 112 first">
      This app does not replace emergency services or campus security.{' '}
      <a href="tel:112">Call 112</a>
    </StatusBanner>
  );
}

export function HelpPage() {
  return (
    <PublicLayout title="Help and support">
      <EmergencyFirst />
      <Surface title="What the app's messages mean">
        <dl className="as-public__dl">
          <dt>Saved on this phone, not sent</dt>
          <dd>
            You were offline. Nothing has reached the server yet. The app sends it when you are back
            online, while the app is open.
          </dd>
          <dt>Received by the server</dt>
          <dd>The server stored your message. This does not mean a person has seen it.</dd>
          <dt>Acknowledged</dt>
          <dd>A responder recorded in the system that they saw your request.</dd>
          <dt>Reported, not verified</dt>
          <dd>
            Someone reported this. No authorised reviewer has confirmed it, so treat it with care.
          </dd>
        </dl>
      </Surface>
      <Surface title="Common problems">
        <dl className="as-public__dl">
          <dt>Location does not work</dt>
          <dd>
            Browsers only share location on secure (https) pages, and only after you allow it. You
            can always type a landmark instead.
          </dd>
          <dt>Photos are not uploaded</dt>
          <dd>Photos stay on your phone in this prototype. No upload service exists yet.</dd>
          <dt>I was signed out</dt>
          <dd>Sessions end when the tab closes or the sign-in expires. Sign in again.</dd>
        </dl>
      </Surface>
      <Surface title="Contact">
        <p>
          No official support contact has been approved for this prototype yet. Report problems to
          the project team that gave you access.
        </p>
      </Surface>
    </PublicLayout>
  );
}

export function PrivacyPage() {
  return (
    <PublicLayout title="Privacy notice (draft)">
      <StatusBanner tone="warn" title="Draft for a prototype">
        Not reviewed by the university or legal counsel. It describes what this software stores
        today.
      </StatusBanner>
      <Surface title="On your device">
        <ul className="as-public__list">
          <li>Your sign-in session, in this browser tab only (removed when the tab closes).</li>
          <li>Check-ins and help requests waiting to be sent, until the server receives them.</li>
          <li>Photos you add to a help request. They are never uploaded in this prototype.</li>
          <li>Downloaded safety guides, your language and display preferences.</li>
        </ul>
      </Surface>
      <Surface title="On the server">
        <ul className="as-public__list">
          <li>Your account: email, display name, language and roles.</li>
          <li>
            Check-ins, help requests and incident reports you send, including any location text you
            chose to add.
          </li>
          <li>Trusted contacts you save, alert acknowledgements and drill results.</li>
          <li>An audit record of actions taken by staff and the system.</li>
        </ul>
      </Surface>
      <Surface title="Location, camera and the assistant">
        <ul className="as-public__list">
          <li>Location is read only when you tap to add it, and only with your permission.</li>
          <li>Photos are re-encoded on your phone, which removes hidden location data.</li>
          <li>
            Questions to the Tom assistant go to the project&apos;s server. When the hosted AI
            provider is switched on, the server forwards the question to that provider.
          </li>
        </ul>
      </Surface>
    </PublicLayout>
  );
}

export function PrototypePage() {
  return (
    <PublicLayout title="About this prototype">
      <EmergencyFirst />
      <Surface>
        <ul className="as-public__list">
          <li>
            {BRAND.name} is a student project prototype. It is not approved by the university and is
            not production-ready.
          </li>
          <li>
            It is not connected to campus security, alarms or emergency services. In DEMO mode all
            people, incidents and responders are synthetic.
          </li>
          <li>
            Maps, routes, assembly points and contacts are not verified by the institution. Do not
            rely on them in an emergency.
          </li>
          <li>Translations other than English are unreviewed drafts.</li>
        </ul>
      </Surface>
    </PublicLayout>
  );
}

export function PublicPage({ path }: { path: string }) {
  if (path === ROUTES.legal.privacy) return <PrivacyPage />;
  if (path.startsWith('/legal')) return <PrototypePage />;
  return <HelpPage />;
}
