import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryKanbanRepository } from '../src/repositories/inMemoryKanban.repository.js';
import { SyncService } from '../src/services/sync.service.js';
import { KanbanService } from '../src/services/kanban.service.js';
import { NormalizedTask, TaskSourceAdapter } from '../src/adapters/sourceAdapter.interface.js';

class MockTaskAdapter implements TaskSourceAdapter {
  constructor(
    public readonly sourceName: 'google_tasks' = 'google_tasks',
    public mockTasks: NormalizedTask[] = [],
    public completedTasks: string[] = []
  ) {}

  async fetchTasks(): Promise<NormalizedTask[]> {
    return [...this.mockTasks];
  }

  async completeTask(_token: string, _listId: string, sourceId: string): Promise<void> {
    this.completedTasks.push(sourceId);
  }
}

describe('Kanban Tasks Board: Motor de Sincronización y Reglas de Negocio', () => {
  let repository: InMemoryKanbanRepository;
  let mockTasksAdapter: MockTaskAdapter;
  let syncService: SyncService;
  let kanbanService: KanbanService;
  const userId = 'user-test-123';

  beforeEach(() => {
    repository = new InMemoryKanbanRepository();
    mockTasksAdapter = new MockTaskAdapter('google_tasks', []);
    syncService = new SyncService(repository, [mockTasksAdapter]);
    kanbanService = new KanbanService(repository, mockTasksAdapter);
  });

  it('1. CREACIÓN: Las nuevas tareas de la fuente entran automáticamente en "Para hacer" (todo)', async () => {
    mockTasksAdapter.mockTasks = [
      {
        source: 'google_tasks',
        sourceId: 'task-1',
        title: 'Primera tarea remota',
        description: 'Detalle de la tarea',
        dueDate: new Date('2026-10-10'),
      },
      {
        source: 'google_tasks',
        sourceId: 'task-2',
        title: 'Segunda tarea remota',
        description: '',
      },
    ];

    const result = await syncService.syncUser(userId, 'fake-token');

    expect(result.added).toBe(2);
    expect(result.totalActive).toBe(2);

    const board = await kanbanService.getBoard(userId);
    const todoCol = board.columns.find((c) => c.id === 'todo');
    const inProgressCol = board.columns.find((c) => c.id === 'in_progress');

    expect(todoCol?.items.length).toBe(2);
    expect(inProgressCol?.items.length).toBe(0);
    expect(todoCol?.items[0].title).toBe('Primera tarea remota');
    expect(todoCol?.items[0].status).toBe('todo');
  });

  it('2. ACTUALIZACIÓN: Si cambia el título o notas en Google, se actualiza pero MANTIENE la columna actual', async () => {
    // 1. Sincronizar inicialmente
    mockTasksAdapter.mockTasks = [
      {
        source: 'google_tasks',
        sourceId: 'task-move-1',
        title: 'Título Original',
        description: 'Notas originales',
      },
    ];
    await syncService.syncUser(userId, 'token');

    // 2. Mover la tarjeta a "En progreso"
    const boardBefore = await kanbanService.getBoard(userId);
    const item = boardBefore.columns[0].items[0];
    await kanbanService.moveItem(userId, item.id, 'in_progress', 100);

    // 3. Modificación en Google Tasks
    mockTasksAdapter.mockTasks = [
      {
        source: 'google_tasks',
        sourceId: 'task-move-1',
        title: 'Título Actualizado en Google',
        description: 'Notas actualizadas',
      },
    ];

    const syncResult = await syncService.syncUser(userId, 'token');
    expect(syncResult.updated).toBe(1);

    // 4. Verificar que sigue en "En progreso" y con el contenido nuevo
    const boardAfter = await kanbanService.getBoard(userId);
    const inProgressCol = boardAfter.columns.find((c) => c.id === 'in_progress');
    const todoCol = boardAfter.columns.find((c) => c.id === 'todo');

    expect(todoCol?.items.length).toBe(0);
    expect(inProgressCol?.items.length).toBe(1);
    expect(inProgressCol?.items[0].title).toBe('Título Actualizado en Google');
    expect(inProgressCol?.items[0].description).toBe('Notas actualizadas');
    expect(inProgressCol?.items[0].status).toBe('in_progress');
  });

  it('3. ELIMINACIÓN: Si una tarea desaparece de Google, se elimina del Kanban sin importar la columna', async () => {
    // 1. Crear tarea y moverla a "En revisión"
    mockTasksAdapter.mockTasks = [
      {
        source: 'google_tasks',
        sourceId: 'task-delete-1',
        title: 'Tarea a ser borrada',
      },
    ];
    await syncService.syncUser(userId, 'token');
    const board = await kanbanService.getBoard(userId);
    const cardId = board.columns[0].items[0].id;
    await kanbanService.moveItem(userId, cardId, 'review', 50);

    // 2. La tarea se elimina en Google (lista vacía)
    mockTasksAdapter.mockTasks = [];

    const syncResult = await syncService.syncUser(userId, 'token');
    expect(syncResult.removed).toBe(1);

    // 3. Verificar que no queda como tarea huérfana en ninguna columna
    const boardAfter = await kanbanService.getBoard(userId);
    for (const col of boardAfter.columns) {
      expect(col.items.length).toBe(0);
    }
  });

  it('4. DUPLICADOS E IDEMPOTENCIA: Sincronizaciones sucesivas no generan duplicados', async () => {
    mockTasksAdapter.mockTasks = [
      {
        source: 'google_tasks',
        sourceId: 'task-idem-1',
        title: 'Tarea Unitaria',
      },
    ];

    // Sincronizar 1 vez
    const sync1 = await syncService.syncUser(userId, 'token');
    expect(sync1.added).toBe(1);

    // Sincronizar 2da vez idéntica
    const sync2 = await syncService.syncUser(userId, 'token');
    expect(sync2.added).toBe(0);
    expect(sync2.updated).toBe(0);
    expect(sync2.removed).toBe(0);

    // Sincronizar 3ra vez
    const sync3 = await syncService.syncUser(userId, 'token');
    expect(sync3.added).toBe(0);

    const items = await repository.getItems(userId);
    expect(items.length).toBe(1);
  });

  it('5. MOVIMIENTO ENTRE COLUMNAS: Permite mover libremente y registra auditoría de movimiento', async () => {
    mockTasksAdapter.mockTasks = [
      {
        source: 'google_tasks',
        sourceId: 'task-flow-1',
        title: 'Tarea de flujo',
      },
    ];
    await syncService.syncUser(userId, 'token');
    const board1 = await kanbanService.getBoard(userId);
    const cardId = board1.columns[0].items[0].id;

    // Todo -> In Progress
    await kanbanService.moveItem(userId, cardId, 'in_progress', 10);
    // In Progress -> Review
    await kanbanService.moveItem(userId, cardId, 'review', 20);
    // Review -> Done
    await kanbanService.moveItem(userId, cardId, 'done', 30);

    const boardFinal = await kanbanService.getBoard(userId);
    const doneCol = boardFinal.columns.find((c) => c.id === 'done');
    expect(doneCol?.items.length).toBe(1);
    expect(doneCol?.items[0].status).toBe('done');

    const movements = repository.getMovements();
    expect(movements.length).toBe(3);
    expect(movements[0].from).toBe('todo');
    expect(movements[0].to).toBe('in_progress');
    expect(movements[2].to).toBe('done');
  });

  it('6. REGLA CONFIGURABLE: Al mover a "done", si completeInSourceOnDone está activo, marca en la fuente', async () => {
    // Activar opción configurable
    await repository.updateSettings(userId, { completeInSourceOnDone: true });

    mockTasksAdapter.mockTasks = [
      {
        source: 'google_tasks',
        sourceId: 'task-complete-remote',
        sourceListId: 'list-work',
        title: 'Finalizar reporte',
      },
    ];
    await syncService.syncUser(userId, 'token');
    const board = await kanbanService.getBoard(userId);
    const cardId = board.columns[0].items[0].id;

    await kanbanService.moveItem(userId, cardId, 'done', 10, 'token');

    // Verificar que el adaptador recibió la llamada a completeTask
    expect(mockTasksAdapter.completedTasks).toContain('task-complete-remote');
  });

  it('7. RECUPERACIÓN ANTE ERRORES: Mover tarjeta inexistente arroja error controlado', async () => {
    await expect(
      kanbanService.moveItem(userId, 'tarjeta-fantasma-999', 'done', 10)
    ).rejects.toThrow('no existe o fue eliminada de la fuente');
  });

  it('8. ROBUSTEZ: Falla de un adaptador registra el error sin romper la ejecución', async () => {
    mockTasksAdapter.fetchTasks = async () => {
      throw new Error('Timeout de red en Google Tasks');
    };

    const result = await syncService.syncUser(userId, 'token');
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0]).toContain('Timeout de red en Google Tasks');
  });
});
