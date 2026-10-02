export interface NormalizedTask {
  source: 'google_tasks';
  sourceId: string;
  sourceListId?: string;
  sourceListName?: string;
  title: string;
  description?: string;
  dueDate?: Date | null;
  sourceStatus?: string; // "needsAction" | "completed"
  sourceEtag?: string;
  sourceUpdatedAt?: Date;
}

export interface TaskListInfo {
  id: string;
  title: string;
  updatedAt?: string;
}

export interface TaskSourceAdapter {
  readonly sourceName: 'google_tasks';
  
  /**
   * Obtiene las tareas activas para las listas seleccionadas
   */
  fetchTasks(
    accessToken: string,
    listIds?: string[],
    updatedMin?: Date
  ): Promise<NormalizedTask[]>;

  /**
   * Obtiene las listas disponibles en la fuente
   */
  fetchLists?(accessToken: string): Promise<TaskListInfo[]>;

  /**
   * Marca una tarea como completada en la fuente si el usuario configuró auto-complete al mover a 'done'
   */
  completeTask?(
    accessToken: string,
    sourceListId: string,
    sourceId: string
  ): Promise<void>;
}
