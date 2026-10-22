import React, { useState } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { KanbanColumn as KanbanColumnType, KanbanItem, SubTaskItem } from '../types';
import { KanbanCard } from './KanbanCard';
import { Plus, X, Check, ArrowUpFromLine } from 'lucide-react';
import { PROMOTE_DROP_PREFIX, SUBTASK_DND_TYPE } from './dndIds';
import { useTranslation } from 'react-i18next';

interface KanbanColumnProps {
  column: KanbanColumnType;
  /** true mientras se arrastra una subtarea: muestra la zona "convertir en tarea" */
  isDraggingSubtask?: boolean;
  /** ID de la tarjeta padre de donde se arrastra la subtarea para evitar auto-asignación */
  draggingFromParentId?: string | null;
  /** Permite soltar una tarjeta sobre otra para convertirla en subtarea */
  canNest?: boolean;
  /** Permite soltar subtareas en la columna para convertirlas en tarea */
  canPromote?: boolean;
  onAddTask?: (status: KanbanColumnType['id'], title: string, description?: string, dueDate?: string | null) => Promise<void>;
  onDeleteTask?: (task: KanbanItem) => Promise<void>;
  onToggleSubtask?: (task: KanbanItem, subtask: SubTaskItem) => void;
  onAddSubtask?: (task: KanbanItem, title: string) => Promise<void>;
  onDeleteSubtask?: (task: KanbanItem, subtask: SubTaskItem) => void;
  onUpdateSubtask?: (task: KanbanItem, subtask: SubTaskItem, newTitle: string) => Promise<void>;
  onUpdateTask?: (task: KanbanItem, updates: { title?: string; description?: string | null; dueDate?: string | null }) => Promise<void>;
}

const COLUMN_THEMES: Record<
  string,
  { dot: string; badge: string; border: string; headerBg: string; buttonHover: string }
> = {
  todo: {
    dot: 'bg-slate-400 dark:bg-slate-500',
    badge: 'bg-slate-200/70 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300',
    border: 'border-slate-200',
    headerBg: 'bg-slate-100/70',
    buttonHover: 'hover:bg-slate-200/60 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400',
  },
  in_progress: {
    dot: 'bg-blue-500 dark:bg-blue-400',
    badge: 'bg-blue-100/70 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    border: 'border-blue-200',
    headerBg: 'bg-blue-50/50',
    buttonHover: 'hover:bg-blue-200/50 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400',
  },
  review: {
    dot: 'bg-purple-500 dark:bg-purple-400',
    badge: 'bg-purple-100/70 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
    border: 'border-purple-200',
    headerBg: 'bg-purple-50/50',
    buttonHover: 'hover:bg-purple-200/50 dark:hover:bg-purple-900/40 text-purple-600 dark:text-purple-400',
  },
  done: {
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    badge: 'bg-emerald-100/70 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200',
    headerBg: 'bg-emerald-50/50',
    buttonHover: 'hover:bg-emerald-200/50 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
  },
};

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  isDraggingSubtask = false,
  draggingFromParentId = null,
  canNest = false,
  canPromote = false,
  onAddTask,
  onDeleteTask,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onUpdateSubtask,
  onUpdateTask,
}) => {
  const { t } = useTranslation();
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
    <div className="flex flex-col bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl p-3 border border-slate-200/70 dark:border-slate-700/70 shadow-2xs h-full min-w-[280px] max-w-[340px] flex-1">
      {/* Encabezado de Columna */}
      <div className="flex items-center justify-between px-2 py-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${theme.dot}`} />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm tracking-tight">
            {t(`columns.${column.id}`, { defaultValue: column.title })}
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
              title={t('columns.empty.addTask')}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Zona para soltar una subtarea y convertirla en tarea de esta columna */}
      {canPromote && (
        <Droppable
          droppableId={`${PROMOTE_DROP_PREFIX}${column.id}`}
          type={SUBTASK_DND_TYPE}
        >
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={
                isDraggingSubtask
                  ? `mb-2 rounded-lg border-2 border-dashed px-3 py-2.5 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      snapshot.isDraggingOver
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                        : 'border-slate-300 dark:border-slate-600 bg-white/60 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400'
                    }`
                  : 'hidden'
              }
            >
              <ArrowUpFromLine className="w-3.5 h-3.5 shrink-0" />
              <span>{t('columns.promoteToTask')}</span>
              {/* El placeholder se oculta para que la zona no cambie de tamaño */}
              <div className="hidden">{provided.placeholder}</div>
            </div>
          )}
        </Droppable>
      )}

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
          className="mb-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-300 dark:border-slate-600 shadow-xs space-y-2 animate-in fade-in"
        >
          <input
            type="text"
            placeholder={t('columns.form.title')}
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full text-xs p-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-900 dark:text-slate-100 bg-transparent"
          />
          <textarea
            placeholder={t('columns.form.notes')}
            rows={2}
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleCreate(e);
              }
            }}
            className="w-full text-xs p-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-300 resize-none bg-transparent"
          />
          <div className="flex items-center justify-between text-xs pt-0.5">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{t('columns.form.dueDate')}</span>
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="text-xs px-2 py-0.5 border border-slate-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-300 bg-transparent"
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
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !newTitle.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3 h-3" />
              <span>{isSubmitting ? t('columns.form.saving') : t('columns.form.create')}</span>
            </button>
          </div>
        </form>
      )}

      {/* Contenedor Droppable */}
      <Droppable droppableId={column.id} isCombineEnabled={canNest}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 rounded-xl p-1 transition-all duration-200 min-h-[350px] ${
              snapshot.isDraggingOver ? 'bg-blue-50/60 dark:bg-blue-900/20 ring-2 ring-blue-500/40 dark:ring-blue-500/30 ring-dashed shadow-inner' : ''
            }`}
          >
            {column.items.map((item, index) => (
              <KanbanCard
                key={item.id}
                item={item}
                index={index}
                columnTitle={column.title}
                isDraggingSubtask={isDraggingSubtask}
                draggingFromParentId={draggingFromParentId}
                onDelete={onDeleteTask ? () => onDeleteTask(item) : undefined}
                onToggleSubtask={onToggleSubtask}
                onAddSubtask={onAddSubtask}
                onDeleteSubtask={onDeleteSubtask}
                onUpdateSubtask={onUpdateSubtask}
                onUpdateTask={onUpdateTask}
              />
            ))}
            {provided.placeholder}

            {column.items.length === 0 && !snapshot.isDraggingOver && !isAdding && (
              <div className="h-36 border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl flex flex-col items-center justify-center text-xs text-slate-500 dark:text-slate-400 font-medium gap-2 p-4 text-center">
                <span>{t(`columns.empty.${column.id}`, { defaultValue: '' })}</span>

                {onAddTask && (
                  <button
                    onClick={() => setIsAdding(true)}
                    className="mt-1 px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 hover:text-slate-800 dark:hover:text-white transition-colors shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('columns.empty.addTask')}</span>
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
