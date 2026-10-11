import { describe, expect, it } from 'vitest';
import { ROUTES, areaOf, canEnter, homeFor, isPublicArea, legacyRedirect } from './routes';

describe('route tree', () => {
  it('classifies each top-level area', () => {
    expect(areaOf('/')).toBe('root');
    expect(areaOf('/auth/login')).toBe('auth');
    expect(areaOf('/student/home')).toBe('student');
    expect(areaOf('/responder/incidents/abc')).toBe('responder');
    expect(areaOf('/admin/users')).toBe('admin');
    expect(areaOf('/help')).toBe('help');
    expect(areaOf('/legal/privacy')).toBe('legal');
    expect(areaOf('/nonsense')).toBe('unknown');
    expect(isPublicArea('help')).toBe(true);
    expect(isPublicArea('legal')).toBe(true);
    expect(isPublicArea('student')).toBe(false);
  });

  it('separates role areas: students, staff and admins', () => {
    expect(canEnter('student', ['STUDENT'])).toBe(true);
    expect(canEnter('responder', ['STUDENT'])).toBe(false);
    expect(canEnter('admin', ['STUDENT'])).toBe(false);

    expect(canEnter('responder', ['RESPONDER'])).toBe(true);
    expect(canEnter('responder', ['INCIDENT_VERIFIER'])).toBe(true);
    expect(canEnter('responder', ['DRILL_MANAGER'])).toBe(true);
    expect(canEnter('admin', ['RESPONDER', 'INCIDENT_VERIFIER', 'DRILL_MANAGER'])).toBe(false);
    expect(canEnter('student', ['RESPONDER'])).toBe(false);

    expect(canEnter('admin', ['ADMIN'])).toBe(true);
    expect(canEnter('responder', ['ADMIN'])).toBe(true);
    expect(canEnter('student', [])).toBe(false);
  });

  it('lands each role on its own home', () => {
    expect(homeFor(['STUDENT'])).toBe(ROUTES.student.home);
    expect(homeFor(['RESPONDER'])).toBe(ROUTES.responder.overview);
    expect(homeFor(['DRILL_MANAGER'])).toBe(ROUTES.responder.overview);
    expect(homeFor(['ADMIN'])).toBe(ROUTES.admin.dashboard);
    expect(homeFor(['STUDENT', 'ADMIN'])).toBe(ROUTES.admin.dashboard);
  });

  it('redirects pre-2.0 paths so bookmarks and installed apps keep working', () => {
    expect(legacyRedirect('/home')).toBe('/student/home');
    expect(legacyRedirect('/sos')).toBe('/student/sos');
    expect(legacyRedirect('/r/help')).toBe('/responder/help');
    expect(legacyRedirect('/r/incidents/1234')).toBe('/responder/incidents/1234');
    expect(legacyRedirect('/r')).toBe('/responder');
    expect(legacyRedirect('/login')).toBe('/auth/login');
    expect(legacyRedirect('/student/home')).toBeNull();
    expect(legacyRedirect('/')).toBeNull();
  });
});
