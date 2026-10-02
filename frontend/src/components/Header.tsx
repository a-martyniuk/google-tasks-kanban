import React from 'react';
import { RefreshCw, Settings, LogOut, CheckCircle2, User as UserIcon } from 'lucide-react';
import { User } from '../types';

interface HeaderProps {
  user?: User;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  onSync: () => void;
  onOpenSettings: () => void;
  onLoginGoogle: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  lastSyncedAt,
  isSyncing,
  onSync,
  onOpenSettings,
  onLoginGoogle,
  onLogout,
}) => {
  const formatLastSync = (dateString: string | null) => {
    if (!dateString) return 'Pendiente';
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Identidad / Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-sm shadow-blue-500/20">
            <span className="text-base tracking-tighter">KB</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight leading-tight">
              MI KANBAN
            </h1>
            <p className="text-xs text-slate-500 font-medium hidden sm:block">
              Google Tasks & Google Keep Sync Layer
            </p>
          </div>
        </div>

        {/* Acciones principales */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Indicador de última sincronización */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/80">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Último sync: {formatLastSync(lastSyncedAt)}</span>
          </div>

          {/* Botón Sincronizar Ahora */}
          <button
            onClick={onSync}
            disabled={isSyncing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border shadow-2xs cursor-pointer ${
              isSyncing
                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 hover:border-slate-400 active:scale-95'
            }`}
            title="Sincronizar tareas con Google Tasks y Keep"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : 'text-slate-600'}`}
            />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>

          {/* Botón Configuración */}
          <button
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="Configuración de cuentas y fuentes"
          >
            <Settings className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Configuración</span>
          </button>

          {/* Perfil de Usuario o Botón Vincular */}
          {user && !user.isDemo ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || 'Usuario'}
                  className="w-7 h-7 rounded-full border border-slate-200 object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}

              <div className="hidden lg:block text-left text-xs">
                <p className="font-semibold text-slate-800 leading-none">{user.name || 'Usuario'}</p>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">{user.email}</p>
              </div>

              <button
                onClick={onLogout}
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 rounded">
                Modo Demo
              </span>
              <button
                onClick={onLoginGoogle}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all active:scale-95 cursor-pointer"
                title="Conectar directamente con tu cuenta de Google Tasks"
              >
                <svg className="w-3.5 h-3.5 shrink-0 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Vincular con Gmail</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
