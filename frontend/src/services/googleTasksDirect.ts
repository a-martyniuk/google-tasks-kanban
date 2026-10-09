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
  private tokenExpiresAt: number = 0;
  private tokenClient: any = null;
  private refreshTimer: any = null;
  private refreshPromise: Promise<string> | null = null;
  private isSessionPaused: boolean = false;
  private listMapping: ColumnListMapping | null = null;
  private mockState: Map<KanbanStatus, KanbanItem[]> = new Map();
  private mockMode: boolean = false;

  public onAuthStateChanged?: (state: {
    isConnected: boolean;
    isPaused: boolean;
    user?: GoogleUserProfile;
  }) => void;

  constructor() {
    this.initMockData();
    this.initAuthFromStorage();
  }

  // ==========================================
  // AUTENTICACIÓN DIRECTA Y PERSISTENCIA (ZERO-DB)
  // ==========================================

  private initAuthFromStorage() {
    const isConnected = localStorage.getItem('kanban_google_connected') === 'true';
    const token = localStorage.getItem('kanban_google_token');
    const expiry = localStorage.getItem('kanban_google_token_expiry');

    if (isConnected && token) {
      this.accessToken = token;
      this.tokenExpiresAt = Number(expiry) || 0;
      this.mockMode = false;

      if (this.tokenExpiresAt > Date.now()) {
        this.isSessionPaused = false;
        this.scheduleTokenRefresh();
      } else {
        // El token anterior expiró mientras el usuario estaba fuera;
        // Se marcará como pendiente de renovación sin borrar datos
        this.isSessionPaused = true;
      }
    }
  }

  public setAccessToken(token: string, expiresInSec: number = 3599) {
    this.accessToken = token;
    this.tokenExpiresAt = Date.now() + expiresInSec * 1000;
    this.mockMode = false;
    this.isSessionPaused = false;
    localStorage.setItem('kanban_google_token', token);
    localStorage.setItem('kanban_google_token_expiry', String(this.tokenExpiresAt));
    localStorage.setItem('kanban_google_connected', 'true');
    this.scheduleTokenRefresh();
    this.onAuthStateChanged?.({ isConnected: true, isPaused: false });
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

  public isConnected(): boolean {
    return localStorage.getItem('kanban_google_connected') === 'true';
  }

  public getIsSessionPaused(): boolean {
    return this.isSessionPaused;
  }

  public scheduleTokenRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (!this.accessToken || !this.tokenExpiresAt) return;

    // Renovar proactivamente 5 minutos antes de expirar
    const msUntilRefresh = Math.max(5000, this.tokenExpiresAt - Date.now() - 5 * 60 * 1000);
    this.refreshTimer = setTimeout(() => {
      this.refreshAccessTokenSilently().catch((err) => {
        console.warn('[GoogleTasks] Renovación proactiva silenciosa no disponible en segundo plano:', err);
      });
    }, msUntilRefresh);
  }

  /**
   * Intenta refrescar el token de acceso de Google de manera silenciosa en segundo plano
   * (usando prompt: '' con GIS) sin interrumpir al usuario.
   */
  public async refreshAccessTokenSilently(): Promise<string> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const token = await this.requestGoogleTokenInternal({ prompt: '', silent: true });
        this.isSessionPaused = false;
        this.onAuthStateChanged?.({ isConnected: true, isPaused: false });
        return token;
      } catch (err: any) {
        if (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt) {
          this.isSessionPaused = true;
          this.onAuthStateChanged?.({ isConnected: true, isPaused: true });
        }
        throw err;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  public async ensureValidToken(): Promise<string | null> {
    if (this.mockMode || !this.isConnected()) return null;
    if (!this.accessToken || (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt - 60000)) {
      try {
        return await this.refreshAccessTokenSilently();
      } catch {
        return this.accessToken;
      }
    }
    return this.accessToken;
  }

  /**
   * Wrapper centralizado para llamadas autenticadas a Google Tasks API v1.
   * Cuenta con pre-chequeo de expiración y reintento automático transparente ante respuestas 401.
   */
  public async fetchWithAuth(url: string | URL, init: RequestInit = {}): Promise<Response> {
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
      throw new Error('Servicio no conectado con Google Tasks');
    }

    // Refrescar preventivamente si vence en menos de 1 minuto
    if (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt - 60000) {
      await this.refreshAccessTokenSilently().catch(() => {});
    }

    const exec = (token: string) => {
      const headers = new Headers(init.headers || {});
      headers.set('Authorization', `Bearer ${token}`);
      return fetch(url.toString(), { ...init, headers });
    };

    let res = await exec(this.accessToken || '');

    // Si devolvió 401 (token expirado en servidor), intentar 1 auto-refresco y reintentar
    if (res.status === 401) {
      console.warn('[GoogleTasks] 401 detectado, intentando auto-renovación silenciosa...');
      const newToken = await this.refreshAccessTokenSilently().catch(() => null);
      if (newToken) {
        res = await exec(newToken);
      }
    }

    if (res.status === 401) {
      this.handleTokenExpired();
    }

    return res;
  }

  private handleTokenExpired(): never {
    this.isSessionPaused = true;
    this.onAuthStateChanged?.({ isConnected: true, isPaused: true });
    throw new Error('Tu sesión de Google expiró. Por favor haz clic en "Renovar sesión" para reconectar.');
  }

  public logout() {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.isSessionPaused = false;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    localStorage.removeItem('kanban_google_token');
    localStorage.removeItem('kanban_google_token_expiry');
    localStorage.removeItem('kanban_google_connected');
    localStorage.removeItem('kanban_google_user_profile');
    this.setMockMode(true);
    this.onAuthStateChanged?.({ isConnected: false, isPaused: false });
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
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
      return [
        { id: 'mock-todo', title: 'Para hacer' },
        { id: 'mock-in-progress', title: 'En progreso' },
        { id: 'mock-review', title: 'En revisión' },
        { id: 'mock-done', title: 'Terminado' },
        { id: 'mock-my-tasks', title: 'Mis tareas (@default)' },
      ];
    }

    const res = await this.fetchWithAuth('https://tasks.googleapis.com/tasks/v1/users/@me/lists');

    if (!res.ok) {
      throw new Error(`Error al consultar listas de Google Tasks: ${res.statusText}`);
    }

    const data = await res.json();
    return (data.items || []).map((l: any) => ({
      id: l.id,
      title: l.title,
    }));
  }

  public getClientId(): string {
    return (
      (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
      localStorage.getItem('kanban_google_client_id') ||
      '220352188023-pqkffvbh70svr6jb13lt3ua11d6m6df1.apps.googleusercontent.com'
    );
  }

  public async requestGoogleToken(providedClientId?: string): Promise<string> {
    return this.requestGoogleTokenInternal({
      providedClientId,
      prompt: '',
      silent: false,
    });
  }

  private async requestGoogleTokenInternal(options: {
    providedClientId?: string;
    prompt?: string;
    silent?: boolean;
  } = {}): Promise<string> {
    const clientId = options.providedClientId || this.getClientId();
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

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        callback: (response: any) => {
          if (response.error) {
            if (options.silent) {
              reject(new Error(`Renovación silenciosa no disponible: ${response.error}`));
              return;
            }
            if (options.prompt === '') {
              // Si falla silencioso en modo interactivo, solicitar con prompt explícito
              console.log('[GoogleTasks] Solicitando autorización explícita...');
              client.requestAccessToken({ prompt: 'consent' });
              return;
            }
            reject(new Error(`Error de autenticación Google: ${response.error}`));
            return;
          }

          const expiresInSec = Number(response.expires_in) || 3599;
          this.setAccessToken(response.access_token, expiresInSec);
          resolve(response.access_token);
        },
      });

      this.tokenClient = client;
      client.requestAccessToken({ prompt: options.prompt !== undefined ? options.prompt : '' });
    });
  }

  public async fetchUserProfile(): Promise<GoogleUserProfile | null> {
    const cached = localStorage.getItem('kanban_google_user_profile');
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
      if (cached) {
        try { return JSON.parse(cached); } catch {}
      }
      return {
        name: 'Alexis (Portfolio Demo)',
        email: 'alexis.demo@gmail.com',
        picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=AlexisPortfolio',
      };
    }

    try {
      const res = await this.fetchWithAuth('https://www.googleapis.com/oauth2/v2/userinfo');
      if (!res.ok) {
        if (cached) {
          try { return JSON.parse(cached); } catch {}
        }
        return null;
      }
      const data = await res.json();
      const profile: GoogleUserProfile = {
        name: data.name || 'Usuario Google',
        email: data.email || '',
        picture: data.picture || '',
      };
      localStorage.setItem('kanban_google_user_profile', JSON.stringify(profile));
      return profile;
    } catch {
      if (cached) {
        try { return JSON.parse(cached); } catch {}
      }
      return null;
    }
  }

  // ==========================================
  // GESTIÓN DE LAS 4 LISTAS COMO COLUMNAS
  // ==========================================

  public async ensureKanbanLists(): Promise<ColumnListMapping> {
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
      return {
        todo: { listId: 'mock-todo', title: 'Para hacer' },
        in_progress: { listId: 'mock-in-progress', title: 'En progreso' },
        review: { listId: 'mock-review', title: 'En revisión' },
        done: { listId: 'mock-done', title: 'Terminado' },
      };
    }

    // 1. Obtener listas existentes del usuario
    const res = await this.fetchWithAuth('https://tasks.googleapis.com/tasks/v1/users/@me/lists');

    if (!res.ok) {
      throw new Error(`Error consultando listas en Google Tasks: ${res.statusText}`);
    }

    const data = await res.json();
    const existingLists: Array<{ id: string; title: string }> = data.items || [];

    const mapping: Partial<ColumnListMapping> = {};

    // 2. Mapear o crear las 4 listas
    for (const [statusKey, defaultTitle] of Object.entries(DEFAULT_COLUMN_TITLES) as [KanbanStatus, string][]) {
      let match = existingLists.find(
        (l) => l.title.trim().toLowerCase() === defaultTitle.toLowerCase()
      );

      if (!match) {
        console.log(`[GoogleTasks] Creando lista remota "${defaultTitle}"...`);
        const createRes = await this.fetchWithAuth('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
  // CONSULTA PAGINADA DE TAREAS (SOPORTE >100 TAREAS)
  // ==========================================

  private async fetchAllTasksFromList(
    listId: string,
    params: { showCompleted?: boolean; showHidden?: boolean } = {}
  ): Promise<any[]> {
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
      return [];
    }

    const allTasks: any[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`);
      url.searchParams.set('maxResults', '100');
      if (params.showCompleted !== undefined) {
        url.searchParams.set('showCompleted', String(params.showCompleted));
      }
      if (params.showHidden !== undefined) {
        url.searchParams.set('showHidden', String(params.showHidden));
      }
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const res = await this.fetchWithAuth(url.toString());

      if (!res.ok) {
        console.warn(`Error al consultar tareas de ${listId}: ${res.statusText}`);
        break;
      }

      const json = await res.json();
      const items = json.items || [];
      allTasks.push(...items);
      pageToken = json.nextPageToken;
    } while (pageToken);

    return allTasks;
  }

  // ==========================================
  // OBTENER TABLERO COMPLETO
  // ==========================================

  public async fetchBoardTasks(): Promise<{
    columns: Array<{ id: KanbanStatus; title: string; listId: string; items: KanbanItem[] }>;
    totalCount: number;
    lastSyncedAt: string;
  }> {
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
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

    // Si está conectado pero el token está ausente o expirado, intentar validar
    if (this.isConnected() && !this.accessToken) {
      await this.ensureValidToken();
      if (!this.accessToken) {
        this.isSessionPaused = true;
        this.onAuthStateChanged?.({ isConnected: true, isPaused: true });
        throw new Error('Sesión de Google en pausa. Haz clic en "Renovar sesión" para sincronizar tus tareas.');
      }
    }

    const mapping = this.listMapping || (await this.ensureKanbanLists());
    const statuses: KanbanStatus[] = ['todo', 'in_progress', 'review', 'done'];

    const columnPromises = statuses.map(async (status) => {
      const listInfo = mapping[status];
      const rawTasks = await this.fetchAllTasksFromList(listInfo.listId, {
        showCompleted: true,
        showHidden: true,
      });

      // Agrupar tareas principales y subtareas
      const parentTasksMap = new Map<string, KanbanItem>();
      const subtasksByParent = new Map<string, SubTaskItem[]>();
      const orphanSubtasks: KanbanItem[] = [];

      rawTasks.forEach((t) => {
        if (!t.id || !t.title || t.deleted) return;

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
            dueDate: t.due || null,
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
            const extraTasks = await this.fetchAllTasksFromList(extraId, {
              showCompleted: false,
              showHidden: true,
            });
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
                  dueDate: t.due || null,
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
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
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
    const insertRes = await this.fetchWithAuth(
      `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks`,
      {
        method: 'POST',
        headers: {
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

    // Replicar subtareas bajo el nuevo padre si existen y capturar sus nuevos IDs
    const updatedSubtasks: SubTaskItem[] = [];
    if (task.subtasks && task.subtasks.length > 0) {
      for (const sub of task.subtasks) {
        try {
          const subRes = await this.fetchWithAuth(
            `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks?parent=${newGoogleTask.id}`,
            {
              method: 'POST',
              headers: {
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
        await this.fetchWithAuth(
          `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks/${newGoogleTask.id}`,
          {
            method: 'PATCH',
            headers: {
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
        await this.fetchWithAuth(
          `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks/${newGoogleTask.id}`,
          {
            method: 'PATCH',
            headers: {
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
    this.fetchWithAuth(
      `https://tasks.googleapis.com/tasks/v1/lists/${sourceListId}/tasks/${task.id}`,
      {
        method: 'DELETE',
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
  // JERARQUÍA: ANIDAR / DESANIDAR TAREAS (tasks.move)
  // ==========================================

  /**
   * Envuelve el endpoint tasks.move de Google Tasks. Conserva ID, notas, fecha y estado.
   * `destinationTasklist` permite cambiar de lista (no soportado para tareas recurrentes).
   */
  private async moveGoogleTask(
    listId: string,
    taskId: string,
    opts: { parent?: string | null; previous?: string | null; destinationTasklist?: string | null } = {}
  ): Promise<any> {
    const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${taskId}/move`);
    if (opts.parent) url.searchParams.set('parent', opts.parent);
    if (opts.previous) url.searchParams.set('previous', opts.previous);
    if (opts.destinationTasklist && opts.destinationTasklist !== listId) {
      url.searchParams.set('destinationTasklist', opts.destinationTasklist);
    }

    const res = await this.fetchWithAuth(url.toString(), {
      method: 'POST',
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const errJson = await res.json();
        detail = errJson?.error?.message || detail;
      } catch {}
      throw new Error(`Google Tasks rechazó el movimiento: ${detail}`);
    }

    return res.json();
  }

  private async resolveListId(item: KanbanItem): Promise<string> {
    const mapping = this.listMapping || (await this.ensureKanbanLists());
    if (item.status && mapping[item.status]?.listId) {
      return mapping[item.status].listId;
    }
    return item.sourceListId || mapping.todo.listId;
  }

  private findMockItem(id: string): KanbanItem | undefined {
    for (const list of this.mockState.values()) {
      const found = list.find((t) => t.id === id);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Convierte `task` en subtarea de `parent`.
   * Como Google Tasks admite un solo nivel, las subtareas de `task` pasan a ser
   * subtareas hermanas dentro de `parent` (ubicadas a continuación de `task`).
   * Devuelve las subtareas a agregar al final de `parent`, en orden.
   */
  public async nestTaskUnder(task: KanbanItem, parent: KanbanItem): Promise<SubTaskItem[]> {
    if (task.id === parent.id) {
      throw new Error('Una tarea no puede ser subtarea de sí misma.');
    }
    if (parent.parentId) {
      throw new Error('No se puede anidar dentro de una subtarea: Google Tasks admite un solo nivel.');
    }

    const taskAsSub = (id: string, data?: any): SubTaskItem => ({
      id,
      title: data?.title || task.title,
      status:
        (data?.status as SubTaskItem['status']) ||
        (task.sourceStatus === 'completed' ? 'completed' : 'needsAction'),
      completed: data?.completed || null,
    });
    const children = (task.subtasks || []).filter((s) => !s.id.startsWith('temp-'));

    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
      const srcList = this.mockState.get(task.status) || [];
      this.mockState.set(task.status, srcList.filter((t) => t.id !== task.id));
      const result = [taskAsSub(task.id), ...children];
      const mockParent = this.findMockItem(parent.id);
      if (mockParent) {
        mockParent.subtasks = [...(mockParent.subtasks || []), ...result];
      }
      return result;
    }

    const srcListId = await this.resolveListId(task);
    const destListId = await this.resolveListId(parent);
    const lastExisting = [...(parent.subtasks || [])].reverse().find((s) => !s.id.startsWith('temp-'));
    const anchor = lastExisting?.id || null;

    // Función fallback robusta: crear directamente bajo parent en destListId y borrar origen
    const fallbackRecreateAsSubtask = async (): Promise<SubTaskItem[]> => {
      // 1. Crear la tarea como subtarea directamente bajo parent en destListId
      const createRes = await this.fetchWithAuth(
        `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks?parent=${parent.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: task.title,
            notes: task.description || undefined,
            due: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
            status: task.sourceStatus === 'completed' ? 'completed' : 'needsAction',
          }),
        }
      );

      if (!createRes.ok) {
        throw new Error(`Error al crear subtarea en Google Tasks: ${createRes.statusText}`);
      }

      const createdMain = await createRes.json();
      const mainSub: SubTaskItem = {
        id: createdMain.id,
        title: createdMain.title,
        status: createdMain.status || 'needsAction',
        completed: createdMain.completed || null,
      };

      // 2. Replicar los hijos de task también como subtareas de parent (Google solo admite 1 nivel)
      const replicatedChildren: SubTaskItem[] = [];
      for (const child of children) {
        try {
          const childRes = await this.fetchWithAuth(
            `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks?parent=${parent.id}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: child.title,
                status: child.status || 'needsAction',
              }),
            }
          );
          if (childRes.ok) {
            const createdChild = await childRes.json();
            replicatedChildren.push({
              id: createdChild.id,
              title: createdChild.title,
              status: createdChild.status || 'needsAction',
              completed: createdChild.completed || null,
            });
          }
        } catch (e) {
          console.warn('[nestTaskUnder] Error replicando hijo como subtarea:', e);
        }
      }

      // 3. Eliminar la tarea original de su lista fuente (y destListId si difiere)
      try {
        await this.fetchWithAuth(
          `https://tasks.googleapis.com/tasks/v1/lists/${srcListId}/tasks/${task.id}`,
          { method: 'DELETE' }
        );
      } catch (delErr) {
        if (srcListId !== destListId) {
          try {
            await this.fetchWithAuth(
              `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks/${task.id}`,
              { method: 'DELETE' }
            );
          } catch {}
        }
      }

      return [mainSub, ...replicatedChildren];
    };

    // Si están en la misma lista y no tiene hijos, intentar moveGoogleTask nativo
    if (srcListId === destListId && children.length === 0) {
      try {
        let movedTask: any;
        try {
          movedTask = await this.moveGoogleTask(srcListId, task.id, {
            parent: parent.id,
            previous: anchor,
          });
        } catch {
          // Si falló por anchor inválido u oculto, reintentar sin anchor
          movedTask = await this.moveGoogleTask(srcListId, task.id, {
            parent: parent.id,
          });
        }
        return [taskAsSub(movedTask?.id || task.id, movedTask)];
      } catch (moveErr) {
        console.warn('[nestTaskUnder] tasks.move falló, usando fallback de recreación:', moveErr);
      }
    }

    // Para cross-list, tareas con subtareas, o si tasks.move falló con 404:
    return await fallbackRecreateAsSubtask();
  }

  /**
   * Convierte una subtarea en tarea principal, ubicándola al inicio de la columna destino.
   */
  public async promoteSubtask(
    sub: SubTaskItem,
    parent: KanbanItem,
    targetStatus: KanbanStatus
  ): Promise<KanbanItem> {
    const mapping = this.listMapping || (await this.ensureKanbanLists());
    const buildItem = (data: any, listId?: string): KanbanItem => ({
      id: data?.id || sub.id,
      userId: parent.userId,
      source: 'google_tasks',
      sourceId: data?.id || sub.id,
      sourceListId: listId,
      sourceListName: mapping[targetStatus].title,
      title: data?.title || sub.title,
      description: data?.notes || null,
      status: targetStatus,
      position: 0,
      dueDate: data?.due ? new Date(data.due).toISOString() : null,
      sourceStatus: data?.status || sub.status,
      lastSyncedAt: new Date().toISOString(),
      parentId: null,
      subtasks: [],
    });

    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
      const mockParent = this.findMockItem(parent.id);
      if (mockParent) {
        mockParent.subtasks = (mockParent.subtasks || []).filter((s) => s.id !== sub.id);
      }
      const newItem = buildItem(null, mapping[targetStatus].listId);
      const list = this.mockState.get(targetStatus) || [];
      this.mockState.set(targetStatus, [newItem, ...list]);
      return newItem;
    }

    const srcListId = await this.resolveListId(parent);
    const destListId = mapping[targetStatus].listId;

    let moved: any;
    try {
      // Sin `parent` => pasa a ser tarea de primer nivel; sin `previous` => queda primera en la lista
      moved = await this.moveGoogleTask(srcListId, sub.id, {
        destinationTasklist: destListId,
      });
    } catch (moveErr) {
      console.warn('[promoteSubtask] tasks.move falló, usando creación directa:', moveErr);
      const createRes = await this.fetchWithAuth(
        `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: sub.title,
            status: sub.status || 'needsAction',
          }),
        }
      );
      if (!createRes.ok) {
        throw new Error(`Error al convertir subtarea en tarea: ${createRes.statusText}`);
      }
      moved = await createRes.json();
      try {
        await this.fetchWithAuth(
          `https://tasks.googleapis.com/tasks/v1/lists/${srcListId}/tasks/${sub.id}`,
          { method: 'DELETE' }
        );
      } catch {}
    }

    const settings = this.getSettings();
    if (targetStatus === 'done' && settings.completeInSourceOnDone && moved?.status !== 'completed') {
      try {
        const patchRes = await this.fetchWithAuth(
          `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks/${moved?.id || sub.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'completed' }),
          }
        );
        if (patchRes.ok) {
          return buildItem(await patchRes.json(), destListId);
        }
      } catch (err) {
        console.warn('Error marcando como completada la subtarea promovida:', err);
      }
    }

    return buildItem(moved, destListId);
  }

  /**
   * Mueve una subtarea a otra tarjeta (o la reordena dentro de la misma).
   * `previousId` es la subtarea que quedará inmediatamente antes (null = primera).
   */
  public async moveSubtaskToParent(
    sub: SubTaskItem,
    fromParent: KanbanItem,
    toParent: KanbanItem,
    previousId: string | null
  ): Promise<SubTaskItem> {
    if (toParent.parentId) {
      throw new Error('No se puede anidar dentro de una subtarea: Google Tasks admite un solo nivel.');
    }

    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
      const from = this.findMockItem(fromParent.id);
      if (from) from.subtasks = (from.subtasks || []).filter((s) => s.id !== sub.id);
      const to = this.findMockItem(toParent.id);
      if (to) {
        const list = [...(to.subtasks || [])];
        const idx = previousId ? list.findIndex((s) => s.id === previousId) + 1 : 0;
        list.splice(idx, 0, sub);
        to.subtasks = list;
      }
      return sub;
    }

    const srcListId = await this.resolveListId(fromParent);
    const destListId = await this.resolveListId(toParent);

    // Si ambas tarjetas están en la misma lista, intentar moveGoogleTask nativo
    if (srcListId === destListId) {
      try {
        let moved: any;
        try {
          moved = await this.moveGoogleTask(srcListId, sub.id, {
            parent: toParent.id,
            previous: previousId && !previousId.startsWith('temp-') ? previousId : null,
          });
        } catch {
          moved = await this.moveGoogleTask(srcListId, sub.id, {
            parent: toParent.id,
          });
        }

        return {
          ...sub,
          id: moved?.id || sub.id,
          status: (moved?.status as SubTaskItem['status']) || sub.status,
          completed: moved?.completed ?? sub.completed ?? null,
        };
      } catch (moveErr) {
        console.warn('[moveSubtaskToParent] tasks.move falló, usando fallback:', moveErr);
      }
    }

    // Fallback para cross-list o fallo de tasks.move:
    // Crear la subtarea directamente bajo toParent en destListId y borrar de srcListId
    const createRes = await this.fetchWithAuth(
      `https://tasks.googleapis.com/tasks/v1/lists/${destListId}/tasks?parent=${toParent.id}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sub.title,
          status: sub.status || 'needsAction',
        }),
      }
    );

    if (!createRes.ok) {
      throw new Error(`Error al mover subtarea a nueva tarjeta: ${createRes.statusText}`);
    }

    const created = await createRes.json();

    // Eliminar la subtarea anterior en srcListId
    try {
      await this.fetchWithAuth(
        `https://tasks.googleapis.com/tasks/v1/lists/${srcListId}/tasks/${sub.id}`,
        { method: 'DELETE' }
      );
    } catch {}

    return {
      id: created.id,
      title: created.title,
      status: created.status || 'needsAction',
      completed: created.completed || null,
    };
  }

  // ==========================================
  // CREAR SUBTAREA EN GOOGLE TASKS
  // ==========================================

  public async createSubtask(
    parentTask: KanbanItem,
    title: string
  ): Promise<SubTaskItem> {
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
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

    const res = await this.fetchWithAuth(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks?parent=${parentTask.id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          status: 'needsAction',
        }),
      }
    );

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
  // EDITAR SUBTAREA EN GOOGLE TASKS
  // ==========================================

  public async updateSubtask(
    listId: string,
    subtaskId: string,
    title: string
  ): Promise<SubTaskItem> {
    const trimmed = title.trim();
    if (!trimmed) {
      throw new Error('El título de la subtarea no puede estar vacío');
    }

    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
      for (const list of this.mockState.values()) {
        for (const item of list) {
          if (item.subtasks) {
            const sub = item.subtasks.find((s) => s.id === subtaskId);
            if (sub) {
              sub.title = trimmed;
              return { ...sub };
            }
          }
        }
      }
      return { id: subtaskId, title: trimmed, status: 'needsAction' };
    }

    const res = await this.fetchWithAuth(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${subtaskId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: trimmed,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Error actualizando subtarea: ${res.statusText}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      title: data.title,
      status: data.status || 'needsAction',
      completed: data.completed || null,
    };
  }

  // ==========================================
  // ACTUALIZAR TAREA (TÍTULO, NOTAS, FECHA)
  // ==========================================

  public async updateTask(
    task: KanbanItem,
    updates: { title?: string; description?: string | null; dueDate?: string | null }
  ): Promise<KanbanItem> {
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
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
      body.due = updates.dueDate
        ? updates.dueDate.includes('T')
          ? updates.dueDate
          : `${updates.dueDate}T00:00:00.000Z`
        : null;
    }

    const res = await this.fetchWithAuth(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${task.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

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
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
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

    const res = await this.fetchWithAuth(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${subtaskId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: completed ? 'completed' : 'needsAction',
        }),
      }
    );

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
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
      for (const list of this.mockState.values()) {
        for (const item of list) {
          if (item.subtasks) {
            item.subtasks = item.subtasks.filter((s) => s.id !== subtaskId);
          }
        }
      }
      return;
    }

    const res = await this.fetchWithAuth(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${subtaskId}`,
      {
        method: 'DELETE',
      }
    );

    if (!res.ok && res.status !== 404) {
      throw new Error(`Error eliminando subtarea: ${res.statusText}`);
    }
  }

  // ==========================================
  // IMPORTAR TAREAS DESDE LISTA DEFAULT ("My Tasks")
  // ==========================================

  public async importTasksFromDefaultList(): Promise<number> {
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
      return 0;
    }

    const mapping = this.listMapping || (await this.ensureKanbanLists());
    const todoListId = mapping.todo.listId;

    // Obtener tareas de la lista @default (My Tasks) con paginación completa
    const tasks = await this.fetchAllTasksFromList('@default', {
      showCompleted: true,
      showHidden: true,
    });
    if (tasks.length === 0) return 0;

    let imported = 0;
    const parentIdMap = new Map<string, string>(); // oldId -> newId

    // 1. Crear primero las tareas principales
    const parents = tasks.filter((x) => !x.parent && x.title && !x.deleted);
    for (const t of parents) {
      const createRes = await this.fetchWithAuth(
        `https://tasks.googleapis.com/tasks/v1/lists/${todoListId}/tasks`,
        {
          method: 'POST',
          headers: {
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
    const children = tasks.filter((x) => x.parent && x.title && !x.deleted);
    for (const t of children) {
      const newParentId = parentIdMap.get(t.parent);
      const url = newParentId
        ? `https://tasks.googleapis.com/tasks/v1/lists/${todoListId}/tasks?parent=${newParentId}`
        : `https://tasks.googleapis.com/tasks/v1/lists/${todoListId}/tasks`;

      const createRes = await this.fetchWithAuth(url, {
        method: 'POST',
        headers: {
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
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
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

    const res = await this.fetchWithAuth(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        notes: description || undefined,
        due: dueDate
          ? dueDate.includes('T')
            ? dueDate
            : `${dueDate}T00:00:00.000Z`
          : undefined,
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
    if (this.mockMode || (!this.accessToken && !this.isConnected())) {
      const list = this.mockState.get(task.status) || [];
      this.mockState.set(
        task.status,
        list.filter((t) => t.id !== task.id)
      );
      return;
    }

    const mapping = this.listMapping || (await this.ensureKanbanLists());
    const listId = task.sourceListId || mapping[task.status].listId;

    const res = await this.fetchWithAuth(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${task.id}`,
      {
        method: 'DELETE',
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
