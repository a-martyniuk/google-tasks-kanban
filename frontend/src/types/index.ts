export type KanbanStatus = 'todo' | 'in_progress' | 'review' | 'done';

export interface SubTaskItem {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  completed?: string | null;
}

export interface KanbanItem {
  id: string;
  userId: string;
  source: 'google_tasks';
  sourceId: string;
  sourceListId?: string | null;
  sourceListName?: string | null;
  title: string;
  description?: string | null;
  status: KanbanStatus;
  position: number;
  dueDate?: string | null;
  sourceEtag?: string | null;
  sourceStatus?: string | null;
  sourceUpdatedAt?: string | null;
  lastSyncedAt: string;
  createdAt?: string;
  updatedAt?: string;
  parentId?: string | null;
  subtasks?: SubTaskItem[];
}

export interface KanbanColumn {
  id: KanbanStatus;
  title: string;
  items: KanbanItem[];
}

export interface BoardData {
  columns: KanbanColumn[];
  totalCount: number;
  lastSyncedAt: string | null;
}

export interface TaskList {
  id: string;
  title: string;
}

export interface UserSettings {
  id: string;
  userId: string;
  selectedTaskLists: string[];
  completeInSourceOnDone: boolean;
  autoSyncInterval: number;
}


export interface User {
  userId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  isDemo?: boolean;
}

export interface SyncResult {
  success: boolean;
  added: number;
  updated: number;
  removed: number;
  totalActive: number;
  lastSyncedAt: string;
  errors?: string[];
}
