import { BoardData, KeepStatus, KanbanItem, TaskList, User, UserSettings, SyncResult } from '../types';

const BASE_URL = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    let errorMsg = `Error en petición: ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.message) errorMsg = data.message;
    } catch {}
    throw new Error(errorMsg);
  }

  return res.json();
}

export const api = {
  // Auth
  async getMe(): Promise<{ authenticated: boolean; user?: User }> {
    return request<{ authenticated: boolean; user?: User }>('/auth/me');
  },

  async getAuthUrl(): Promise<{ url: string }> {
    return request<{ url: string }>('/auth/google/url');
  },

  async logout(): Promise<{ success: boolean }> {
    return request<{ success: boolean }>('/auth/logout', { method: 'POST' });
  },

  async loginDemo(): Promise<{ success: boolean; user: User }> {
    return request<{ success: boolean; user: User }>('/auth/demo', { method: 'POST' });
  },

  // Kanban Board
  async getBoard(): Promise<BoardData> {
    return request<BoardData>('/kanban/board');
  },

  async moveItem(
    id: string,
    targetStatus: string,
    targetPosition: number
  ): Promise<{ success: boolean; item: KanbanItem }> {
    return request<{ success: boolean; item: KanbanItem }>(`/kanban/items/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ targetStatus, targetPosition }),
    });
  },

  // Sources & Settings
  async getTaskLists(): Promise<{ lists: TaskList[] }> {
    return request<{ lists: TaskList[] }>('/kanban/lists');
  },

  async getSettings(): Promise<{ settings: UserSettings; keepStatus: KeepStatus }> {
    return request<{ settings: UserSettings; keepStatus: KeepStatus }>('/kanban/settings');
  },

  async updateSettings(
    data: Partial<{
      selectedTaskLists: string[];
      completeInSourceOnDone: boolean;
      autoSyncInterval: number;
    }>
  ): Promise<{ success: boolean; settings: UserSettings }> {
    return request<{ success: boolean; settings: UserSettings }>('/kanban/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Sync
  async triggerSync(source?: 'google_tasks' | 'google_keep'): Promise<SyncResult> {
    return request<SyncResult>('/kanban/sync', {
      method: 'POST',
      body: JSON.stringify({ source }),
    });
  },

  // Keep Import Bridge
  async importKeepNotes(
    title: string,
    items: string[]
  ): Promise<{ success: boolean; count: number; items: KanbanItem[] }> {
    return request<{ success: boolean; count: number; items: KanbanItem[] }>('/kanban/keep/import', {
      method: 'POST',
      body: JSON.stringify({ title, items }),
    });
  },
};
