import { KanbanItem, KanbanMovement, SyncLog, UserSettings } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export interface CreateKanbanItemDTO {
  userId: string;
  source: 'google_tasks';
  sourceId: string;
  sourceListId?: string;
  sourceListName?: string;
  title: string;
  description?: string;
  status?: string;
  position: number;
  dueDate?: Date | null;
  sourceEtag?: string;
  sourceStatus?: string;
  sourceUpdatedAt?: Date;
}

export interface UpdateKanbanItemDTO {
  title?: string;
  description?: string;
  dueDate?: Date | null;
  sourceListName?: string;
  sourceEtag?: string;
  sourceStatus?: string;
  sourceUpdatedAt?: Date;
  lastSyncedAt?: Date;
}

export interface IKanbanRepository {
  getItems(userId: string): Promise<KanbanItem[]>;
  getItemById(userId: string, id: string): Promise<KanbanItem | null>;
  getItemBySource(userId: string, source: string, sourceId: string): Promise<KanbanItem | null>;
  createItem(data: CreateKanbanItemDTO): Promise<KanbanItem>;
  updateItem(id: string, data: UpdateKanbanItemDTO): Promise<KanbanItem>;
  updateItemStatusAndPosition(id: string, status: string, position: number): Promise<KanbanItem>;
  deleteItem(id: string): Promise<void>;
  deleteItems(ids: string[]): Promise<number>;
  getMaxPosition(userId: string, status: string): Promise<number>;
  logMovement(itemId: string, fromStatus: string, toStatus: string): Promise<void>;
  logSync(userId: string, source: string, added: number, updated: number, removed: number, status: string, error?: string): Promise<void>;
  getSettings(userId: string): Promise<UserSettings>;
  updateSettings(userId: string, data: Partial<UserSettings>): Promise<UserSettings>;
}

export class PrismaKanbanRepository implements IKanbanRepository {
  async getItems(userId: string): Promise<KanbanItem[]> {
    return prisma.kanbanItem.findMany({
      where: { userId },
      orderBy: { position: 'asc' },
    });
  }

  async getItemById(userId: string, id: string): Promise<KanbanItem | null> {
    return prisma.kanbanItem.findFirst({
      where: { id, userId },
    });
  }

  async getItemBySource(userId: string, source: string, sourceId: string): Promise<KanbanItem | null> {
    return prisma.kanbanItem.findUnique({
      where: {
        uq_user_source_source_id: {
          userId,
          source,
          sourceId,
        },
      },
    });
  }

  async createItem(data: CreateKanbanItemDTO): Promise<KanbanItem> {
    return prisma.kanbanItem.create({
      data: {
        userId: data.userId,
        source: data.source,
        sourceId: data.sourceId,
        sourceListId: data.sourceListId,
        sourceListName: data.sourceListName,
        title: data.title,
        description: data.description,
        status: data.status || 'todo',
        position: data.position,
        dueDate: data.dueDate,
        sourceEtag: data.sourceEtag,
        sourceStatus: data.sourceStatus,
        sourceUpdatedAt: data.sourceUpdatedAt,
        lastSyncedAt: new Date(),
      },
    });
  }

  async updateItem(id: string, data: UpdateKanbanItemDTO): Promise<KanbanItem> {
    return prisma.kanbanItem.update({
      where: { id },
      data: {
        ...data,
        lastSyncedAt: data.lastSyncedAt || new Date(),
      },
    });
  }

  async updateItemStatusAndPosition(id: string, status: string, position: number): Promise<KanbanItem> {
    return prisma.kanbanItem.update({
      where: { id },
      data: {
        status,
        position,
      },
    });
  }

  async deleteItem(id: string): Promise<void> {
    await prisma.kanbanItem.delete({
      where: { id },
    });
  }

  async deleteItems(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await prisma.kanbanItem.deleteMany({
      where: { id: { in: ids } },
    });
    return res.count;
  }

  async getMaxPosition(userId: string, status: string): Promise<number> {
    const item = await prisma.kanbanItem.findFirst({
      where: { userId, status },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return item ? item.position : 0;
  }

  async logMovement(itemId: string, fromStatus: string, toStatus: string): Promise<void> {
    await prisma.kanbanMovement.create({
      data: {
        kanbanItemId: itemId,
        fromStatus,
        toStatus,
      },
    });
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
    await prisma.syncLog.create({
      data: {
        userId,
        source,
        itemsAdded: added,
        itemsUpdated: updated,
        itemsRemoved: removed,
        status,
        errorMessage: error,
      },
    });
  }

  async getSettings(userId: string): Promise<UserSettings> {
    let settings = await prisma.userSettings.findUnique({
      where: { userId },
    });
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId,
          selectedTaskLists: '[]',
          completeInSourceOnDone: false,
          autoSyncInterval: 60,
        },
      });
    }
    return settings;
  }

  async updateSettings(userId: string, data: Partial<UserSettings>): Promise<UserSettings> {
    return prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        selectedTaskLists: data.selectedTaskLists || '[]',
        completeInSourceOnDone: data.completeInSourceOnDone ?? false,
        autoSyncInterval: data.autoSyncInterval ?? 60,
      },
      update: data,
    });
  }
}
