import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { config } from '../config/index.js';

const authService = new AuthService();

export class AuthController {
  getAuthUrl(req: Request, res: Response) {
    try {
      const url = authService.getGoogleAuthUrl();
      res.json({ url });
    } catch (err: any) {
      res.status(400).json({ error: true, message: err.message });
    }
  }

  async handleCallback(req: Request, res: Response) {
    try {
      const { code } = req.query;
      if (!code || typeof code !== 'string') {
        return res.status(400).send('Código de autorización faltante en callback');
      }

      const { token } = await authService.handleGoogleCallback(code);

      // Guardar cookie segura
      res.cookie('kanban_token', token, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      });

      // Redireccionar al frontend
      res.redirect(config.frontendUrl);
    } catch (err: any) {
      console.error('[AuthController] Error en callback OAuth:', err);
      res.redirect(`${config.frontendUrl}?error=${encodeURIComponent(err.message)}`);
    }
  }

  getMe(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ authenticated: false });
    }
    res.json({
      authenticated: true,
      user: req.user,
    });
  }

  logout(req: Request, res: Response) {
    res.clearCookie('kanban_token');
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  }

  demoLogin(req: Request, res: Response) {
    if (!config.enableDemoMode) {
      return res.status(403).json({ error: true, message: 'El modo demo está deshabilitado en este entorno' });
    }

    const demoUser = {
      userId: 'demo-user-id-001',
      email: 'demo@kanban-tasks.local',
      name: 'Usuario Demo',
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=KanbanUser',
      isDemo: true,
    };

    const token = authService.generateSessionToken(demoUser);

    res.cookie('kanban_token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      token,
      user: demoUser,
    });
  }
}
