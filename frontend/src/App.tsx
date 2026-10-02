import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { KanbanBoard } from './components/KanbanBoard';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { KanbanColumn, KanbanItem, KanbanStatus, User } from './types';
import { googleTasksDirect } from './services/googleTasksDirect';
import { Sparkles, Smartphone, CheckCircle, RefreshCw, Key, ShieldCheck, ArrowRight } from 'lucide-react';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | undefined>(undefined);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showConfigPrompt, setShowConfigPrompt] = useState(false);
  const [clientIdInput, setClientIdInput] = useState(
    localStorage.getItem('kanban_google_client_id') || ''
  );

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

  // Conectar con Google OAuth real
  const handleLoginGoogle = async () => {
    const savedClientId = localStorage.getItem('kanban_google_client_id');
    if (!savedClientId) {
      setShowConfigPrompt(true);
      return;
    }

    try {
      const token = await googleTasksDirect.requestGoogleToken(savedClientId);
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
      addToast('success', '¡Conectado exitosamente con tu Google Tasks real!');
      await loadBoard();
    } catch (err: any) {
      addToast('error', err.message || 'Error al conectar con Google.');
    }
  };

  const handleSaveClientIdAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientIdInput.trim()) return;

    localStorage.setItem('kanban_google_client_id', clientIdInput.trim());
    setShowConfigPrompt(false);
    handleLoginGoogle();
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
                onClick={() => setShowConfigPrompt(true)}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-3 py-1 rounded-lg text-[11px] transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Key className="w-3 h-3" /> Conectar mi cuenta de Google
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-white/10 px-2 py-0.5 rounded">
                <CheckCircle className="w-3 h-3" /> Nube de Google Conectada
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

      {/* Modal de Conexión Google Client ID */}
      {showConfigPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <Key className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">Conectar con Google Tasks</h3>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Ingresa tu <strong>Google Client ID</strong> de Google Cloud Console para conectar tus tareas reales. Se guarda únicamente en tu navegador de forma 100% segura.
            </p>

            <form onSubmit={handleSaveClientIdAndConnect} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  OAuth Client ID de Google
                </label>
                <input
                  type="text"
                  placeholder="ej: xxxxx.apps.googleusercontent.com"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed">
                ℹ️ ¿No tienes una clave ahora? Puedes continuar navegando en el <strong>Modo Demo interactivo</strong> con todas las funciones de drag & drop y sincronización activas.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfigPrompt(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer shadow-sm"
                >
                  <span>Guardar y Conectar</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
