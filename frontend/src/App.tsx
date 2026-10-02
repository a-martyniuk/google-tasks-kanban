import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Header } from './components/Header';
import { KanbanBoard } from './components/KanbanBoard';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { KanbanColumn, KanbanItem, KanbanStatus, SubTaskItem, User } from './types';
import { googleTasksDirect } from './services/googleTasksDirect';
import { Smartphone, CheckCircle, RefreshCw, ShieldCheck, Download, Search, X } from 'lucide-react';

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

  // Filtrado reactivo de tarjetas por búsqueda
  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return columns;
    const q = searchQuery.toLowerCase().trim();
    return columns.map((col) => ({
      ...col,
      items: col.items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          (item.subtasks && item.subtasks.some((s) => s.title.toLowerCase().includes(q)))
      ),
    }));
  }, [columns, searchQuery]);

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

      {/* Banner Informativo Multi-dispositivo */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white px-4 py-2.5 text-xs shadow-xs">
        <div className="max-w-7xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Arquitectura Zero-DB Multi-dispositivo:</strong> Cada columna corresponde a una lista en Google Tasks. Mover una tarjeta la mueve en tu celular y en la nube.
            </span>
          </div>

          <div className="flex items-center gap-2">
            {user?.isDemo ? (
              <button
                onClick={handleLoginGoogle}
                className="bg-white hover:bg-slate-100 text-slate-900 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Vincular con tu Gmail</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-white/10 px-2 py-0.5 rounded">
                <CheckCircle className="w-3 h-3" /> Nube de Google Conectada ({user?.email})
              </span>
            )}
          </div>
        </div>
      </div>

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
                    <strong className="text-slate-800">{totalCount}</strong> tareas sincronizadas
                  </span>
                </div>
              </div>
            </div>

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
