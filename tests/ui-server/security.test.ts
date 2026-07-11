import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it, vi } from 'vitest';

import { createUiSessionSecurity } from '../../src/ui-server/security';

describe('UI session security', () => {
  it('accepts only the one-time bootstrap URL and then authenticates the session cookie', () => {
    const security = createUiSessionSecurity();
    const headers = new Map<string, string>();
    const response = {
      statusCode: 0,
      setHeader: (name: string, value: string) => headers.set(name, value),
      end: vi.fn(),
    } as unknown as ServerResponse;

    expect(security.acceptBootstrap('/session/not-the-token', response)).toBe(false);
    expect(security.acceptBootstrap(security.sessionPath, response)).toBe(true);
    expect(headers.get('Location')).toBe('/#/overview');
    expect(headers.get('Set-Cookie')).toContain('HttpOnly');
    expect(headers.get('Set-Cookie')).toContain('SameSite=Strict');

    const cookie = headers.get('Set-Cookie')!.split(';')[0];
    expect(security.authorize({ headers: { cookie } } as IncomingMessage)).toBe(true);
    expect(security.authorize({ headers: { cookie: 'skill_doctor_session=wrong' } } as IncomingMessage)).toBe(false);
  });

  it('restricts host and origin to the active loopback server', () => {
    const security = createUiSessionSecurity();
    expect(security.validateHost({ headers: { host: '127.0.0.1:43123' } } as IncomingMessage, 43123)).toBe(true);
    expect(security.validateHost({ headers: { host: 'evil.example:43123' } } as IncomingMessage, 43123)).toBe(false);
    expect(security.validateOrigin({ headers: { origin: 'http://localhost:43123' } } as IncomingMessage, 43123)).toBe(true);
    expect(security.validateOrigin({ headers: { origin: 'https://evil.example' } } as IncomingMessage, 43123)).toBe(false);
  });
});

