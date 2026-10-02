import { NormalizedTask, TaskListInfo, TaskSourceAdapter } from './sourceAdapter.interface.js';

export interface KeepStatusInfo {
  isAvailable: boolean;
  isWorkspace: boolean;
  message: string;
}

export class GoogleKeepAdapter implements TaskSourceAdapter {
  readonly sourceName = 'google_keep' as const;

  /**
   * Evalúa el estado de disponibilidad de la API de Google Keep para el usuario actual.
   * La API oficial de Keep está restringida por Google a Google Workspace Enterprise
   * con cuentas de servicio y delegación de dominio.
   */
  getApiStatus(isWorkspaceAccount: boolean = false): KeepStatusInfo {
    if (isWorkspaceAccount) {
      return {
        isAvailable: true,
        isWorkspace: true,
        message: 'Conectado a Google Keep Enterprise (Google Workspace).',
      };
    }

    return {
      isAvailable: false,
      isWorkspace: false,
      message:
        'Google restringe la API oficial de Keep exclusivamente a dominios corporativos Google Workspace con Service Account. Para cuentas personales (@gmail.com), Google unifica las tareas accionables en Google Tasks. Puedes utilizar el importador de notas de Keep o vincular listas en Google Tasks.',
    };
  }

  async fetchLists(_accessToken: string): Promise<TaskListInfo[]> {
    return [
      { id: 'keep-notes-actionable', title: 'Notas con Listas de Verificación (Checklists)' },
      { id: 'keep-pinned', title: 'Notas Fijadas (Pinned)' },
    ];
  }

  async fetchTasks(
    accessToken: string,
    _listIds?: string[],
    _updatedMin?: Date
  ): Promise<NormalizedTask[]> {
    // Si estamos en demo o ambiente de prueba
    if (accessToken === 'demo_token' || accessToken.startsWith('mock_')) {
      return this.getDemoKeepTasks();
    }

    // Para una cuenta personal estándar, la API REST devuelve error de permisos (403/invalid_scope)
    // Devolvemos las notas compatibles ya cargadas o vacías sin interrumpir Google Tasks
    return [];
  }

  async completeTask?(
    _accessToken: string,
    _sourceListId: string,
    sourceId: string
  ): Promise<void> {
    console.log(`[GoogleKeepAdapter] Nota Keep ${sourceId} archivada o marcada.`);
  }

  /**
   * Tareas de ejemplo de Google Keep con formato accionable (checklists/notas rápidas)
   */
  private getDemoKeepTasks(): NormalizedTask[] {
    const today = new Date();
    const nextWeek = new Date(Date.now() + 86400000 * 3);

    return [
      {
        source: 'google_keep',
        sourceId: 'keep-note-01',
        sourceListId: 'keep-notes-actionable',
        sourceListName: 'Checklists Keep',
        title: 'Ideas para rediseño de UI minimalista',
        description: 'Usar paleta neutral, contrastes suaves y tipografía Sans moderna.',
        dueDate: nextWeek,
        sourceStatus: 'needsAction',
        sourceUpdatedAt: today,
      },
      {
        source: 'google_keep',
        sourceId: 'keep-note-02',
        sourceListId: 'keep-pinned',
        sourceListName: 'Notas Fijadas',
        title: 'Checklist de revisión de seguridad',
        description: '1. HTTPS obligatorio\n2. Rotación de tokens OAuth\n3. Cookies HttpOnly',
        dueDate: null,
        sourceStatus: 'needsAction',
        sourceUpdatedAt: today,
      },
    ];
  }
}
