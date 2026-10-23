import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Header } from './components/Header';
import { KanbanBoard } from './components/KanbanBoard';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { googleTasksDirect } from './services/googleTasksDirect';
import { RefreshCw, ShieldCheck, Download, Search, X } from 'lucide-react';

import { useKanban } from './hooks/useKanban';
import { useGoogleTasksSync } from './hooks/useGoogleTasksSync';
import { useDarkMode } from './hooks/useDarkMode';
import { useTranslation, Trans } from 'react-i18next';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [autoSyncInterval, setAutoSyncInterval] = useState<number>(
    () => googleTasksDirect.getSettings().autoSyncInterval || 60
  );

  const addToast = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const {
    loading,
    totalCount,
    lastSyncedAt,
    isSyncing,
    isImporting,
    filteredColumns,
    searchMatchingCount,
    loadBoard,
    handleManualSync,
    handleMoveTask,
    handleAddTask,
    handleDeleteTask,
    handleToggleSubtask,
    handleAddSubtask,
    handleDeleteSubtask,
    handleUpdateSubtask,
    handleUpdateTask,
    handleNestTask,
    handlePromoteSubtask,
    handleMoveSubtask,
    handleImportFromMyTasks,
  } = useKanban(addToast, searchQuery, autoSyncInterval);

  const {
    user,
    isSessionPaused,
    handleLoginGoogle,
    handleRenewSession,
    handleLogout
  } = useGoogleTasksSync(addToast, loadBoard);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col font-sans transition-colors duration-300">
      <Header
        user={user}
        lastSyncedAt={lastSyncedAt}
        isSyncing={isSyncing}
        isSessionPaused={isSessionPaused}
        onSync={handleManualSync}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLoginGoogle={handleLoginGoogle}
        onLogout={handleLogout}
        onRenewSession={handleRenewSession}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
      />

      {/* Área del Tablero */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3 py-24">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium">{t('board.syncingLists')}</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {t('board.title')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('board.subtitle')}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                {/* Buscador reactivo de tareas y subtareas */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder={t('board.filterPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setSearchQuery('');
                    }}
                    className="pl-8 pr-7 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 w-36 sm:w-48 text-slate-700 dark:text-slate-200 shadow-2xs placeholder-slate-400 dark:placeholder-slate-500"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                    title={t('board.importMyTasks')}
                  >
                    <Download className={`w-3.5 h-3.5 ${isImporting ? 'animate-bounce' : ''}`} />
                    <span>{isImporting ? t('board.importing') : t('board.importMyTasks')}</span>
                  </button>
                )}

                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-2xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {searchQuery.trim() ? (
                      <Trans i18nKey="board.tasksMatching" values={{ matching: searchMatchingCount, total: totalCount }}>
                        <strong className="text-slate-800 dark:text-white">{'{{matching}}'}</strong> of {'{{total}}'} tasks
                      </Trans>
                    ) : (
                      <>{t('board.tasksSynced', { count: totalCount })}</>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Banner de búsqueda sin coincidencias */}
            {searchQuery.trim() && searchMatchingCount === 0 && (
              <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between text-xs animate-in fade-in">
                <span>
                  <Trans i18nKey="board.noMatchFound" values={{ query: searchQuery }}>
                    No tasks found matching "<strong>{'{{query}}'}</strong>".
                  </Trans>
                </span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="font-semibold text-amber-800 underline hover:text-amber-950 cursor-pointer"
                >
                  {t('board.clearFilter')}
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
                onUpdateSubtask={handleUpdateSubtask}
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
        onSettingsSaved={() => {
          setAutoSyncInterval(googleTasksDirect.getSettings().autoSyncInterval || 60);
          loadBoard();
        }}
      />

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};
