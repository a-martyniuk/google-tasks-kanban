import React, { useState } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Calendar, CheckCheck, ChevronDown, ChevronUp, Trash2, CheckSquare, Plus } from 'lucide-react';
import { KanbanItem, SubTaskItem } from '../types';

interface KanbanCardProps {
  item: KanbanItem;
  index: number;
  onDelete?: () => void;
  onToggleSubtask?: (task: KanbanItem, subtask: SubTaskItem) => void;
  onAddSubtask?: (task: KanbanItem, title: string) => Promise<void>;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  item,
  index,
  onDelete,
  onToggleSubtask,
  onAddSubtask,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);

  const formatDueDate = (dateString?: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDateClean = new Date(date);
    dueDateClean.setHours(0, 0, 0, 0);

    const isOverdue = dueDateClean < today;
    const isToday = dueDateClean.getTime() === today.getTime();

    const formatted = date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    });

    return { formatted, isOverdue, isToday };
  };

  const due = formatDueDate(item.dueDate);

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`group bg-white rounded-xl p-4 mb-3 border transition-all duration-150 select-none ${
            snapshot.isDragging
              ? 'border-blue-500 shadow-xl ring-2 ring-blue-500/20 scale-[1.02] cursor-grabbing rotate-1'
              : 'border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-sm cursor-grab'
          }`}
        >
          {/* Header de la tarjeta */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                G Tasks
              </span>

              {item.sourceListName && (
                <span className="text-[11px] text-slate-500 font-medium truncate max-w-[130px]" title={item.sourceListName}>
                  • {item.sourceListName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                <CheckCheck className="w-3 h-3 text-slate-400" />
                sincronizado
              </span>
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`¿Eliminar la tarea "${item.title}" en Google Tasks?`)) {
                      onDelete();
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-600 rounded transition-opacity cursor-pointer"
                  title="Eliminar en Google Tasks"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Título */}
          <h4 className="text-sm font-semibold text-slate-900 leading-snug group-hover:text-blue-600 transition-colors">
            {item.title}
          </h4>

          {/* Descripción / Notas */}
          {item.description && (
            <div className="mt-2 text-xs text-slate-600">
              <p className={expanded ? 'whitespace-pre-line' : 'line-clamp-2'}>
                {item.description}
              </p>
              {item.description.length > 90 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(!expanded);
                  }}
                  className="mt-1 text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5 cursor-pointer"
                >
                  {expanded ? (
                    <>
                      Ver menos <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      Ver más <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Subtareas / Checklist */}
          {item.subtasks && item.subtasks.length > 0 ? (
            <div className="mt-3 pt-2.5 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 font-medium">
                <span className="flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                  Subtareas ({item.subtasks.filter((s) => s.status === 'completed').length}/{item.subtasks.length})
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {Math.round(
                    (item.subtasks.filter((s) => s.status === 'completed').length /
                      item.subtasks.length) *
                      100
                  )}%
                </span>
              </div>

              {/* Barra de progreso */}
              <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      (item.subtasks.filter((s) => s.status === 'completed').length /
                        item.subtasks.length) *
                      100
                    }%`,
                  }}
                />
              </div>

              {/* Lista de subtareas */}
              <div className="space-y-1">
                {item.subtasks.map((sub) => {
                  const isDone = sub.status === 'completed';
                  return (
                    <div
                      key={sub.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onToggleSubtask) {
                          onToggleSubtask(item, sub);
                        }
                      }}
                      className="flex items-start gap-2 text-xs p-1 rounded hover:bg-slate-50 cursor-pointer transition-colors group/sub"
                    >
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => {}}
                        className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none"
                      />
                      <span
                        className={`leading-snug transition-all ${
                          isDone
                            ? 'line-through text-slate-400'
                            : 'text-slate-700 group-hover/sub:text-slate-900'
                        }`}
                      >
                        {sub.title}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Botón o Formulario para añadir subtarea */}
              {onAddSubtask && (
                <div className="mt-2 pt-1">
                  {showAddSubtask ? (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!newSubtaskTitle.trim()) return;
                        setIsAddingSubtask(true);
                        try {
                          await onAddSubtask(item, newSubtaskTitle.trim());
                          setNewSubtaskTitle('');
                          setShowAddSubtask(false);
                        } finally {
                          setIsAddingSubtask(false);
                        }
                      }}
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        placeholder="Nueva subtarea..."
                        autoFocus
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        className="flex-1 text-xs px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="submit"
                        disabled={isAddingSubtask || !newSubtaskTitle.trim()}
                        className="px-2 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                      >
                        {isAddingSubtask ? '...' : 'Añadir'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddSubtask(false)}
                        className="p-1 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAddSubtask(true);
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Agregar subtarea</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            onAddSubtask && (
              <div className="mt-2 pt-1 border-t border-slate-50">
                {showAddSubtask ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newSubtaskTitle.trim()) return;
                      setIsAddingSubtask(true);
                      try {
                        await onAddSubtask(item, newSubtaskTitle.trim());
                        setNewSubtaskTitle('');
                        setShowAddSubtask(false);
                      } finally {
                        setIsAddingSubtask(false);
                      }
                    }}
                    className="flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      placeholder="Nueva subtarea..."
                      autoFocus
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      className="flex-1 text-xs px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={isAddingSubtask || !newSubtaskTitle.trim()}
                      className="px-2 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                    >
                      {isAddingSubtask ? '...' : 'Añadir'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddSubtask(false)}
                      className="p-1 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAddSubtask(true);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[11px] text-slate-500 hover:text-blue-600 font-medium inline-flex items-center gap-1 transition-opacity cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Subtarea</span>
                  </button>
                )}
              </div>
            )
          )}

          {/* Footer de la tarjeta: Vencimiento y metadatos */}
          {due && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
              <div
                className={`inline-flex items-center gap-1 font-medium ${
                  due.isOverdue
                    ? 'text-rose-600 font-semibold'
                    : due.isToday
                    ? 'text-amber-600 font-semibold'
                    : 'text-slate-500'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {due.isToday ? 'Hoy' : due.formatted}
                  {due.isOverdue && ' (vencida)'}
                </span>
              </div>

              <span className="text-[10px] text-slate-400 font-mono">
                #{item.sourceId.slice(-4)}
              </span>
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
};
