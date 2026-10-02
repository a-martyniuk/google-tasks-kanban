import { Request, Response, NextFunction } from 'express';
import { AuthService, UserSessionPayload } from '../services/auth.service.js';

declare global {
  namespace Express {
    interface Request {
      user?: UserSessionPayload;
    }
  }
}

const authService = new AuthService();

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Buscar token en cookie o en header Authorization
  const cookieToken = req.cookies?.kanban_token;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({
      error: true,
      message: 'No autenticado. Por favor inicia sesión con Google.',
    });
  }

  const payload = authService.verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({
      error: true,
      message: 'Sesión expirada o token inválido.',
    });
  }

  req.user = payload;
  next();
}
