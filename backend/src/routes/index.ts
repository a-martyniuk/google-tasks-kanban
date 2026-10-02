import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { KanbanController } from '../controllers/kanban.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export const apiRouter = Router();

const authCtrl = new AuthController();
const kanbanCtrl = new KanbanController();

// Rutas de Salud
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rutas de Autenticación
apiRouter.get('/auth/google/url', (req, res) => authCtrl.getAuthUrl(req, res));
apiRouter.get('/auth/google/callback', (req, res) => authCtrl.handleCallback(req, res));
apiRouter.get('/auth/me', authMiddleware, (req, res) => authCtrl.getMe(req, res));
apiRouter.post('/auth/logout', (req, res) => authCtrl.logout(req, res));
apiRouter.post('/auth/demo', (req, res) => authCtrl.demoLogin(req, res));

// Rutas del Tablero Kanban
apiRouter.get('/kanban/board', authMiddleware, (req, res) => kanbanCtrl.getBoard(req, res));
apiRouter.patch('/kanban/items/:id/move', authMiddleware, (req, res) => kanbanCtrl.moveItem(req, res));
apiRouter.get('/kanban/lists', authMiddleware, (req, res) => kanbanCtrl.getTaskLists(req, res));
apiRouter.get('/kanban/settings', authMiddleware, (req, res) => kanbanCtrl.getSettings(req, res));
apiRouter.patch('/kanban/settings', authMiddleware, (req, res) => kanbanCtrl.updateSettings(req, res));
apiRouter.post('/kanban/sync', authMiddleware, (req, res) => kanbanCtrl.triggerSync(req, res));
