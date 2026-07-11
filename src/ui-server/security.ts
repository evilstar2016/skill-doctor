import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const COOKIE_NAME = 'skill_doctor_session';

export interface UiSessionSecurity {
  token: string;
  sessionPath: string;
  acceptBootstrap(pathname: string, response: ServerResponse): boolean;
  authorize(request: IncomingMessage): boolean;
  validateHost(request: IncomingMessage, port: number): boolean;
  validateOrigin(request: IncomingMessage, port: number): boolean;
  setSecurityHeaders(response: ServerResponse): void;
}

export function createUiSessionSecurity(): UiSessionSecurity {
  const token = randomBytes(32).toString('base64url');
  const sessionPath = `/session/${token}`;
  return {
    token,
    sessionPath,
    acceptBootstrap(pathname, response) {
      if (!safeEqual(pathname, sessionPath)) return false;
      response.statusCode = 302;
      response.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/`);
      response.setHeader('Location', '/#/overview');
      response.end();
      return true;
    },
    authorize(request) {
      const cookie = request.headers.cookie?.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(`${COOKIE_NAME}=`));
      return Boolean(cookie && safeEqual(cookie.slice(COOKIE_NAME.length + 1), token));
    },
    validateHost(request, port) {
      const host = request.headers.host;
      return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
    },
    validateOrigin(request, port) {
      const origin = request.headers.origin;
      if (!origin) return true;
      return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
    },
    setSecurityHeaders(response) {
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      response.setHeader('Cache-Control', 'no-store');
    },
  };
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
