import type { Role } from '@sahaya/contracts';

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: Role[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
      requestId: string;
    }
  }
}

export {};
