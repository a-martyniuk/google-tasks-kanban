import { Request, Response } from 'express';
import { z } from 'zod';
import { getRepository } from '../repositories/index.js';
import { KanbanService } from '../services/kanban.service.js';
import { SyncService } from '../services/sync.service.js';
import { AuthService } from '../services/auth.service.js';
import { GoogleTasksAdapter } from '../adapters/googleTasks.adapter.js';
import { GoogleKeepAdapter } from '../adapters/googleKeep.adapter.js';

const moveItemSchema = z.object({
  targetStatus: z.enum(['todo', 'in_progress', 'review', 'done']),
  targetPosition: z.number(),
});

const updateSettingsSchema = z.object({
  selectedTaskLists: z.array(z.string()).optional(),
  completeInSourceOnDone: z.boolean().optional(),
  autoSyncInterval: z.number().min(10).max(3600).optional(),
});

const importKeepSchema = z.object({
  title: z.string().min(1),
  items: z.array(z.string()),
  category: z.string().optional(),
});

const authService = new AuthService();
const tasksAdapter = new GoogleTasksAdapter();
const keepAdapter = new GoogleKeepAdapter();

export class KanbanController {
  private async getServices() {
    const repository = await getRepository();
    const kanbanService = new KanbanService(repository, tasksAdapter);
    const syncService = new SyncService(repository, [tasksAdapter, keepAdapter]);
    return { repository, kanbanService, syncService };
  }

  private async getAccessTokenForUser(req: Request): Promise<string> {
    if (req.user?.isDemo) {
      return 'demo_token';
    }
    try {
      return await authService.getValidAccessToken(req.user!.userId);
    } catch {
      return 'demo_token';
    }
  }

  async getBoard(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { kanbanService, syncService, repository } = await this.getServices();

      // Si el tablero está vacío (nuevo usuario o demo), ejecutar sincronización inicial automática
      const items = await repository.getItems(userId);
      if (items.length === 0) {
        const accessToken = await this.getAccessTokenForUser(req);
        await syncService.syncUser(userId, accessToken);
      }

      const board = await kanbanService.getBoard(userId);
      res.json(board);
    } catch (err: any) {
      console.error('[KanbanController] Error obteniendo tablero:', err);
      res.status(500).json({ error: true, message: err.message });
    }
  }

  async moveItem(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const itemId = req.params.id;
      const parsed = moveItemSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: true,
          message: 'Parámetros inválidos para mover la tarjeta',
          details: parsed.error.issues,
        });
      }

      const { kanbanService } = await this.getServices();
      const accessToken = await this.getAccessTokenForUser(req);

      const updated = await kanbanService.moveItem(
        userId,
        itemId,
        parsed.data.targetStatus,
        parsed.data.targetPosition,
        accessToken
      );

      res.json({
        success: true,
        item: updated,
      });
    } catch (err: any) {
      console.error('[KanbanController] Error moviendo tarjeta:', err);
      res.status(400).json({ error: true, message: err.message });
    }
  }

  async getTaskLists(req: Request, res: Response) {
    try {
      const accessToken = await this.getAccessTokenForUser(req);
      const lists = await tasksAdapter.fetchLists(accessToken);
      res.json({ lists });
    } catch (err: any) {
      res.status(500).json({ error: true, message: err.message });
    }
  }

  async getSettings(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { repository } = await this.getServices();
      const settings = await repository.getSettings(userId);
      const keepStatus = keepAdapter.getApiStatus(false);

      let selectedTaskLists: string[] = [];
      try {
        selectedTaskLists = JSON.parse(settings.selectedTaskLists || '[]');
      } catch {
        selectedTaskLists = [];
      }

      res.json({
        settings: {
          ...settings,
          selectedTaskLists,
        },
        keepStatus,
      });
    } catch (err: any) {
      res.status(500).json({ error: true, message: err.message });
    }
  }

  async updateSettings(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const parsed = updateSettingsSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: true, message: 'Datos de configuración inválidos' });
      }

      const { repository } = await this.getServices();
      const dataToUpdate: any = {};

      if (parsed.data.selectedTaskLists !== undefined) {
        dataToUpdate.selectedTaskLists = JSON.stringify(parsed.data.selectedTaskLists);
      }
      if (parsed.data.completeInSourceOnDone !== undefined) {
        dataToUpdate.completeInSourceOnDone = parsed.data.completeInSourceOnDone;
      }
      if (parsed.data.autoSyncInterval !== undefined) {
        dataToUpdate.autoSyncInterval = parsed.data.autoSyncInterval;
      }

      const updated = await repository.updateSettings(userId, dataToUpdate);

      res.json({
        success: true,
        settings: {
          ...updated,
          selectedTaskLists: parsed.data.selectedTaskLists || [],
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: true, message: err.message });
    }
  }

  async triggerSync(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { source } = req.body;
      const { syncService } = await this.getServices();
      const accessToken = await this.getAccessTokenForUser(req);

      const result = await syncService.syncUser(
        userId,
        accessToken,
        source === 'google_tasks' || source === 'google_keep' ? source : undefined
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      console.error('[KanbanController] Error ejecutando sincronización:', err);
      res.status(500).json({ error: true, message: err.message });
    }
  }

  async importKeepNotes(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const parsed = importKeepSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: true, message: 'Formato de nota Keep inválido' });
      }

      const { repository } = await this.getServices();
      const maxTodoPos = await repository.getMaxPosition(userId, 'todo');

      const importedItems = [];
      let currentPos = maxTodoPos;

      for (let i = 0; i < parsed.data.items.length; i++) {
        const itemText = parsed.data.items[i].trim();
        if (!itemText) continue;

        currentPos += 1000;
        const sourceId = `keep-import-${Date.now()}-${i}`;
        const item = await repository.createItem({
          userId,
          source: 'google_keep',
          sourceId,
          sourceListName: parsed.data.title,
          title: itemText,
          description: `Importado de Google Keep: "${parsed.data.title}"`,
          status: 'todo', // Entra en "Para hacer"
          position: currentPos,
        });
        importedItems.push(item);
      }

      res.json({
        success: true,
        count: importedItems.length,
        items: importedItems,
      });
    } catch (err: any) {
      res.status(500).json({ error: true, message: err.message });
    }
  }
}
