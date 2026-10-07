import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Header } from './components/Header';
import { KanbanBoard } from './components/KanbanBoard';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { KanbanColumn, KanbanItem, KanbanStatus, SubTaskItem, User } from './types';
import { googleTasksDirect } from './services/googleTasksDirect';
import { RefreshCw, ShieldCheck, Download, Search, X } from 'lucide-react';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | undefined>(undefined);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const syncIntervalRef = useRef<number | null>(null);

  const addToast = (type: 'success' | 'error' | 'info', text: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Cargar tablero desde el servicio directo de Google Tasks
  const loadBoard = useCallback(async () => {
    try {
      const data = await googleTasksDirect.fetchBoardTasks();
      setColumns(data.columns);
      setTotalCount(data.totalCount);
      setLastSyncedAt(data.lastSyncedAt);
    } catch (err: any) {
      console.error('Error cargando tareas:', err);
      addToast('error', `Error al cargar tablero: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Inicialización
  useEffect(() => {
    const initApp = async () => {
      const savedToken = sessionStorage.getItem('kanban_google_token');
      if (savedToken) {
        googleTasksDirect.setAccessToken(savedToken);
        const profile = await googleTasksDirect.fetchUserProfile();
        if (profile) {
          setUser({
            userId: 'google-user',
            email: profile.email,
            name: profile.name,
            avatarUrl: profile.picture,
            isDemo: false,
          });
        }
      } else {
        // Modo Demo para portfolio
        googleTasksDirect.setMockMode(true);
        setUser({
          userId: 'demo-user',
          email: 'demo@kanban.local',
          name: 'Alexis (Portfolio Demo)',
          avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=AlexisPortfolio',
          isDemo: true,
        });
      }

      await loadBoard();
    };

    initApp();
  }, [loadBoard]);

  // Sincronización periódica automática configurable
  useEffect(() => {
    const settings = googleTasksDirect.getSettings();
    const intervalMs = (settings.autoSyncInterval || 60) * 1000;

    syncIntervalRef.current = window.setInterval(() => {
      if (!isSyncing) {
        loadBoard();
      }
    }, intervalMs);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [isSyncing, loadBoard]);

  const normalizeText = (text: string): string => {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  };

  // Filtrado reactivo de tarjetas por búsqueda (insensible a mayúsculas y acentos)
  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return columns;
    const q = normalizeText(searchQuery);
    return columns.map((col) => ({
      ...col,
      items: col.items.filter(
        (item) =>
          normalizeText(item.title).includes(q) ||
          (item.description && normalizeText(item.description).includes(q)) ||
          (item.subtasks && item.subtasks.some((s) => normalizeText(s.title).includes(q)))
      ),
    }));
  }, [columns, searchQuery]);

  const searchMatchingCount = useMemo(() => {
    return filteredColumns.reduce((acc, col) => acc + col.items.length, 0);
  }, [filteredColumns]);

  // Sincronizar manualmente
  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await loadBoard();
      addToast('success', 'Tablero sincronizado en vivo con Google Tasks.');
    } catch (err: any) {
      addToast('error', `Error en sincronización: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Mover tarjeta entre listas de Google Tasks (optimista sin flicker)
  const handleMoveTask = async (
    task: KanbanItem,
    targetStatus: KanbanStatus,
    targetPosition: number
  ) => {
    try {
      const updated = await googleTasksDirect.moveTaskBetweenColumns(
        task,
        targetStatus,
        targetPosition
      );
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id === task.status) {
            return {
              ...col,
              items: col.items.filter((i) => i.id !== task.id && i.id !== updated.id),
            };
          }
          if (col.id === targetStatus) {
            const itemsWithout = col.items.filter(
              (i) => i.id !== task.id && i.id !== updated.id
            );
            return {
              ...col,
              items: [...itemsWithout, updated].sort((a, b) => a.position - b.position),
            };
          }
          return col;
        })
      );
    } catch (err: any) {
      console.error('Error al mover tarea:', err);
      addToast('error', `Error al mover tarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Crear tarea rápida con soporte de fecha de vencimiento (optimista)
  const handleAddTask = async (
    status: KanbanStatus,
    title: string,
    description?: string,
    dueDate?: string | null
  ) => {
    try {
      const created = await googleTasksDirect.createTask(status, title, description, dueDate);
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id !== status) return col;
          return {
            ...col,
            items: [...col.items, created],
          };
        })
      );
      setTotalCount((prev) => prev + 1);
      addToast('success', `Tarea agregada a "${status}".`);
    } catch (err: any) {
      addToast('error', `Error creando tarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Eliminar tarea en Google Tasks (optimista)
  const handleDeleteTask = async (task: KanbanItem) => {
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        items: col.items.filter((i) => i.id !== task.id),
      }))
    );
    setTotalCount((c) => Math.max(0, c - 1));

    try {
      await googleTasksDirect.deleteTask(task);
      addToast('info', `Tarea "${task.title}" eliminada de Google Tasks.`);
    } catch (err: any) {
      addToast('error', `Error al eliminar tarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Eliminar subtarea individual en Google Tasks
  const handleDeleteSubtask = async (task: KanbanItem, subtask: SubTaskItem) => {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== task.status) return col;
        return {
          ...col,
          items: col.items.map((item) => {
            if (item.id !== task.id) return item;
            return {
              ...item,
              subtasks: (item.subtasks || []).filter((s) => s.id !== subtask.id),
            };
          }),
        };
      })
    );

    try {
      const listId = task.sourceListId || 'mock';
      await googleTasksDirect.deleteSubtask(listId, subtask.id);
      addToast('info', `Subtarea "${subtask.title}" eliminada.`);
    } catch (err: any) {
      addToast('error', `Error al eliminar subtarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Actualizar datos de tarjeta (título, notas, vencimiento)
  const handleUpdateTask = async (
    task: KanbanItem,
    updates: { title?: string; description?: string | null; dueDate?: string | null }
  ) => {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== task.status) return col;
        return {
          ...col,
          items: col.items.map((item) => {
            if (item.id !== task.id) return item;
            return {
              ...item,
              ...(updates.title !== undefined ? { title: updates.title } : {}),
              ...(updates.description !== undefined ? { description: updates.description } : {}),
              ...(updates.dueDate !== undefined ? { dueDate: updates.dueDate } : {}),
            };
          }),
        };
      })
    );

    try {
      await googleTasksDirect.updateTask(task, updates);
      addToast('success', `Tarea "${updates.title || task.title}" actualizada.`);
    } catch (err: any) {
      addToast('error', `Error al actualizar tarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Marcar / Desmarcar subtarea (optimista)
  const handleToggleSubtask = async (task: KanbanItem, subtask: SubTaskItem) => {
    const newStatus = subtask.status === 'completed' ? 'needsAction' : 'completed';

    // Actualización optimista inmediata
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== task.status) return col;
        return {
          ...col,
          items: col.items.map((item) => {
            if (item.id !== task.id) return item;
            return {
              ...item,
              subtasks: (item.subtasks || []).map((sub) => {
                if (sub.id !== subtask.id) return sub;
                return { ...sub, status: newStatus };
              }),
            };
          }),
        };
      })
    );

    try {
      const listId = task.sourceListId || 'mock';
      await googleTasksDirect.toggleSubtask(listId, subtask.id, newStatus === 'completed');
    } catch (err: any) {
      addToast('error', `Error al actualizar subtarea: ${err.message}`);
      loadBoard();
    }
  };

  // Añadir subtarea directamente a una tarjeta en Google Tasks
  const handleAddSubtask = async (task: KanbanItem, title: string) => {
    const tempId = `temp-sub-${Date.now()}`;
    const optimisticSub: SubTaskItem = {
      id: tempId,
      title,
      status: 'needsAction',
    };

    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== task.status) return col;
        return {
          ...col,
          items: col.items.map((item) => {
            if (item.id !== task.id) return item;
            return {
              ...item,
              subtasks: [...(item.subtasks || []), optimisticSub],
            };
          }),
        };
      })
    );

    try {
      const created = await googleTasksDirect.createSubtask(task, title);
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id !== task.status) return col;
          return {
            ...col,
            items: col.items.map((item) => {
              if (item.id !== task.id) return item;
              return {
                ...item,
                subtasks: (item.subtasks || []).map((s) => (s.id === tempId ? created : s)),
              };
            }),
          };
        })
      );
      addToast('success', `Subtarea "${title}" agregada en Google Tasks.`);
    } catch (err: any) {
      addToast('error', `Error al crear subtarea: ${err.message}`);
      loadBoard();
    }
  };

  // Convertir una tarea en subtarea de otra (sus subtareas pasan a ser hermanas)
  const handleNestTask = async (task: KanbanItem, parent: KanbanItem) => {
    try {
      const newSubs = await googleTasksDirect.nestTaskUnder(task, parent);
      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          items: col.items
            .filter((i) => i.id !== task.id)
            .map((i) =>
              i.id === parent.id ? { ...i, subtasks: [...(i.subtasks || []), ...newSubs] } : i
            ),
        }))
      );
      setTotalCount((c) => Math.max(0, c - 1));
      const extra = newSubs.length > 1 ? ` (+${newSubs.length - 1} subtareas)` : '';
      addToast('success', `"${task.title}" ahora es subtarea de "${parent.title}"${extra}.`);
    } catch (err: any) {
      addToast('error', `Error al anidar tarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Convertir una subtarea en tarea principal de una columna
  const handlePromoteSubtask = async (
    subtask: SubTaskItem,
    parent: KanbanItem,
    targetStatus: KanbanStatus
  ) => {
    try {
      const created = await googleTasksDirect.promoteSubtask(subtask, parent, targetStatus);
      setColumns((prev) =>
        prev.map((col) => {
          const items = col.items.map((i) =>
            i.id === parent.id
              ? { ...i, subtasks: (i.subtasks || []).filter((s) => s.id !== subtask.id) }
              : i
          );
          if (col.id !== targetStatus) return { ...col, items };
          const minPos = items.reduce((m, i) => Math.min(m, i.position), Infinity);
          const withPos = { ...created, position: Number.isFinite(minPos) ? minPos - 1000 : 0 };
          return { ...col, items: [withPos, ...items.filter((i) => i.id !== created.id)] };
        })
      );
      setTotalCount((c) => c + 1);
      addToast('success', `"${subtask.title}" ahora es una tarea.`);
    } catch (err: any) {
      addToast('error', `Error al convertir subtarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Mover una subtarea a otra tarjeta o reordenarla dentro de la misma
  const handleMoveSubtask = async (
    subtask: SubTaskItem,
    fromParent: KanbanItem,
    toParent: KanbanItem,
    previousId: string | null,
    targetIndex: number
  ) => {
    try {
      const moved = await googleTasksDirect.moveSubtaskToParent(
        subtask,
        fromParent,
        toParent,
        previousId
      );
      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          items: col.items.map((i) => {
            if (i.id !== fromParent.id && i.id !== toParent.id) return i;
            let subs = (i.subtasks || []).filter((s) => s.id !== subtask.id && s.id !== moved.id);
            if (i.id === toParent.id) {
              subs = [...subs];
              subs.splice(Math.min(targetIndex, subs.length), 0, moved);
            }
            return { ...i, subtasks: subs };
          }),
        }))
      );
      if (fromParent.id !== toParent.id) {
        addToast('success', `Subtarea "${subtask.title}" movida a "${toParent.title}".`);
      }
    } catch (err: any) {
      addToast('error', `Error al mover subtarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Importar tareas de la lista por defecto ("My Tasks")
  const handleImportFromMyTasks = async () => {
    if (isImporting) return;
    setIsImporting(true);
    try {
      addToast('info', 'Consultando y migrando tareas desde "My Tasks"...');
      const count = await googleTasksDirect.importTasksFromDefaultList();
      if (count > 0) {
        addToast('success', `¡Se importaron ${count} tareas/subtareas a "Para hacer"!`);
        await loadBoard();
      } else {
        addToast('info', 'No se encontraron tareas pendientes en tu lista "My Tasks".');
      }
    } catch (err: any) {
      addToast('error', `Error importando tareas: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Conectar con Google OAuth real (1 solo clic)
  const handleLoginGoogle = async () => {
    try {
      const token = await googleTasksDirect.requestGoogleToken();
      sessionStorage.setItem('kanban_google_token', token);
      const profile = await googleTasksDirect.fetchUserProfile();
      if (profile) {
        setUser({
          userId: 'google-user',
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.picture,
          isDemo: false,
        });
      }
      addToast('success', '¡Conectado exitosamente con tu cuenta de Google!');
      await loadBoard();
    } catch (err: any) {
      addToast('error', err.message || 'Error al conectar con Google.');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('kanban_google_token');
    googleTasksDirect.setAccessToken('');
    googleTasksDirect.setMockMode(true);
    setUser({
      userId: 'demo-user',
      email: 'demo@kanban.local',
      name: 'Alexis (Portfolio Demo)',
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=AlexisPortfolio',
      isDemo: true,
    });
    loadBoard();
    addToast('info', 'Sesión cerrada. Regresando a modo Demo.');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header
        user={user}
        lastSyncedAt={lastSyncedAt}
        isSyncing={isSyncing}
        onSync={handleManualSync}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLoginGoogle={handleLoginGoogle}
        onLogout={handleLogout}
      />

      {/* Área del Tablero */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3 py-24">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium">Sincronizando listas de Google Tasks...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Flujo Kanban en Vivo
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Las 4 listas de Google Tasks sincronizadas bidireccionalmente con tu móvil.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                {/* Buscador reactivo de tareas y subtareas */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filtrar tareas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setSearchQuery('');
                    }}
                    className="pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-36 sm:w-48 text-slate-700 shadow-2xs"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {user && !user.isDemo && (
                  <button
                    onClick={handleImportFromMyTasks}
                    disabled={isImporting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                    title="Importar tareas y subtareas existentes de tu lista por defecto 'My Tasks' a la columna 'Para hacer'"
                  >
                    <Download className={`w-3.5 h-3.5 ${isImporting ? 'animate-bounce' : ''}`} />
                    <span>{isImporting ? 'Importando...' : 'Importar de "My Tasks"'}</span>
                  </button>
                )}

                <div className="flex items-center gap-2 text-xs text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    {searchQuery.trim() ? (
                      <>
                        <strong className="text-slate-800">{searchMatchingCount}</strong> de {totalCount} tareas
                      </>
                    ) : (
                      <>
                        <strong className="text-slate-800">{totalCount}</strong> tareas sincronizadas
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Banner de búsqueda sin coincidencias */}
            {searchQuery.trim() && searchMatchingCount === 0 && (
              <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between text-xs animate-in fade-in">
                <span>
                  No se encontraron tareas ni subtareas que coincidan con "<strong>{searchQuery}</strong>".
                </span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="font-semibold text-amber-800 underline hover:text-amber-950 cursor-pointer"
                >
                  Limpiar filtro
                </button>
              </div>
            )}

            <div className="flex-1">
              <KanbanBoard
                initialColumns={filteredColumns}
                onNotify={addToast}
                onMoveTask={handleMoveTask}
                onAddTask={handleAddTask}
                onDeleteTask={handleDeleteTask}
                onToggleSubtask={handleToggleSubtask}
                onAddSubtask={handleAddSubtask}
                onDeleteSubtask={handleDeleteSubtask}
                onUpdateTask={handleUpdateTask}
                onNestTask={handleNestTask}
                onPromoteSubtask={handlePromoteSubtask}
                onMoveSubtask={handleMoveSubtask}
              />
            </div>
          </div>
        )}
      </main>



      {/* Modal de Configuración & Fuentes */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onNotify={addToast}
        onSettingsSaved={loadBoard}
      />

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};
