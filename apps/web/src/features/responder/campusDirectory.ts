/**
 * Campus contact and official-resource DATA, kept apart from presentation so
 * it can be updated without touching components.
 *
 * Every record carries its source, the date it was last checked and a
 * verification state. Nothing here is INSTITUTION_CONFIRMED yet: the
 * institution must confirm each number before a LIVE deployment, and LIVE
 * mode withholds anything unconfirmed (see contactsForMode).
 *
 * Only office/service lines belong here. Personal staff numbers are rejected
 * by validateCampusContact.
 */
import type { AppMode } from './contracts';

export type ContactVerification =
  /** Confirmed in writing by the institution for this deployment. */
  | 'INSTITUTION_CONFIRMED'
  /** Seen on an official institution web page at `lastChecked`; not confirmed. */
  | 'PUBLISHED_ONLINE'
  /** Supplied to the project but not found on an official page we could check. */
  | 'UNVERIFIED';

export type ContactService =
  'SECURITY_OFFICE' | 'MEDICAL_CLINIC' | 'AMBULANCE' | 'CAMPUS_SWITCHBOARD';

export interface CampusContact {
  id: string;
  service: ContactService;
  label: string;
  /** As written by the source, for display. */
  phoneDisplay: string;
  /** E.164, used for the tel: link. */
  phoneDial: string;
  kind: 'OFFICE_LINE';
  source: { url: string | null; label: string };
  /** ISO date (YYYY-MM-DD) the record was last checked against its source. */
  lastChecked: string;
  verification: ContactVerification;
  verificationNote: string;
}

export interface OfficialResource {
  id: string;
  title: string;
  url: string;
  description: string;
  publisher: string;
  lastChecked: string;
}

const CHECKED = '2026-10-10';
// Supplied by the project team as listed in the published Coimbatore campus
// directory. A check on 10 Oct 2026 did not find these numbers on
// intranet.cb.amrita.edu/contacts or amrita.edu/contact.
const SUPPLIED_NOTE =
  "Not found on the official contact pages checked on 10 Oct 2026. Record the source URL and get the institution's confirmation before LIVE use.";
const SUPPLIED_SOURCE = {
  url: null,
  label: 'Published Coimbatore campus directory (source URL not yet recorded)',
};

export const CAMPUS_CONTACTS: readonly CampusContact[] = [
  {
    id: 'cb-security-office',
    service: 'SECURITY_OFFICE',
    label: 'Security Office',
    phoneDisplay: '0422 2685802',
    phoneDial: '+914222685802',
    kind: 'OFFICE_LINE',
    source: SUPPLIED_SOURCE,
    lastChecked: CHECKED,
    verification: 'UNVERIFIED',
    verificationNote: SUPPLIED_NOTE,
  },
  {
    id: 'cb-medical-clinic',
    service: 'MEDICAL_CLINIC',
    label: 'Medical / Clinic',
    phoneDisplay: '0422 2685801',
    phoneDial: '+914222685801',
    kind: 'OFFICE_LINE',
    source: SUPPLIED_SOURCE,
    lastChecked: CHECKED,
    verification: 'UNVERIFIED',
    verificationNote: SUPPLIED_NOTE,
  },
  {
    id: 'cb-ambulance',
    service: 'AMBULANCE',
    label: 'Ambulance',
    phoneDisplay: '0422 2685800',
    phoneDial: '+914222685800',
    kind: 'OFFICE_LINE',
    source: SUPPLIED_SOURCE,
    lastChecked: CHECKED,
    verification: 'UNVERIFIED',
    verificationNote: SUPPLIED_NOTE,
  },
  {
    id: 'cb-switchboard',
    service: 'CAMPUS_SWITCHBOARD',
    label: 'Campus switchboard',
    phoneDisplay: '+91-422-2685000',
    phoneDial: '+914222685000',
    kind: 'OFFICE_LINE',
    source: {
      url: 'https://intranet.cb.amrita.edu/contacts',
      label: 'Amrita Coimbatore intranet: Contact US',
    },
    lastChecked: CHECKED,
    verification: 'PUBLISHED_ONLINE',
    verificationNote:
      'Listed as the campus telephone number on the official contact page on 10 Oct 2026. The institution must confirm it before LIVE use.',
  },
];

/** General institution pages only. These are not emergency procedures. */
export const OFFICIAL_RESOURCES: readonly OfficialResource[] = [
  {
    id: 'amrita-contact',
    title: 'Amrita Vishwa Vidyapeetham: Contact Us',
    url: 'https://www.amrita.edu/contact/',
    description: 'Official university contact page.',
    publisher: 'Amrita Vishwa Vidyapeetham',
    lastChecked: CHECKED,
  },
  {
    id: 'cb-intranet-contacts',
    title: 'Coimbatore campus intranet: Contact US',
    url: 'https://intranet.cb.amrita.edu/contacts',
    description: 'Official Coimbatore campus contact page.',
    publisher: 'Amrita Vishwa Vidyapeetham, Coimbatore',
    lastChecked: CHECKED,
  },
];

export const VERIFICATION_PRESENTATION: Record<
  ContactVerification,
  { label: string; icon: string; tone: string }
> = {
  INSTITUTION_CONFIRMED: { label: 'Confirmed by institution', icon: '✓', tone: 'done' },
  PUBLISHED_ONLINE: { label: 'Published online, not yet confirmed', icon: '◐', tone: 'progress' },
  UNVERIFIED: { label: 'Unverified, confirm before LIVE', icon: '!', tone: 'urgent' },
};

/** LIVE shows only institution-confirmed contacts; DEMO/DRILL show all, labelled. */
export function contactsForMode(contacts: readonly CampusContact[], mode: AppMode) {
  const shown =
    mode === 'LIVE'
      ? contacts.filter((c) => c.verification === 'INSTITUTION_CONFIRMED')
      : [...contacts];
  return { shown, withheld: contacts.length - shown.length };
}

/** Indian mobile numbers (+91 then 6–9 and nine digits) are treated as personal. */
const PERSONAL_MOBILE = /^\+91[6-9]\d{9}$/;

export function validateCampusContact(c: CampusContact): string[] {
  const problems: string[] = [];
  if (!/^\+\d{8,15}$/.test(c.phoneDial)) problems.push('phoneDial must be E.164');
  if (PERSONAL_MOBILE.test(c.phoneDial)) problems.push('personal mobile numbers are not allowed');
  if (c.kind !== 'OFFICE_LINE') problems.push('only office lines are allowed');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.lastChecked) || Number.isNaN(Date.parse(c.lastChecked))) {
    problems.push('lastChecked must be an ISO date');
  }
  if (!c.source.label.trim()) problems.push('source label required');
  if (c.verification !== 'UNVERIFIED' && !c.source.url)
    problems.push('a verified state needs a source URL');
  if (c.source.url && !/^https:\/\//.test(c.source.url)) problems.push('source URL must be https');
  if (c.phoneDial.replace(/\D/g, '').slice(-7) !== c.phoneDisplay.replace(/\D/g, '').slice(-7)) {
    problems.push('display and dial numbers differ');
  }
  return problems;
}
