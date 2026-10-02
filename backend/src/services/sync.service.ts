import { TaskSourceAdapter } from '../adapters/sourceAdapter.interface.js';
import { GoogleTasksAdapter } from '../adapters/googleTasks.adapter.js';
import { GoogleKeepAdapter } from '../adapters/googleKeep.adapter.js';
import { IKanbanRepository } from '../repositories/kanban.repository.js';

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  totalActive: number;
  lastSyncedAt: Date;
  errors?: string[];
}

export class SyncService {
  private adapters: Map<string, TaskSourceAdapter> = new Map();

  constructor(
    private repository: IKanbanRepository,
    customAdapters?: TaskSourceAdapter[]
  ) {
    if (customAdapters) {
      for (const a of customAdapters) {
        this.adapters.set(a.sourceName, a);
      }
    } else {
      const tasksAdapter = new GoogleTasksAdapter();
      const keepAdapter = new GoogleKeepAdapter();
      this.adapters.set(tasksAdapter.sourceName, tasksAdapter);
      this.adapters.set(keepAdapter.sourceName, keepAdapter);
    }
  }

  /**
   * Ejecuta el proceso de sincronización idempotente para un usuario
   */
  async syncUser(
    userId: string,
    accessToken: string,
    specificSource?: 'google_tasks' | 'google_keep'
  ): Promise<SyncResult> {
    const settings = await this.repository.getSettings(userId);
    let selectedLists: string[] = [];
    try {
      selectedLists = JSON.parse(settings.selectedTaskLists || '[]');
    } catch {
      selectedLists = [];
    }

    const targetAdapters = specificSource
      ? [this.adapters.get(specificSource)].filter(Boolean) as TaskSourceAdapter[]
      : Array.from(this.adapters.values());

    let totalAdded = 0;
    let totalUpdated = 0;
    let totalRemoved = 0;
    const errors: string[] = [];

    // Obtener elementos actuales en la base de datos local para este usuario
    const localItems = await this.repository.getItems(userId);

    for (const adapter of targetAdapters) {
      try {
        // 1. Obtener tareas activas desde la fuente remota
        const remoteTasks = await adapter.fetchTasks(
          accessToken,
          adapter.sourceName === 'google_tasks' ? selectedLists : undefined
        );

        // Mapa de tareas remotas indexadas por sourceId
        const remoteMap = new Map<string, (typeof remoteTasks)[0]>();
        for (const task of remoteTasks) {
          remoteMap.set(task.sourceId, task);
        }

        // Filtrar elementos locales que pertenecen a este adaptador
        const localSourceItems = localItems.filter(
          (item) => item.source === adapter.sourceName
        );
        const localMap = new Map(localSourceItems.map((i) => [i.sourceId, i]));

        // 2. Procesar ALTAS y MODIFICACIONES
        let maxTodoPosition = await this.repository.getMaxPosition(userId, 'todo');

        for (const remoteTask of remoteTasks) {
          const localItem = localMap.get(remoteTask.sourceId);

          if (!localItem) {
            // ALTA: Nueva tarea en Google Tasks/Keep -> Entra en "Para hacer" (todo)
            maxTodoPosition += 1000; // Incremento para posición ordinal flotante
            await this.repository.createItem({
              userId,
              source: remoteTask.source,
              sourceId: remoteTask.sourceId,
              sourceListId: remoteTask.sourceListId,
              sourceListName: remoteTask.sourceListName,
              title: remoteTask.title,
              description: remoteTask.description,
              status: 'todo', // REGLA FUNDAMENTAL: entra exclusivamente en Para hacer
              position: maxTodoPosition,
              dueDate: remoteTask.dueDate,
              sourceEtag: remoteTask.sourceEtag,
              sourceStatus: remoteTask.sourceStatus,
              sourceUpdatedAt: remoteTask.sourceUpdatedAt,
            });
            totalAdded++;
          } else {
            // MODIFICACIÓN: La tarea ya existe -> Actualizar título, notas, fecha
            // REGLA FUNDAMENTAL: Se mantiene el status Kanban actual sin alterar la columna
            const hasChanged =
              localItem.title !== remoteTask.title ||
              localItem.description !== (remoteTask.description || null) ||
              localItem.sourceListName !== (remoteTask.sourceListName || null) ||
              (localItem.dueDate?.toISOString() !== remoteTask.dueDate?.toISOString());

            if (hasChanged) {
              await this.repository.updateItem(localItem.id, {
                title: remoteTask.title,
                description: remoteTask.description,
                dueDate: remoteTask.dueDate,
                sourceListName: remoteTask.sourceListName,
                sourceEtag: remoteTask.sourceEtag,
                sourceStatus: remoteTask.sourceStatus,
                sourceUpdatedAt: remoteTask.sourceUpdatedAt,
                lastSyncedAt: new Date(),
              });
              totalUpdated++;
            }
          }
        }

        // 3. Procesar BAJAS (Eliminaciones en la fuente)
        // REGLA FUNDAMENTAL: Si desaparece de Google Tasks/Keep, se elimina del Kanban
        // sin importar si estaba en 'todo', 'in_progress', 'review' o 'done'.
        const toDeleteIds: string[] = [];
        for (const localItem of localSourceItems) {
          if (!remoteMap.has(localItem.sourceId)) {
            // La tarea ya no existe en la fuente original
            toDeleteIds.push(localItem.id);
          }
        }

        if (toDeleteIds.length > 0) {
          const removedCount = await this.repository.deleteItems(toDeleteIds);
          totalRemoved += removedCount;
        }

        await this.repository.logSync(
          userId,
          adapter.sourceName,
          totalAdded,
          totalUpdated,
          totalRemoved,
          'success'
        );
      } catch (err: any) {
        console.error(`[SyncService] Error al sincronizar ${adapter.sourceName}:`, err);
        errors.push(`Error en ${adapter.sourceName}: ${err.message || 'Fallo desconocido'}`);
        await this.repository.logSync(
          userId,
          adapter.sourceName,
          0,
          0,
          0,
          'error',
          err.message
        );
      }
    }

    const currentItems = await this.repository.getItems(userId);

    return {
      added: totalAdded,
      updated: totalUpdated,
      removed: totalRemoved,
      totalActive: currentItems.length,
      lastSyncedAt: new Date(),
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
