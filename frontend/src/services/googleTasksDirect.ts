import { KanbanItem, KanbanStatus, SubTaskItem, TaskList, UserSettings } from '../types';

declare global {
  interface Window {
    google?: any;
  }
}

export interface GoogleUserProfile {
  email: string;
  name: string;
  picture: string;
}

export interface ColumnListMapping {
  todo: { listId: string; title: string };
  in_progress: { listId: string; title: string };
  review: { listId: string; title: string };
  done: { listId: string; title: string };
}

const DEFAULT_COLUMN_TITLES: Record<KanbanStatus, string> = {
  todo: 'Para hacer',
  in_progress: 'En progreso',
  review: 'En revisión',
  done: 'Terminado',
};

class GoogleTasksDirectService {
  private accessToken: string | null = null;
  private tokenClient: any = null;
  private listMapping: ColumnListMapping | null = null;
  private mockState: Map<KanbanStatus, KanbanItem[]> = new Map();
  private mockMode: boolean = false;

  constructor() {
    this.initMockData();
  }

  // ==========================================
  // AUTENTICACIÓN DIRECTA CLIENTE (OAUTH 2.0 GIS)
  // ==========================================

  public setAccessToken(token: string) {
    this.accessToken = token;
    this.mockMode = false;
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  public isUsingMock(): boolean {
    return this.mockMode;
  }

  public setMockMode(enabled: boolean) {
    this.mockMode = enabled;
  }

  // ==========================================
  // CONFIGURACIÓN LOCAL (ZERO-DB SETTINGS)
  // ==========================================

  public getSettings(): UserSettings {
    const raw = localStorage.getItem('kanban_user_settings');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
    return {
      id: 'zero-db-settings',
      userId: 'google-user',
      selectedTaskLists: [],
      completeInSourceOnDone: false,
      autoSyncInterval: 60,
    };
  }

  public saveSettings(settings: Partial<UserSettings>): UserSettings {
    const current = this.getSettings();
    const updated: UserSettings = { ...current, ...settings };
    localStorage.setItem('kanban_user_settings', JSON.stringify(updated));
    return updated;
  }

  public async fetchTaskLists(): Promise<TaskList[]> {
    if (this.mockMode || !this.accessToken) {
      return [
        { id: 'mock-todo', title: 'Para hacer' },
        { id: 'mock-in-progress', title: 'En progreso' },
        { id: 'mock-review', title: 'En revisión' },
        { id: 'mock-done', title: 'Terminado' },
        { id: 'mock-my-tasks', title: 'Mis tareas (@default)' },
      ];
    }

    const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (res.status === 401) {
      this.handleTokenExpired();
    }

    if (!res.ok) {
      throw new Error(`Error al consultar listas de Google Tasks: ${res.statusText}`);
    }

    const data = await res.json();
    return (data.items || []).map((l: any) => ({
      id: l.id,
      title: l.title,
    }));
  }

  private handleTokenExpired(): never {
    this.accessToken = null;
    sessionStorage.removeItem('kanban_google_token');
    throw new Error('Tu sesión de Google expiró. Por favor haz clic en "Vincular con tu Gmail" para renovar.');
  }

  public getClientId(): string {
    return (
      (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
      localStorage.getItem('kanban_google_client_id') ||
      '220352188023-pqkffvbh70svr6jb13lt3ua11d6m6df1.apps.googleusercontent.com'
    );
  }

  public async requestGoogleToken(providedClientId?: string): Promise<string> {
    const clientId = providedClientId || this.getClientId();
    if (!clientId) {
      throw new Error(
        'Falta configurar VITE_GOOGLE_CLIENT_ID en Vercel para habilitar el inicio de sesión con Gmail con un clic.'
      );
    }

    return new Promise((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) {
        reject(
          new Error(
            'Google Identity Services aún se está cargando. Por favor intenta de nuevo en unos segundos.'
          )
        );
        return;
      }

      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(`Error de autenticación Google: ${response.error}`));
            return;
          }
          this.accessToken = response.access_token;
          this.mockMode = false;
          resolve(response.access_token);
        },
      });

      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  public async fetchUserProfile(): Promise<GoogleUserProfile | null> {
    if (this.mockMode || !this.accessToken) {
      return {
        name: 'Alexis (Portfolio Demo)',
        email: 'alexis.demo@gmail.com',
        picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=AlexisPortfolio',
      };
    }

    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        name: data.name || 'Usuario Google',
        email: data.email || '',
        picture: data.picture || '',
      };
    } catch {
      return null;
    }
  }

  // ==========================================
  // GESTIÓN DE LAS 4 LISTAS COMO COLUMNAS
  // ==========================================

  public async ensureKanbanLists(): Promise<ColumnListMapping> {
    if (this.mockMode || !this.accessToken) {
      return {
        todo: { listId: 'mock-todo', title: 'Para hacer' },
        in_progress: { listId: 'mock-in-progress', title: 'En progreso' },
        review: { listId: 'mock-review', title: 'En revisión' },
        done: { listId: 'mock-done', title: 'Terminado' },
      };
    }

    // 1. Obtener listas existentes del usuario
    const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Error consultando listas en Google Tasks: ${res.statusText}`);
    }

    const data = await res.json();
    const existingLists: Array<{ id: string; title: string }> = data.items || [];

    const mapping: Partial<ColumnListMapping> = {};

    // 2. Mapear o crear las 4 listas
    for (const [statusKey, defaultTitle] of Object.entries(DEFAULT_COLUMN_TITLES) as [KanbanStatus, string][]) {
      // Buscar lista coincidente (case insensitive)
      let match = existingLists.find(
        (l) => l.title.trim().toLowerCase() === defaultTitle.toLowerCase()
      );

      if (!match) {
        // Crear la lista en Google Tasks si no existe
        console.log(`[GoogleTasks] Creando lista remota "${defaultTitle}"...`);
        const createRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title: defaultTitle }),
        });

        if (!createRes.ok) {
          throw new Error(`Error creando lista "${defaultTitle}": ${createRes.statusText}`);
        }

        match = await createRes.json();
      }

      mapping[statusKey] = {
        listId: match!.id,
        title: match!.title,
      };
    }

    this.listMapping = mapping as ColumnListMapping;
    return this.listMapping;
  }

  // ==========================================
  // OBTENER TABLERO COMPLETO
  // ==========================================

  public async fetchBoardTasks(): Promise<{
    columns: Array<{ id: KanbanStatus; title: string; listId: string; items: KanbanItem[] }>;
    totalCount: number;
    lastSyncedAt: string;
  }> {
    if (this.mockMode || !this.accessToken) {
      let total = 0;
      const cols: any[] = [];
      for (const [status, title] of Object.entries(DEFAULT_COLUMN_TITLES) as [KanbanStatus, string][]) {
        const items = this.mockState.get(status) || [];
        total += items.length;
        cols.push({
          id: status,
          title,
          listId: `mock-${status}`,
          items: [...items],
        });
      }
      return {
        columns: cols,
        totalCount: total,
        lastSyncedAt: new Date().toISOString(),
      };
    }

    const mapping = this.listMapping || (await this.ensureKanbanLists());
    const statuses: KanbanStatus[] = ['todo', 'in_progress', 'review', 'done'];

    const columnPromises = statuses.map(async (status) => {
      const listInfo = mapping[status];
      const res = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${listInfo.listId}/tasks?showCompleted=true&showHidden=true&maxResults=100`,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );

      if (res.status === 401) {
        this.handleTokenExpired();
      }

      if (!res.ok) {
        console.warn(`Error al obtener tareas de ${listInfo.title}`);
        return {
          id: status,
          title: listInfo.title,
          listId: listInfo.listId,
          items: [] as KanbanItem[],
        };
      }

      const json = await res.json();
      const rawTasks: any[] = json.items || [];

      // Agrupar tareas principales y subtareas
      const parentTasksMap = new Map<string, KanbanItem>();
      const subtasksByParent = new Map<string, SubTaskItem[]>();
      const orphanSubtasks: KanbanItem[] = [];

      rawTasks.forEach((t) => {
        if (!t.id || !t.title) return;

        if (t.parent) {
          // Es una subtarea
          const list = subtasksByParent.get(t.parent) || [];
          list.push({
            id: t.id,
            title: t.title,
            status: t.status || 'needsAction',
            completed: t.completed || null,
          });
          subtasksByParent.set(t.parent, list);
        } else {
          // Es una tarea principal
          parentTasksMap.set(t.id, {
            id: t.id,
            userId: 'google-user',
            source: 'google_tasks' as const,
            sourceId: t.id,
            sourceListId: listInfo.listId,
            sourceListName: listInfo.title,
            title: t.title,
            description: t.notes || null,
            status,
            position: parentTasksMap.size * 1000,
            dueDate: t.due ? new Date(t.due).toISOString() : null,
            sourceStatus: t.status || 'needsAction',
            lastSyncedAt: new Date().toISOString(),
            parentId: null,
            subtasks: [],
          });
        }
      });

      // Asociar subtareas a sus tareas padre
      for (const [parentId, sublist] of subtasksByParent.entries()) {
        const parentItem = parentTasksMap.get(parentId);
        if (parentItem) {
          parentItem.subtasks = sublist;
        } else {
          // Si el padre no está presente en esta lista, mostrar como tarjetas individuales
          sublist.forEach((sub, idx) => {
            orphanSubtasks.push({
              id: sub.id,
              userId: 'google-user',
              source: 'google_tasks' as const,
              sourceId: sub.id,
              sourceListId: listInfo.listId,
              sourceListName: listInfo.title,
              title: sub.title,
              description: null,
              status,
              position: (parentTasksMap.size + idx + 1) * 1000,
              dueDate: null,
              sourceStatus: sub.status,
              lastSyncedAt: new Date().toISOString(),
              parentId,
              subtasks: [],
            });
          });
        }
      }

      const items: KanbanItem[] = [
        ...Array.from(parentTasksMap.values()),
        ...orphanSubtasks,
      ];

      return {
        id: status,
        title: listInfo.title,
        listId: listInfo.listId,
        items,
      };
    });

    const columns = await Promise.all(columnPromises);

    // Si el usuario seleccionó listas adicionales para sincronizar en Configuración, incorporarlas en "Para hacer"
    const settings = this.getSettings();
    const kanbanListIds = new Set(Object.values(mapping).map((m) => m.listId));
    const extraListIds = (settings.selectedTaskLists || []).filter(
      (id) => !kanbanListIds.has(id)
    );

    if (extraListIds.length > 0) {
      const todoCol = columns.find((c) => c.id === 'todo');
      if (todoCol) {
        const listNamesMap = new Map<string, string>();
        try {
          const allLists = await this.fetchTaskLists();
          allLists.forEach((l) => listNamesMap.set(l.id, l.title));
        } catch {}

        for (const extraId of extraListIds) {
          try {
            const extraRes = await fetch(
              `https://tasks.googleapis.com/tasks/v1/lists/${extraId}/tasks?showCompleted=false&showHidden=true&maxResults=100`,
              { headers: { Authorization: `Bearer ${this.accessToken}` } }
            );
            if (extraRes.ok) {
              const extraJson = await extraRes.json();
              const extraTasks: any[] = extraJson.items || [];
              const extraParents = new Map<string, KanbanItem>();
              const extraSubtasks = new Map<string, SubTaskItem[]>();

              extraTasks.forEach((t) => {
                if (!t.id || !t.title || t.deleted) return;
                if (t.parent) {
                  const list = extraSubtasks.get(t.parent) || [];
                  list.push({
                    id: t.id,
                    title: t.title,
                    status: t.status || 'needsAction',
                    completed: t.completed || null,
                  });
                  extraSubtasks.set(t.parent, list);
                } else {
                  extraParents.set(t.id, {
                    id: t.id,
                    userId: 'google-user',
                    source: 'google_tasks' as const,
                    sourceId: t.id,
                    sourceListId: extraId,
                    sourceListName: listNamesMap.get(extraId) || 'Lista sincronizada',
                    title: t.title,
                    description: t.notes || null,
                    status: 'todo',
                    position: (todoCol.items.length + extraParents.size) * 1000,
                    dueDate: t.due ? new Date(t.due).toISOString() : null,
                    sourceStatus: t.status || 'needsAction',
                    lastSyncedAt: new Date().toISOString(),
                    parentId: null,
                    subtasks: [],
                  });
                }
              });

              for (const [pId, subs] of extraSubtasks.entries()) {
                const parent = extraParents.get(pId);
                if (parent) {
                  parent.subtasks = subs;
                }
              }

              todoCol.items.push(...Array.from(extraParents.values()));
            }
          } catch (err) {
            console.warn(`Error al consultar lista extra ${extraId}:`, err);
          }
        }
      }
    }

    const totalCount = columns.reduce((acc, col) => acc + col.items.length, 0);

    return {
      columns,
      totalCount,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  // ==========================================
  // MOVER TAREA ENTRE LISTAS EN GOOGLE TASKS
  // ==========================================

  public async moveTaskBetweenColumns(
    task: KanbanItem,
    targetStatus: KanbanStatus,
    targetPosition: number
  ): Promise<KanbanItem> {
    if (this.mockMode || !this.accessToken) {
      // Simulación en memoria
      const currentList = this.mockState.get(task.status) || [];
      const filtered = currentList.filter((t) => t.id !== task.id);
      this.mockState.set(task.status, filtered);

      const targetList = this.mockState.get(targetStatus) || [];
      const updatedMock: KanbanItem = {
        ...task,
        status: targetStatus,
        position: targetPosition,
      };
      targetList.push(updatedMock);
      targetList.sort((a, b) => a.position - b.position);
      this.mockState.set(targetStatus, targetList);

      return updatedMock;
    }

    const mapping = this.listMapping || (await this.ensureKanbanLists());
    const sourceListId = task.sourceListId || mapping[task.status].listId;
    const destListId = mapping[targetStatus].listId;

    if (sourceListId === destListId) {
      // Mover dentro de la misma lista
      return { ...task, position: targetPosition };
    }

    // Para mover entre dos listas distintas en Google Tasks API v1:
    // 1. Insertar la tarea en la lista de destino
    const insertRes = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: task.title,
          notes: task.description || undefined,
          due: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
        }),
      }
    );

    if (insertRes.status === 401) {
      this.handleTokenExpired();
    }

    if (!insertRes.ok) {
      throw new Error(`Error creando tarea en lista destino: ${insertRes.statusText}`);
    }

    const newGoogleTask = await insertRes.json();

    // Replicar subtareas bajo el nuevo padre si existen y capturar sus nuevos IDs
    const updatedSubtasks: SubTaskItem[] = [];
    if (task.subtasks && task.subtasks.length > 0) {
      for (const sub of task.subtasks) {
        try {
          const subRes = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks?parent=${newGoogleTask.id}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                title: sub.title,
                status: sub.status || 'needsAction',
              }),
            }
          );
          if (subRes.ok) {
            const newSub = await subRes.json();
            updatedSubtasks.push({
              id: newSub.id,
              title: newSub.title,
              status: newSub.status || 'needsAction',
              completed: newSub.completed || null,
            });
          } else {
            updatedSubtasks.push(sub);
          }
        } catch (err) {
          console.warn('Error replicando subtarea:', err);
          updatedSubtasks.push(sub);
        }
      }
    }

    // Comportamiento configurable: Si se mueve a 'Terminado' y está activada la opción en configuración
    const settings = this.getSettings();
    if (targetStatus === 'done' && settings.completeInSourceOnDone) {
      try {
        await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks/${newGoogleTask.id}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'completed' }),
          }
        );
      } catch (err) {
        console.warn('Error marcando como completada en fuente remota:', err);
      }
    } else if (task.status === 'done' && targetStatus !== 'done') {
      // Si sale de Terminado, reactivar en la fuente
      try {
        await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks/${newGoogleTask.id}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'needsAction' }),
          }
        );
      } catch (err) {
        console.warn('Error reactivando tarea en fuente remota:', err);
      }
    }

    // 2. Eliminar de la lista de origen en Google Tasks (Google Tasks borra recursivamente las subtareas del padre)
    fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${sourceListId}/tasks/${task.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    ).catch((err) => console.warn('Error borrando tarea de lista previa:', err));

    return {
      ...task,
      id: newGoogleTask.id,
      sourceId: newGoogleTask.id,
      sourceListId: destListId,
      sourceListName: mapping[targetStatus].title,
      status: targetStatus,
      position: targetPosition,
      subtasks: updatedSubtasks.length > 0 ? updatedSubtasks : task.subtasks,
    };
  }

  // ==========================================
  // CREAR SUBTAREA EN GOOGLE TASKS
  // ==========================================

  public async createSubtask(
    parentTask: KanbanItem,
    title: string
  ): Promise<SubTaskItem> {
    if (this.mockMode || !this.accessToken) {
      const newSub: SubTaskItem = {
        id: `mock-sub-${Date.now()}`,
        title,
        status: 'needsAction',
      };
      const list = this.mockState.get(parentTask.status) || [];
      const parent = list.find((t) => t.id === parentTask.id);
      if (parent) {
        parent.subtasks = [...(parent.subtasks || []), newSub];
      }
      return newSub;
    }

    const mapping = this.listMapping || (await this.ensureKanbanLists());
    const listId = parentTask.sourceListId || mapping[parentTask.status].listId;

    const res = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks?parent=${parentTask.id}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          status: 'needsAction',
        }),
      }
    );

    if (res.status === 401) {
      this.handleTokenExpired();
    }

    if (!res.ok) {
      throw new Error(`Error creando subtarea: ${res.statusText}`);
    }

    const created = await res.json();
    return {
      id: created.id,
      title: created.title,
      status: created.status || 'needsAction',
    };
  }

  // ==========================================
  // ACTUALIZAR TAREA (TÍTULO, NOTAS, FECHA)
  // ==========================================

  public async updateTask(
    task: KanbanItem,
    updates: { title?: string; description?: string | null; dueDate?: string | null }
  ): Promise<KanbanItem> {
    if (this.mockMode || !this.accessToken) {
      const list = this.mockState.get(task.status) || [];
      const item = list.find((t) => t.id === task.id);
      if (item) {
        if (updates.title !== undefined) item.title = updates.title;
        if (updates.description !== undefined) item.description = updates.description;
        if (updates.dueDate !== undefined) item.dueDate = updates.dueDate;
      }
      return { ...task, ...updates };
    }

    const mapping = this.listMapping || (await this.ensureKanbanLists());
    const listId = task.sourceListId || mapping[task.status].listId;

    const body: any = {};
    if (updates.title !== undefined) body.title = updates.title;
    if (updates.description !== undefined) body.notes = updates.description || '';
    if (updates.dueDate !== undefined) {
      body.due = updates.dueDate ? new Date(updates.dueDate).toISOString() : null;
    }

    const res = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${task.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (res.status === 401) {
      this.handleTokenExpired();
    }

    if (!res.ok) {
      throw new Error(`Error actualizando tarea: ${res.statusText}`);
    }

    const data = await res.json();
    return {
      ...task,
      title: data.title,
      description: data.notes || null,
      dueDate: data.due ? new Date(data.due).toISOString() : null,
    };
  }

  // ==========================================
  // MARCAR / DESMARCAR SUBTAREA
  // ==========================================

  public async toggleSubtask(
    listId: string,
    subtaskId: string,
    completed: boolean
  ): Promise<void> {
    if (this.mockMode || !this.accessToken) {
      for (const list of this.mockState.values()) {
        for (const item of list) {
          if (item.subtasks) {
            const sub = item.subtasks.find((s) => s.id === subtaskId);
            if (sub) {
              sub.status = completed ? 'completed' : 'needsAction';
              return;
            }
          }
        }
      }
      return;
    }

    const res = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${subtaskId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: completed ? 'completed' : 'needsAction',
        }),
      }
    );

    if (res.status === 401) {
      this.handleTokenExpired();
    }

    if (!res.ok) {
      throw new Error(`Error actualizando subtarea: ${res.statusText}`);
    }
  }

  // ==========================================
  // ELIMINAR SUBTAREA EN GOOGLE TASKS
  // ==========================================

  public async deleteSubtask(
    listId: string,
    subtaskId: string
  ): Promise<void> {
    if (this.mockMode || !this.accessToken) {
      for (const list of this.mockState.values()) {
        for (const item of list) {
          if (item.subtasks) {
            item.subtasks = item.subtasks.filter((s) => s.id !== subtaskId);
          }
        }
      }
      return;
    }

    const res = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${subtaskId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    if (res.status === 401) {
      this.handleTokenExpired();
    }

    if (!res.ok && res.status !== 404) {
      throw new Error(`Error eliminando subtarea: ${res.statusText}`);
    }
  }

  // ==========================================
  // IMPORTAR TAREAS DESDE LISTA DEFAULT ("My Tasks")
  // ==========================================

  public async importTasksFromDefaultList(): Promise<number> {
    if (this.mockMode || !this.accessToken) {
      return 0;
    }

    const mapping = this.listMapping || (await this.ensureKanbanLists());
    const todoListId = mapping.todo.listId;

    // Obtener tareas de la lista @default (My Tasks)
    const res = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showHidden=true&maxResults=100`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );

    if (res.status === 401) {
      this.handleTokenExpired();
    }

    if (!res.ok) {
      throw new Error(`Error consultando lista @default: ${res.statusText}`);
    }

    const data = await res.json();
    const tasks: any[] = data.items || [];
    if (tasks.length === 0) return 0;

    let imported = 0;
    const parentIdMap = new Map<string, string>(); // oldId -> newId

    // 1. Crear primero las tareas principales
    const parents = tasks.filter((x) => !x.parent && x.title);
    for (const t of parents) {
      const createRes = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${todoListId}/tasks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: t.title,
            notes: t.notes || undefined,
            due: t.due || undefined,
          }),
        }
      );

      if (createRes.ok) {
        const created = await createRes.json();
        parentIdMap.set(t.id, created.id);
        imported++;
      }
    }

    // 2. Replicar subtareas bajo sus padres
    const children = tasks.filter((x) => x.parent && x.title);
    for (const t of children) {
      const newParentId = parentIdMap.get(t.parent);
      const url = newParentId
        ? `https://tasks.googleapis.com/tasks/v1/lists/${todoListId}/tasks?parent=${newParentId}`
        : `https://tasks.googleapis.com/tasks/v1/lists/${todoListId}/tasks`;

      const createRes = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: t.title,
          notes: t.notes || undefined,
          status: t.status || 'needsAction',
        }),
      });

      if (createRes.ok) {
        imported++;
      }
    }

    return imported;
  }

  // ==========================================
  // CREAR TAREA RÁPIDA EN GOOGLE TASKS
  // ==========================================

  public async createTask(
    status: KanbanStatus,
    title: string,
    description?: string,
    dueDate?: string | null
  ): Promise<KanbanItem> {
    if (this.mockMode || !this.accessToken) {
      const id = `mock-task-${Date.now()}`;
      const newItem: KanbanItem = {
        id,
        userId: 'demo-user',
        source: 'google_tasks',
        sourceId: id,
        sourceListName: DEFAULT_COLUMN_TITLES[status],
        title,
        description: description || null,
        status,
        position: Date.now(),
        dueDate: dueDate || null,
        lastSyncedAt: new Date().toISOString(),
      };
      const list = this.mockState.get(status) || [];
      list.push(newItem);
      this.mockState.set(status, list);
      return newItem;
    }

    const mapping = this.listMapping || (await this.ensureKanbanLists());
    const listId = mapping[status].listId;

    const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        notes: description || undefined,
        due: dueDate ? new Date(dueDate).toISOString() : undefined,
      }),
    });

    if (res.status === 401) {
      this.handleTokenExpired();
    }

    if (!res.ok) {
      throw new Error(`Error creando tarea: ${res.statusText}`);
    }

    const created = await res.json();
    return {
      id: created.id,
      userId: 'google-user',
      source: 'google_tasks',
      sourceId: created.id,
      sourceListId: listId,
      sourceListName: mapping[status].title,
      title: created.title,
      description: created.notes || null,
      status,
      position: Date.now(),
      dueDate: created.due ? new Date(created.due).toISOString() : null,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  // ==========================================
  // ELIMINAR TAREA EN GOOGLE TASKS
  // ==========================================

  public async deleteTask(task: KanbanItem): Promise<void> {
    if (this.mockMode || !this.accessToken) {
      const list = this.mockState.get(task.status) || [];
      this.mockState.set(
        task.status,
        list.filter((t) => t.id !== task.id)
      );
      return;
    }

    const mapping = this.listMapping || (await this.ensureKanbanLists());
    const listId = task.sourceListId || mapping[task.status].listId;

    const res = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${task.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    if (res.status === 401) {
      this.handleTokenExpired();
    }

    if (!res.ok && res.status !== 404) {
      throw new Error(`Error eliminando tarea en Google Tasks: ${res.statusText}`);
    }
  }

  // ==========================================
  // DATOS MOCK INICIALES PARA PORTFOLIO / DEMO
  // ==========================================

  private initMockData() {
    const today = new Date();
    const tomorrow = new Date(Date.now() + 86400000);
    const nextWeek = new Date(Date.now() + 86400000 * 5);

    this.mockState.set('todo', [
      {
        id: 'mock-1',
        userId: 'demo',
        source: 'google_tasks',
        sourceId: 'mock-1',
        sourceListName: 'Para hacer',
        title: 'Comprar repuestos de hardware',
        description: 'Verificar compatibilidad de fuente y cables modulares.',
        status: 'todo',
        position: 1000,
        dueDate: tomorrow.toISOString(),
        lastSyncedAt: today.toISOString(),
      },
      {
        id: 'mock-2',
        userId: 'demo',
        source: 'google_tasks',
        sourceId: 'mock-2',
        sourceListName: 'Para hacer',
        title: 'Preparar presentación de arquitectura para el equipo',
        description: 'Incluir diagramas de flujo multi-dispositivo y métricas.',
        status: 'todo',
        position: 2000,
        dueDate: nextWeek.toISOString(),
        lastSyncedAt: today.toISOString(),
        subtasks: [
          { id: 'mock-sub-1', title: 'Diagramas de flujo multi-dispositivo', status: 'completed' },
          { id: 'mock-sub-2', title: 'Métricas de rendimiento e impacto Zero-DB', status: 'needsAction' },
        ],
      },
    ]);

    this.mockState.set('in_progress', [
      {
        id: 'mock-3',
        userId: 'demo',
        source: 'google_tasks',
        sourceId: 'mock-3',
        sourceListName: 'En progreso',
        title: 'Migración a arquitectura Zero-DB con Google Tasks API',
        description: 'Sincronizar las 4 columnas directamente con listas nativas.',
        status: 'in_progress',
        position: 1000,
        dueDate: tomorrow.toISOString(),
        lastSyncedAt: today.toISOString(),
        subtasks: [
          { id: 'mock-sub-4', title: 'Integración Google Identity Services OAuth 2.0', status: 'completed' },
          { id: 'mock-sub-5', title: 'Mapeo reactivo de 4 listas TaskLists', status: 'completed' },
          { id: 'mock-sub-6', title: 'Sincronización de subtareas y checklists', status: 'completed' },
        ],
      },
    ]);

    this.mockState.set('review', [
      {
        id: 'mock-4',
        userId: 'demo',
        source: 'google_tasks',
        sourceId: 'mock-4',
        sourceListName: 'En revisión',
        title: 'Auditoría de seguridad OAuth y permisos mínimos',
        description: 'Verificar scopes en Google Cloud Console y revocación.',
        status: 'review',
        position: 1000,
        dueDate: null,
        lastSyncedAt: today.toISOString(),
      },
    ]);

    this.mockState.set('done', [
      {
        id: 'mock-5',
        userId: 'demo',
        source: 'google_tasks',
        sourceId: 'mock-5',
        sourceListName: 'Terminado',
        title: 'Scaffolding de proyecto React 19 + TypeScript + Vite',
        description: 'Configuración de ESLint, Tailwind y Drag & Drop.',
        status: 'done',
        position: 1000,
        dueDate: null,
        lastSyncedAt: today.toISOString(),
      },
    ]);
  }
}

export const googleTasksDirect = new GoogleTasksDirectService();
