import React, { useState } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { KanbanColumn as KanbanColumnType, KanbanItem, SubTaskItem } from '../types';
import { KanbanCard } from './KanbanCard';
import { Plus, X, Check } from 'lucide-react';

interface KanbanColumnProps {
  column: KanbanColumnType;
  onAddTask?: (status: KanbanColumnType['id'], title: string, description?: string, dueDate?: string | null) => Promise<void>;
  onDeleteTask?: (task: KanbanItem) => Promise<void>;
  onToggleSubtask?: (task: KanbanItem, subtask: SubTaskItem) => void;
  onAddSubtask?: (task: KanbanItem, title: string) => Promise<void>;
  onDeleteSubtask?: (task: KanbanItem, subtask: SubTaskItem) => void;
  onUpdateTask?: (task: KanbanItem, updates: { title?: string; description?: string | null; dueDate?: string | null }) => Promise<void>;
}

const COLUMN_THEMES: Record<
  string,
  { dot: string; badge: string; border: string; headerBg: string; buttonHover: string }
> = {
  todo: {
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-700',
    border: 'border-slate-200',
    headerBg: 'bg-slate-100/70',
    buttonHover: 'hover:bg-slate-200/60 text-slate-600',
  },
  in_progress: {
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700',
    border: 'border-blue-200',
    headerBg: 'bg-blue-50/50',
    buttonHover: 'hover:bg-blue-100/60 text-blue-600',
  },
  review: {
    dot: 'bg-purple-500',
    badge: 'bg-purple-50 text-purple-700',
    border: 'border-purple-200',
    headerBg: 'bg-purple-50/50',
    buttonHover: 'hover:bg-purple-100/60 text-purple-600',
  },
  done: {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700',
    border: 'border-emerald-200',
    headerBg: 'bg-emerald-50/50',
    buttonHover: 'hover:bg-emerald-100/60 text-emerald-600',
  },
};

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  onAddTask,
  onDeleteTask,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onUpdateTask,
}) => {
  const theme = COLUMN_THEMES[column.id] || COLUMN_THEMES.todo;
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !onAddTask) return;

    setIsSubmitting(true);
    try {
      const formattedDate = newDueDate ? `${newDueDate}T00:00:00.000Z` : null;
      await onAddTask(column.id, newTitle.trim(), newNotes.trim() || undefined, formattedDate);
      setNewTitle('');
      setNewNotes('');
      setNewDueDate('');
      setIsAdding(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col bg-slate-100/80 rounded-2xl p-3 border border-slate-200/70 shadow-2xs h-full min-w-[280px] max-w-[340px] flex-1">
      {/* Encabezado de Columna */}
      <div className="flex items-center justify-between px-2 py-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${theme.dot}`} />
          <h3 className="font-semibold text-slate-800 text-sm tracking-tight">
            {column.title}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${theme.badge}`}>
            {column.items.length}
          </span>
          {onAddTask && (
            <button
              onClick={() => setIsAdding(true)}
              className={`p-1 rounded-md transition-colors cursor-pointer ${theme.buttonHover}`}
              title={`Añadir tarea a ${column.title}`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Formulario rápido de creación */}
      {isAdding && (
        <form
          onSubmit={handleCreate}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsAdding(false);
              setNewTitle('');
              setNewNotes('');
              setNewDueDate('');
            }
          }}
          className="mb-3 bg-white p-3 rounded-xl border border-slate-300 shadow-xs space-y-2 animate-in fade-in"
        >
          <input
            type="text"
            placeholder="Título de la tarea..."
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-900"
          />
          <textarea
            placeholder="Notas u observaciones (opcional)..."
            rows={2}
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleCreate(e);
              }
            }}
            className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 resize-none"
          />
          <div className="flex items-center justify-between text-xs pt-0.5">
            <span className="text-[11px] text-slate-500 font-medium">Vencimiento:</span>
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="text-xs px-2 py-0.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
            />
          </div>
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewTitle('');
                setNewNotes('');
                setNewDueDate('');
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !newTitle.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3 h-3" />
              <span>{isSubmitting ? 'Guardando...' : 'Crear'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Contenedor Droppable */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 rounded-xl p-1 transition-colors duration-200 min-h-[350px] ${
              snapshot.isDraggingOver ? 'bg-blue-50/60 ring-2 ring-blue-400/30 ring-dashed' : ''
            }`}
          >
            {column.items.map((item, index) => (
              <KanbanCard
                key={item.id}
                item={item}
                index={index}
                columnTitle={column.title}
                onDelete={onDeleteTask ? () => onDeleteTask(item) : undefined}
                onToggleSubtask={onToggleSubtask}
                onAddSubtask={onAddSubtask}
                onDeleteSubtask={onDeleteSubtask}
                onUpdateTask={onUpdateTask}
              />
            ))}
            {provided.placeholder}

            {column.items.length === 0 && !snapshot.isDraggingOver && !isAdding && (
              <div className="h-32 border-2 border-dashed border-slate-200/80 rounded-xl flex flex-col items-center justify-center text-xs text-slate-400 font-medium gap-1">
                <span>Sin tareas</span>
                {onAddTask && (
                  <button
                    onClick={() => setIsAdding(true)}
                    className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                  >
                    + Añadir aquí
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
};
