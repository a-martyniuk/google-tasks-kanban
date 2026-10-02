import { IKanbanRepository } from '../repositories/kanban.repository.js';
import { TaskSourceAdapter } from '../adapters/sourceAdapter.interface.js';
import { GoogleTasksAdapter } from '../adapters/googleTasks.adapter.js';

export const VALID_STATUSES = ['todo', 'in_progress', 'review', 'done'] as const;
export type KanbanStatus = typeof VALID_STATUSES[number];

export const STATUS_LABELS: Record<KanbanStatus, string> = {
  todo: 'Para hacer',
  in_progress: 'En progreso',
  review: 'En revisión',
  done: 'Terminado',
};

export class KanbanService {
  private tasksAdapter: TaskSourceAdapter;

  constructor(
    private repository: IKanbanRepository,
    tasksAdapter?: TaskSourceAdapter
  ) {
    this.tasksAdapter = tasksAdapter || new GoogleTasksAdapter();
  }

  async getBoard(userId: string) {
    const items = await this.repository.getItems(userId);

    const columns: Record<KanbanStatus, typeof items> = {
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };

    for (const item of items) {
      const status = item.status as KanbanStatus;
      if (columns[status]) {
        columns[status].push(item);
      } else {
        columns.todo.push(item);
      }
    }

    // Ordenar cada columna por posición relativa
    for (const key of VALID_STATUSES) {
      columns[key].sort((a, b) => a.position - b.position);
    }

    return {
      columns: [
        { id: 'todo', title: STATUS_LABELS.todo, items: columns.todo },
        { id: 'in_progress', title: STATUS_LABELS.in_progress, items: columns.in_progress },
        { id: 'review', title: STATUS_LABELS.review, items: columns.review },
        { id: 'done', title: STATUS_LABELS.done, items: columns.done },
      ],
      totalCount: items.length,
      lastSyncedAt: items.length > 0 ? items[0].lastSyncedAt : null,
    };
  }

  async moveItem(
    userId: string,
    itemId: string,
    targetStatus: string,
    targetPosition: number,
    accessToken?: string
  ) {
    if (!VALID_STATUSES.includes(targetStatus as KanbanStatus)) {
      throw new Error(`Estado inválido: ${targetStatus}. Debe ser uno de ${VALID_STATUSES.join(', ')}`);
    }

    const item = await this.repository.getItemById(userId, itemId);
    if (!item) {
      throw new Error(`La tarjeta con ID ${itemId} no existe o fue eliminada de la fuente.`);
    }

    const previousStatus = item.status;
    const updated = await this.repository.updateItemStatusAndPosition(
      itemId,
      targetStatus,
      targetPosition
    );

    // Registrar auditoría de movimiento
    await this.repository.logMovement(itemId, previousStatus, targetStatus);

    // Regla de negocio: Si se mueve a 'done' y la opción configurable está activa
    if (targetStatus === 'done' && previousStatus !== 'done') {
      const settings = await this.repository.getSettings(userId);
      if (settings.completeInSourceOnDone && accessToken && item.source === 'google_tasks' && item.sourceListId) {
        // Ejecutar en background sin bloquear la respuesta inmediata al usuario
        this.tasksAdapter
          .completeTask?.(accessToken, item.sourceListId, item.sourceId)
          .catch((err) => {
            console.warn(`[KanbanService] Error marcando completada en Google Tasks: ${err?.message}`);
          });
      }
    }

    return updated;
  }
}
