import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { KanbanBoard } from './components/KanbanBoard';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { KanbanColumn, KanbanItem, KanbanStatus, User } from './types';
import { googleTasksDirect } from './services/googleTasksDirect';
import { Smartphone, CheckCircle, RefreshCw, ShieldCheck } from 'lucide-react';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | undefined>(undefined);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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

  // Sincronización periódica automática (cada 60 segundos)
  useEffect(() => {
    syncIntervalRef.current = window.setInterval(() => {
      if (!isSyncing) {
        loadBoard();
      }
    }, 60000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [isSyncing, loadBoard]);

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

  // Mover tarjeta entre listas de Google Tasks
  const handleMoveTask = async (
    task: KanbanItem,
    targetStatus: KanbanStatus,
    targetPosition: number
  ) => {
    await googleTasksDirect.moveTaskBetweenColumns(task, targetStatus, targetPosition);
    await loadBoard();
  };

  // Crear tarea rápida
  const handleAddTask = async (
    status: KanbanStatus,
    title: string,
    description?: string
  ) => {
    await googleTasksDirect.createTask(status, title, description);
    await loadBoard();
    addToast('success', `Tarea agregada a "${status}".`);
  };

  // Eliminar tarea en Google Tasks
  const handleDeleteTask = async (task: KanbanItem) => {
    await googleTasksDirect.deleteTask(task);
    await loadBoard();
    addToast('info', `Tarea "${task.title}" eliminada de Google Tasks.`);
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

              <div className="flex items-center gap-2 text-xs text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-2xs self-start sm:self-auto">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  <strong className="text-slate-800">{totalCount}</strong> tareas sincronizadas
                </span>
              </div>
            </div>

            <div className="flex-1">
              <KanbanBoard
                initialColumns={columns}
                onNotify={addToast}
                onMoveTask={handleMoveTask}
                onAddTask={handleAddTask}
                onDeleteTask={handleDeleteTask}
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
