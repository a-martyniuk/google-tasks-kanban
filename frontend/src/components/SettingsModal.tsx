import React, { useState, useEffect } from 'react';
import { X, Check, ListFilter, Sliders, RefreshCw } from 'lucide-react';
import { TaskList } from '../types';
import { googleTasksDirect } from '../services/googleTasksDirect';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
  onSettingsSaved: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onNotify,
  onSettingsSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'behavior'>('tasks');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Datos
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [completeInSourceOnDone, setCompleteInSourceOnDone] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState(60);

  useEffect(() => {
    if (isOpen) {
      loadSettingsData();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  const loadSettingsData = async () => {
    setLoading(true);
    try {
      const [lists, settings] = await Promise.all([
        googleTasksDirect.fetchTaskLists(),
        Promise.resolve(googleTasksDirect.getSettings()),
      ]);

      setTaskLists(lists);
      setSelectedLists(settings.selectedTaskLists || []);
      setCompleteInSourceOnDone(settings.completeInSourceOnDone);
      setAutoSyncInterval(settings.autoSyncInterval || 60);
    } catch (err: any) {
      onNotify('error', `Error al cargar configuración: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleList = (listId: string) => {
    setSelectedLists((prev) =>
      prev.includes(listId) ? prev.filter((id) => id !== listId) : [...prev, listId]
    );
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      googleTasksDirect.saveSettings({
        selectedTaskLists: selectedLists,
        completeInSourceOnDone,
        autoSyncInterval,
      });
      onNotify('success', 'Configuración guardada correctamente.');
      onSettingsSaved();
      onClose();
    } catch (err: any) {
      onNotify('error', `Error al guardar cambios: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };


  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-slate-700" />
            <h2 className="text-lg font-bold text-slate-900">Configuración de Fuentes y Tablero</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 gap-2">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'tasks'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Google Tasks
          </button>

          <button
            onClick={() => setActiveTab('behavior')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'behavior'
                ? 'border-slate-800 text-slate-800'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Comportamiento & Sincronización
          </button>
        </div>

        {/* Contenido Modal */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
              <span>Cargando configuración...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: GOOGLE TASKS */}
              {activeTab === 'tasks' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                      <div>
                        <h4 className="text-xs font-bold text-blue-950">Conexión con Google Tasks Activa</h4>
                        <p className="text-[11px] text-blue-800/80">API oficial v1 conectada vía OAuth 2.0</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-blue-700 bg-white/80 px-2 py-0.5 rounded border border-blue-200">
                      Sincronizado
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <ListFilter className="w-3.5 h-3.5 text-slate-500" />
                        Listas Adicionales a Sincronizar
                      </label>
                      <span className="text-[11px] text-slate-500">
                        {selectedLists.length === 0
                          ? 'Ninguna seleccionada'
                          : `${selectedLists.length} seleccionada(s)`}
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto bg-slate-50/30">
                      {taskLists.filter((l) => !l.title.startsWith('[KB] ')).length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">
                          No tienes otras listas personales en Google Tasks.
                        </div>
                      ) : (
                        taskLists
                          .filter((l) => !l.title.startsWith('[KB] '))
                          .map((list) => {
                            const isChecked = selectedLists.includes(list.id);
                            return (
                              <label
                                key={list.id}
                                className="flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer transition-colors"
                              >
                                <span className="text-sm font-medium text-slate-800">{list.title}</span>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleList(list.id)}
                                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                                />
                              </label>
                            );
                          })
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Las tareas de estas listas entrarán automáticamente en la columna{' '}
                      <span className="font-semibold text-slate-700">"Para hacer"</span>.
                    </p>
                  </div>
                </div>
              )}



              {/* TAB 3: COMPORTAMIENTO & SYNC */}
              {activeTab === 'behavior' && (
                <div className="space-y-6">
                  {/* Opción configurable de 'Terminado' */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={completeInSourceOnDone}
                        onChange={(e) => setCompleteInSourceOnDone(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                      />
                      <div>
                        <span className="text-sm font-semibold text-slate-800">
                          Al mover a "Terminado", marcar también como completada en Google Tasks
                        </span>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          Por defecto (desactivado), la tarea permanece activa en la fuente y solo se marca como completada visualmente en el Kanban. Si lo activas, el Kanban invocará la API de Google Tasks para marcar la tarea como realizada remotamente.
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Intervalo de sincronización automática */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                      Frecuencia de Sincronización Periódica
                    </label>
                    <select
                      value={autoSyncInterval}
                      onChange={(e) => setAutoSyncInterval(parseInt(e.target.value, 10))}
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    >
                      <option value={30}>Cada 30 segundos (Rápido)</option>
                      <option value={60}>Cada 1 minuto (Recomendado)</option>
                      <option value={120}>Cada 2 minutos</option>
                      <option value={300}>Cada 5 minutos</option>
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">
                      El tablero consulta automáticamente las novedades de Google en background.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
