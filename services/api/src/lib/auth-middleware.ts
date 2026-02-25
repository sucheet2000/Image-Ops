import type { NextFunction, Request, Response } from 'express';
import type { AuthService, ApiTokenClaims } from '../services/auth';

export type RequestWithAuth = Request & {
  auth?: ApiTokenClaims;
};

export function requireApiAuth(auth: AuthService) {
  return (req: RequestWithAuth, res: Response, next: NextFunction): void => {
    const header = String(req.header('authorization') || '');
    const [scheme, token] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing bearer token.' });
      return;
    }

    const claims = auth.verifyApiToken(token);
    if (!claims) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid bearer token.' });
      return;
    }

    req.auth = claims;
    next();
  };
}
