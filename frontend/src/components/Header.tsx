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

          {/* Perfil de Usuario */}
          {user ? (
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

              {user.isDemo && (
                <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded">
                  Demo
                </span>
              )}

              <button
                onClick={onLogout}
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onLoginGoogle}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition-all active:scale-95 cursor-pointer"
            >
              Conectar Google
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
