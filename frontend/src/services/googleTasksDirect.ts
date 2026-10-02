import { KanbanItem, KanbanStatus } from '../types';

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

  public async requestGoogleToken(clientId: string): Promise<string> {
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
        `https://tasks.googleapis.com/tasks/v1/lists/${listInfo.listId}/tasks?showCompleted=false&showHidden=false&maxResults=100`,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );

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

      const items: KanbanItem[] = rawTasks
        .filter((t) => t.id && t.title)
        .map((t, idx) => ({
          id: t.id,
          userId: 'google-user',
          source: 'google_tasks' as const,
          sourceId: t.id,
          sourceListId: listInfo.listId,
          sourceListName: listInfo.title,
          title: t.title,
          description: t.notes || null,
          status,
          position: (idx + 1) * 1000,
          dueDate: t.due ? new Date(t.due).toISOString() : null,
          sourceStatus: t.status || 'needsAction',
          lastSyncedAt: new Date().toISOString(),
        }));

      return {
        id: status,
        title: listInfo.title,
        listId: listInfo.listId,
        items,
      };
    });

    const columns = await Promise.all(columnPromises);
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

    if (!insertRes.ok) {
      throw new Error(`Error creando tarea en lista destino: ${insertRes.statusText}`);
    }

    const newGoogleTask = await insertRes.json();

    // 2. Eliminar de la lista de origen en Google Tasks
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
    };
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
      },
      {
        id: 'mock-keep-1',
        userId: 'demo',
        source: 'google_keep',
        sourceId: 'mock-keep-1',
        sourceListName: 'Checklist Keep',
        title: 'Ideas para optimización de UI y micro-animaciones',
        description: 'Contrastes sutiles, feedback háptico y transiciones con resorte.',
        status: 'todo',
        position: 3000,
        dueDate: null,
        lastSyncedAt: today.toISOString(),
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
