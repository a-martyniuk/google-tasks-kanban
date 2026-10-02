import React, { useState } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Calendar, CheckCheck, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { KanbanItem } from '../types';

interface KanbanCardProps {
  item: KanbanItem;
  index: number;
  onDelete?: () => void;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({ item, index, onDelete }) => {
  const [expanded, setExpanded] = useState(false);

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
              {item.source === 'google_tasks' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  G Tasks
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  G Keep
                </span>
              )}

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
