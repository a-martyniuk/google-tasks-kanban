import { google } from 'googleapis';
import { NormalizedTask, TaskListInfo, TaskSourceAdapter } from './sourceAdapter.interface.js';

export class GoogleTasksAdapter implements TaskSourceAdapter {
  readonly sourceName = 'google_tasks' as const;

  private createClient(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.tasks({ version: 'v1', auth });
  }

  async fetchLists(accessToken: string): Promise<TaskListInfo[]> {
    if (accessToken === 'demo_token' || accessToken.startsWith('mock_')) {
      return [
        { id: 'list-personal', title: 'Tareas Personales' },
        { id: 'list-work', title: 'Proyectos & Trabajo' },
        { id: 'list-urgent', title: 'Urgentes' },
      ];
    }

    try {
      const client = this.createClient(accessToken);
      const res = await client.tasklists.list({ maxResults: 50 });
      const items = res.data.items || [];
      return items.map((list) => ({
        id: list.id || '',
        title: list.title || 'Lista sin título',
        updatedAt: list.updated || undefined,
      }));
    } catch (error: any) {
      console.error('[GoogleTasksAdapter] Error fetching lists:', error?.message || error);
      throw new Error(`Error al obtener listas de Google Tasks: ${error?.message || 'Error de API'}`);
    }
  }

  async fetchTasks(
    accessToken: string,
    listIds?: string[],
    updatedMin?: Date
  ): Promise<NormalizedTask[]> {
    if (accessToken === 'demo_token' || accessToken.startsWith('mock_')) {
      return this.getDemoTasks();
    }

    try {
      const client = this.createClient(accessToken);
      
      // Si no se proporcionaron listas, obtener las listas activas
      let targetLists: { id: string; title: string }[] = [];
      if (!listIds || listIds.length === 0) {
        const availableLists = await this.fetchLists(accessToken);
        targetLists = availableLists.map((l) => ({ id: l.id, title: l.title }));
      } else {
        const availableLists = await this.fetchLists(accessToken);
        const map = new Map(availableLists.map((l) => [l.id, l.title]));
        targetLists = listIds.map((id) => ({ id, title: map.get(id) || 'Lista' }));
      }

      const allTasks: NormalizedTask[] = [];

      for (const list of targetLists) {
        try {
          const res = await client.tasks.list({
            tasklist: list.id,
            showCompleted: false,
            showDeleted: false,
            showHidden: false,
            maxResults: 100,
            ...(updatedMin ? { updatedMin: updatedMin.toISOString() } : {}),
          });

          const items = res.data.items || [];
          for (const item of items) {
            if (!item.id || !item.title) continue;

            allTasks.push({
              source: 'google_tasks',
              sourceId: item.id,
              sourceListId: list.id,
              sourceListName: list.title,
              title: item.title,
              description: item.notes || '',
              dueDate: item.due ? new Date(item.due) : null,
              sourceStatus: item.status || 'needsAction',
              sourceEtag: item.etag || undefined,
              sourceUpdatedAt: item.updated ? new Date(item.updated) : undefined,
            });
          }
        } catch (listErr: any) {
          console.warn(`[GoogleTasksAdapter] Error fetching tasks for list ${list.id}:`, listErr?.message);
        }
      }

      return allTasks;
    } catch (error: any) {
      console.error('[GoogleTasksAdapter] Error fetching tasks:', error?.message || error);
      throw new Error(`Error al sincronizar Google Tasks: ${error?.message || 'Error de conexión'}`);
    }
  }

  async completeTask(
    accessToken: string,
    sourceListId: string,
    sourceId: string
  ): Promise<void> {
    if (accessToken === 'demo_token' || accessToken.startsWith('mock_')) {
      console.log(`[GoogleTasksAdapter (DEMO)] Tarea ${sourceId} marcada como completada en lista ${sourceListId}`);
      return;
    }

    try {
      const client = this.createClient(accessToken);
      await client.tasks.patch({
        tasklist: sourceListId,
        task: sourceId,
        requestBody: {
          status: 'completed',
        },
      });
      console.log(`[GoogleTasksAdapter] Tarea ${sourceId} marcada como completada en Google Tasks.`);
    } catch (error: any) {
      console.error(`[GoogleTasksAdapter] Error al completar tarea ${sourceId}:`, error?.message || error);
      // No lanzamos excepción bloqueante para no interrumpir el flujo del Kanban si la API externa falla
    }
  }

  private getDemoTasks(): NormalizedTask[] {
    const today = new Date();
    const tomorrow = new Date(Date.now() + 86400000);
    const nextWeek = new Date(Date.now() + 86400000 * 7);

    return [
      {
        source: 'google_tasks',
        sourceId: 'gtask-001',
        sourceListId: 'list-personal',
        sourceListName: 'Tareas Personales',
        title: 'Comprar repuesto y leche',
        description: 'Supermercado de la esquina. Llevar bolsa reutilizable.',
        dueDate: tomorrow,
        sourceStatus: 'needsAction',
        sourceUpdatedAt: today,
      },
      {
        source: 'google_tasks',
        sourceId: 'gtask-002',
        sourceListId: 'list-work',
        sourceListName: 'Proyectos & Trabajo',
        title: 'Revisar documentación de API Google Cloud',
        description: 'Validar scopes OAuth y renovar credenciales de servicio.',
        dueDate: nextWeek,
        sourceStatus: 'needsAction',
        sourceUpdatedAt: today,
      },
      {
        source: 'google_tasks',
        sourceId: 'gtask-003',
        sourceListId: 'list-urgent',
        sourceListName: 'Urgentes',
        title: 'Pagar factura de hosting y base de datos',
        description: 'Vence a fin de mes. Verificar comprobante en el portal.',
        dueDate: tomorrow,
        sourceStatus: 'needsAction',
        sourceUpdatedAt: today,
      },
      {
        source: 'google_tasks',
        sourceId: 'gtask-004',
        sourceListId: 'list-work',
        sourceListName: 'Proyectos & Trabajo',
        title: 'Preparar release de producción v1.0',
        description: 'Verificar pipeline de CI/CD y ejecutar tests de integración.',
        dueDate: nextWeek,
        sourceStatus: 'needsAction',
        sourceUpdatedAt: today,
      },
    ];
  }
}
