import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CampusContact } from './campusDirectory';
import {
  CAMPUS_CONTACTS,
  contactsForMode,
  OFFICIAL_RESOURCES,
  validateCampusContact,
} from './campusDirectory';
import { ContactsView } from './ContactsView';

describe('campus directory data', () => {
  it('every record passes validation and carries source, date and verification', () => {
    for (const c of CAMPUS_CONTACTS) {
      expect(validateCampusContact(c)).toEqual([]);
      expect(c.source.label).not.toBe('');
      expect(c.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.verificationNote.length).toBeGreaterThan(20);
    }
  });

  it('nothing is marked institution-confirmed yet', () => {
    expect(CAMPUS_CONTACTS.some((c) => c.verification === 'INSTITUTION_CONFIRMED')).toBe(false);
  });

  it('rejects personal mobile numbers and verified states without a source URL', () => {
    const base = CAMPUS_CONTACTS[0]!;
    const mobile: CampusContact = {
      ...base,
      phoneDial: '+919876543210',
      phoneDisplay: '98765 43210',
    };
    expect(validateCampusContact(mobile)).toContain('personal mobile numbers are not allowed');
    const noUrl: CampusContact = {
      ...base,
      verification: 'PUBLISHED_ONLINE',
      source: { url: null, label: 'x' },
    };
    expect(validateCampusContact(noUrl)).toContain('a verified state needs a source URL');
  });

  it('LIVE withholds every unconfirmed contact', () => {
    expect(contactsForMode(CAMPUS_CONTACTS, 'LIVE')).toEqual({
      shown: [],
      withheld: CAMPUS_CONTACTS.length,
    });
    expect(contactsForMode(CAMPUS_CONTACTS, 'DEMO').shown).toHaveLength(CAMPUS_CONTACTS.length);
  });

  it("official resources are https links on the institution's domains", () => {
    for (const r of OFFICIAL_RESOURCES)
      expect(r.url).toMatch(/^https:\/\/([a-z0-9-]+\.)*amrita\.edu\//);
  });
});

describe('ContactsView', () => {
  it('DEMO: shows each number with its verification state, source and last-checked date', () => {
    render(<ContactsView contacts={CAMPUS_CONTACTS} resources={OFFICIAL_RESOURCES} mode="DEMO" />);
    const list = screen.getByRole('list', { name: 'Campus contacts' });
    const security = within(list).getByRole('heading', { name: 'Security Office' }).closest('li')!;
    expect(within(security).getByText('0422 2685802')).toBeInTheDocument();
    expect(within(security).getByText('Unverified, confirm before LIVE')).toBeInTheDocument();
    expect(within(security).getByText(/source URL not yet recorded/)).toBeInTheDocument();
    expect(
      within(security).getByRole('link', { name: 'Call Security Office, 0422 2685802' }),
    ).toHaveAttribute('href', 'tel:+914222685802');
    const switchboard = within(list)
      .getByRole('heading', { name: 'Campus switchboard' })
      .closest('li')!;
    expect(within(switchboard).getByRole('link', { name: /Contact US/ })).toHaveAttribute(
      'href',
      'https://intranet.cb.amrita.edu/contacts',
    );
    expect(
      screen.getByText(
        /No approved emergency instruction pack, evacuation route or assembly point/,
      ),
    ).toBeInTheDocument();
  });

  it('LIVE: withholds unconfirmed numbers and says so', () => {
    render(<ContactsView contacts={CAMPUS_CONTACTS} resources={OFFICIAL_RESOURCES} mode="LIVE" />);
    expect(screen.queryByText('0422 2685802')).not.toBeInTheDocument();
    expect(
      screen.getByText(/4 contacts are withheld because the institution has not confirmed them/),
    ).toBeInTheDocument();
    expect(screen.getByText('No confirmed campus contacts are configured')).toBeInTheDocument();
  });
});
