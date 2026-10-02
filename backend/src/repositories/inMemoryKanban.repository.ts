import { KanbanItem, UserSettings } from '@prisma/client';
import {
  CreateKanbanItemDTO,
  IKanbanRepository,
  UpdateKanbanItemDTO,
} from './kanban.repository.js';

export class InMemoryKanbanRepository implements IKanbanRepository {
  private items: Map<string, KanbanItem> = new Map();
  private settings: Map<string, UserSettings> = new Map();
  private movements: Array<{ itemId: string; from: string; to: string; movedAt: Date }> = [];
  private syncLogs: Array<any> = [];

  async getItems(userId: string): Promise<KanbanItem[]> {
    return Array.from(this.items.values())
      .filter((i) => i.userId === userId)
      .sort((a, b) => a.position - b.position);
  }

  async getItemById(userId: string, id: string): Promise<KanbanItem | null> {
    const item = this.items.get(id);
    if (!item || item.userId !== userId) return null;
    return { ...item };
  }

  async getItemBySource(userId: string, source: string, sourceId: string): Promise<KanbanItem | null> {
    for (const item of this.items.values()) {
      if (item.userId === userId && item.source === source && item.sourceId === sourceId) {
        return { ...item };
      }
    }
    return null;
  }

  async createItem(data: CreateKanbanItemDTO): Promise<KanbanItem> {
    // Verificar restricción única: (userId, source, sourceId)
    const existing = await this.getItemBySource(data.userId, data.source, data.sourceId);
    if (existing) {
      throw new Error(`Unique constraint failed on (userId, source, sourceId): ${data.source}:${data.sourceId}`);
    }

    const id = `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    const item: KanbanItem = {
      id,
      userId: data.userId,
      source: data.source,
      sourceId: data.sourceId,
      sourceListId: data.sourceListId || null,
      sourceListName: data.sourceListName || null,
      title: data.title,
      description: data.description || null,
      status: data.status || 'todo',
      position: data.position,
      dueDate: data.dueDate || null,
      sourceEtag: data.sourceEtag || null,
      sourceStatus: data.sourceStatus || null,
      sourceUpdatedAt: data.sourceUpdatedAt || null,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(id, item);
    return { ...item };
  }

  async updateItem(id: string, data: UpdateKanbanItemDTO): Promise<KanbanItem> {
    const item = this.items.get(id);
    if (!item) throw new Error(`Item ${id} no encontrado`);

    const updated: KanbanItem = {
      ...item,
      title: data.title !== undefined ? data.title : item.title,
      description: data.description !== undefined ? data.description : item.description,
      dueDate: data.dueDate !== undefined ? data.dueDate : item.dueDate,
      sourceListName: data.sourceListName !== undefined ? data.sourceListName : item.sourceListName,
      sourceEtag: data.sourceEtag !== undefined ? data.sourceEtag : item.sourceEtag,
      sourceStatus: data.sourceStatus !== undefined ? data.sourceStatus : item.sourceStatus,
      sourceUpdatedAt: data.sourceUpdatedAt !== undefined ? data.sourceUpdatedAt : item.sourceUpdatedAt,
      lastSyncedAt: data.lastSyncedAt || new Date(),
      updatedAt: new Date(),
    };
    this.items.set(id, updated);
    return { ...updated };
  }

  async updateItemStatusAndPosition(id: string, status: string, position: number): Promise<KanbanItem> {
    const item = this.items.get(id);
    if (!item) throw new Error(`Item ${id} no encontrado`);

    const updated: KanbanItem = {
      ...item,
      status,
      position,
      updatedAt: new Date(),
    };
    this.items.set(id, updated);
    return { ...updated };
  }

  async deleteItem(id: string): Promise<void> {
    this.items.delete(id);
  }

  async deleteItems(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (this.items.delete(id)) {
        count++;
      }
    }
    return count;
  }

  async getMaxPosition(userId: string, status: string): Promise<number> {
    let max = 0;
    for (const item of this.items.values()) {
      if (item.userId === userId && item.status === status) {
        if (item.position > max) max = item.position;
      }
    }
    return max;
  }

  async logMovement(itemId: string, fromStatus: string, toStatus: string): Promise<void> {
    this.movements.push({ itemId, from: fromStatus, to: toStatus, movedAt: new Date() });
  }

  async logSync(
    userId: string,
    source: string,
    added: number,
    updated: number,
    removed: number,
    status: string,
    error?: string
  ): Promise<void> {
    this.syncLogs.push({ userId, source, added, updated, removed, status, error, createdAt: new Date() });
  }

  async getSettings(userId: string): Promise<UserSettings> {
    let s = this.settings.get(userId);
    if (!s) {
      s = {
        id: `settings-${userId}`,
        userId,
        selectedTaskLists: '[]',
        completeInSourceOnDone: false,
        autoSyncInterval: 60,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.settings.set(userId, s);
    }
    return { ...s };
  }

  async updateSettings(userId: string, data: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.getSettings(userId);
    const updated: UserSettings = {
      ...current,
      ...data,
      updatedAt: new Date(),
    };
    this.settings.set(userId, updated);
    return { ...updated };
  }

  // Métodos auxiliares para tests
  clear(): void {
    this.items.clear();
    this.settings.clear();
    this.movements = [];
    this.syncLogs = [];
  }

  getAllItems(): KanbanItem[] {
    return Array.from(this.items.values());
  }

  getMovements() {
    return [...this.movements];
  }
}
