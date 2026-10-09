import React, { useState, useEffect, useRef } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Trash2,
  CheckSquare,
  ListPlus,
  Pencil,
  Check,
  X,
  GripVertical,
  CornerDownRight,
} from 'lucide-react';
import { KanbanItem, SubTaskItem } from '../types';
import { SUBTASK_DND_TYPE, SUBTASK_DRAG_PREFIX, SUBLIST_DROP_PREFIX } from './dndIds';

interface KanbanCardProps {
  item: KanbanItem;
  index: number;
  /** Título de la columna que contiene la tarjeta (para ocultar la lista de origen si es la misma) */
  columnTitle?: string;
  /** Indica si hay una subtarea siendo arrastrada en el tablero */
  isDraggingSubtask?: boolean;
  /** ID del padre desde donde se arrastra la subtarea */
  draggingFromParentId?: string | null;
  onDelete?: () => void;
  onToggleSubtask?: (task: KanbanItem, subtask: SubTaskItem) => void;
  onAddSubtask?: (task: KanbanItem, title: string) => Promise<void>;
  onDeleteSubtask?: (task: KanbanItem, subtask: SubTaskItem) => void;
  onUpdateSubtask?: (
    task: KanbanItem,
    subtask: SubTaskItem,
    newTitle: string
  ) => Promise<void>;
  onUpdateTask?: (
    task: KanbanItem,
    updates: { title?: string; description?: string | null; dueDate?: string | null }
  ) => Promise<void>;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  item,
  index,
  columnTitle,
  isDraggingSubtask = false,
  draggingFromParentId = null,
  onDelete,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onUpdateSubtask,
  onUpdateTask,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const prevSubtasksCountRef = useRef(item.subtasks?.length || 0);

  // Abrir acordeón automáticamente si se añaden o asignan subtareas a esta tarjeta
  useEffect(() => {
    const currentCount = item.subtasks?.length || 0;
    if (currentCount > prevSubtasksCountRef.current) {
      setSubtasksOpen(true);
    }
    prevSubtasksCountRef.current = currentCount;
  }, [item.subtasks?.length]);

  // Edición inline de subtareas
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('');
  const [isSavingSubtask, setIsSavingSubtask] = useState(false);

  // Modo edición inline de tarea principal
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDescription, setEditDescription] = useState(item.description || '');
  const [editDueDate, setEditDueDate] = useState(
    item.dueDate ? item.dueDate.split('T')[0] : ''
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setEditTitle(item.title);
      setEditDescription(item.description || '');
      setEditDueDate(item.dueDate ? item.dueDate.split('T')[0] : '');
    }
  }, [item, isEditing]);

  const formatDueDate = (dateString?: string | null) => {
    if (!dateString) return null;
    const parts = dateString.split('T')[0].split('-');
    if (parts.length < 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);

    const dueDateClean = new Date(y, m, d);
    dueDateClean.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isOverdue = dueDateClean < today;
    const isToday = dueDateClean.getTime() === today.getTime();

    const formatted = dueDateClean.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    });

    return { formatted, isOverdue, isToday };
  };

  const due = formatDueDate(item.dueDate);

  const handleSaveEdit = async () => {
    if (!editTitle.trim() || !onUpdateTask) return;
    setIsSaving(true);
    try {
      await onUpdateTask(item, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        dueDate: editDueDate ? `${editDueDate}T00:00:00.000Z` : null,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTitle(item.title);
    setEditDescription(item.description || '');
    setEditDueDate(item.dueDate ? item.dueDate.split('T')[0] : '');
  };

  if (isEditing) {
    return (
      <Draggable draggableId={item.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`bg-white rounded-xl p-4 mb-3 border-2 border-blue-500 shadow-md ${
              snapshot.isDragging ? 'cursor-grabbing' : ''
            }`}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEdit();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  handleCancelEdit();
                }
              }}
              className="space-y-2.5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-600">Editar tarea</span>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Título</label>
                <input
                  type="text"
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-900"
                  placeholder="Título de la tarea..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Notas / Descripción</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleSaveEdit();
                    }
                  }}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 resize-none"
                  placeholder="Notas u observaciones... (Ctrl+Enter para guardar)"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Fecha de Vencimiento</label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="text-xs px-2 py-1 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-800 rounded-lg border border-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !editTitle.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3 h-3" />
                  <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </Draggable>
    );
  }

  const subtasks = item.subtasks || [];
  const completedSubtasks = subtasks.filter((s) => s.status === 'completed').length;
  const subtaskProgress = subtasks.length > 0 ? (completedSubtasks / subtasks.length) * 100 : 0;
  // Solo mostrar la lista de origen si difiere de la columna (listas extra sincronizadas)
  const showSourceList =
    !!item.sourceListName &&
    !!columnTitle &&
    item.sourceListName.trim().toLowerCase() !== columnTitle.trim().toLowerCase();
  const hasMeta = !!due || subtasks.length > 0 || showSourceList;

  // Google Tasks API solo admite 1 nivel de subtareas. Solo tarjetas principales pueden recibir subtareas.
  const canReceiveSubtasks = !item.parentId;
  // Esta tarjeta es candidata a recibir una subtarea arrastrada (si no es la tarjeta origen de la subtarea)
  const isTargetForSubtaskDrop =
    isDraggingSubtask && canReceiveSubtasks && item.id !== draggingFromParentId;
  // Montar el Droppable si tiene subtareas o si se está arrastrando una subtarea
  const shouldRenderSublistDroppable =
    canReceiveSubtasks && (subtasks.length > 0 || isDraggingSubtask);

  const handleSubmitSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || !onAddSubtask) return;
    setIsAddingSubtask(true);
    try {
      await onAddSubtask(item, newSubtaskTitle.trim());
      setNewSubtaskTitle('');
      setShowAddSubtask(false);
      setSubtasksOpen(true);
    } finally {
      setIsAddingSubtask(false);
    }
  };

  const handleStartEditSubtask = (sub: SubTaskItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingSubtaskId(sub.id);
    setEditSubtaskTitle(sub.title);
  };

  const handleCancelEditSubtask = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    setEditingSubtaskId(null);
    setEditSubtaskTitle('');
  };

  const handleSaveSubtask = async (sub: SubTaskItem, e?: React.FormEvent | React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const trimmed = editSubtaskTitle.trim();
    if (!trimmed || trimmed === sub.title) {
      setEditingSubtaskId(null);
      return;
    }
    if (!onUpdateSubtask) {
      setEditingSubtaskId(null);
      return;
    }
    setIsSavingSubtask(true);
    try {
      await onUpdateSubtask(item, sub, trimmed);
      setEditingSubtaskId(null);
    } catch {
      // toast de error manejado por el contenedor
    } finally {
      setIsSavingSubtask(false);
    }
  };

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`group relative bg-white rounded-lg px-3 py-2 mb-2 border transition-all duration-150 select-none ${
            snapshot.isDragging
              ? 'border-blue-500 shadow-xl ring-2 ring-blue-500/20 scale-[1.02] cursor-grabbing rotate-1'
              : snapshot.combineTargetFor
              ? 'border-blue-500 bg-blue-50/80 shadow-md ring-2 ring-blue-400 ring-dashed'
              : 'border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-sm cursor-grab'
          }`}
        >
          {/* Indicador visual cuando otra tarjeta se arrastra sobre esta para anidar */}
          {snapshot.combineTargetFor && (
            <div className="mb-1.5 px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-bold tracking-wide flex items-center justify-center gap-1 shadow-xs animate-in fade-in duration-150">
              <span>Soltar para anidar como subtarea ↳</span>
            </div>
          )}

          {/* Acciones flotantes (no ocupan espacio en el layout) */}
          <div className="absolute top-1 right-1 flex items-center gap-0.5 rounded-md bg-white/95 shadow-sm ring-1 ring-slate-200/70 px-0.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity">
            {onAddSubtask && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddSubtask(true);
                  setSubtasksOpen(true);
                }}
                className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                title="Agregar subtarea"
              >
                <ListPlus className="w-3.5 h-3.5" />
              </button>
            )}
            {onUpdateTask && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                title="Editar tarea"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`¿Eliminar la tarea "${item.title}" en Google Tasks?`)) {
                    onDelete();
                  }
                }}
                className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                title="Eliminar en Google Tasks"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Título */}
          <h4 className="text-[13px] font-semibold text-slate-900 leading-snug break-words">
            {item.title}
          </h4>

          {/* Descripción / Notas */}
          {item.description && (
            <div className="mt-0.5 text-xs text-slate-500 leading-snug">
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
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-0.5 cursor-pointer"
                >
                  {expanded ? (
                    <>
                      menos <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      más <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Fila de metadatos compacta */}
          {hasMeta && (
            <div className="mt-1.5 flex items-center gap-x-2.5 gap-y-1 flex-wrap text-[11px]">
              {due && (
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    due.isOverdue
                      ? 'text-rose-600 font-semibold'
                      : due.isToday
                      ? 'text-amber-600 font-semibold'
                      : 'text-slate-500'
                  }`}
                  title={due.isOverdue ? 'Vencida' : 'Fecha de vencimiento'}
                >
                  <Calendar className="w-3 h-3" />
                  {due.isToday ? 'Hoy' : due.formatted}
                </span>
              )}

              {subtasks.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSubtasksOpen(!subtasksOpen);
                  }}
                  className={`inline-flex items-center gap-1 font-medium rounded px-1 -mx-1 hover:bg-slate-100 cursor-pointer ${
                    completedSubtasks === subtasks.length ? 'text-emerald-600' : 'text-slate-500'
                  }`}
                  title={subtasksOpen ? 'Ocultar subtareas' : 'Ver subtareas'}
                >
                  <CheckSquare className="w-3 h-3" />
                  <span>
                    {completedSubtasks}/{subtasks.length}
                  </span>
                  <span className="w-8 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <span
                      className="block h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${subtaskProgress}%` }}
                    />
                  </span>
                  {subtasksOpen ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              )}

              {showSourceList && (
                <span
                  className="text-slate-400 font-medium truncate max-w-[120px]"
                  title={`Lista: ${item.sourceListName}`}
                >
                  • {item.sourceListName}
                </span>
              )}
            </div>
          )}

          {/* Lista de subtareas (colapsable y receptora de subtareas arrastradas) */}
          {shouldRenderSublistDroppable && (
            <Droppable
              droppableId={`${SUBLIST_DROP_PREFIX}${item.id}`}
              type={SUBTASK_DND_TYPE}
            >
              {(subDropProvided, subDropSnapshot) => {
                const isOver = subDropSnapshot.isDraggingOver;
                return (
                  <div
                    ref={subDropProvided.innerRef}
                    {...subDropProvided.droppableProps}
                    className={`mt-1.5 pt-1 rounded transition-colors ${
                      isTargetForSubtaskDrop
                        ? isOver
                          ? 'border-2 border-blue-500 bg-blue-50/80 p-2 ring-2 ring-blue-400/40'
                          : 'border border-dashed border-blue-300 bg-blue-50/30 p-1.5'
                        : subtasksOpen && subtasks.length > 0
                        ? 'border-t border-slate-100 space-y-0.5'
                        : 'hidden'
                    }`}
                  >
                    {/* Zona destacada para soltar y asignar subtarea a esta tarjeta */}
                    {isTargetForSubtaskDrop && (
                      <div
                        className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[11px] font-semibold transition-colors mb-1 ${
                          isOver
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-blue-700 bg-blue-100/60'
                        }`}
                      >
                        <CornerDownRight className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {isOver
                            ? 'Soltar para asignar a esta tarea ↳'
                            : '+ Asignar como subtarea'}
                        </span>
                      </div>
                    )}

                    {/* Subtareas existentes (mostradas si el acordeón está abierto) */}
                    {subtasksOpen &&
                      subtasks.map((sub, subIndex) => {
                    const isDone = sub.status === 'completed';
                    return (
                      <Draggable
                        key={sub.id}
                        draggableId={`${SUBTASK_DRAG_PREFIX}${sub.id}`}
                        index={subIndex}
                      >
                        {(subDragProvided, subDragSnapshot) => (
                          <div
                            ref={subDragProvided.innerRef}
                            {...subDragProvided.draggableProps}
                            className={`flex items-center justify-between gap-1.5 text-xs px-1 py-1 rounded transition-colors group/sub ${
                              subDragSnapshot.isDragging
                                ? 'bg-white shadow-lg ring-1 ring-blue-500/50 rounded z-50'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <span
                              {...subDragProvided.dragHandleProps}
                              className="p-0.5 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing shrink-0"
                              title="Arrastrar para reordenar, mover a otra tarea o soltar en una columna para convertir en tarea principal"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <GripVertical className="w-3 h-3" />
                            </span>

                            {editingSubtaskId === sub.id ? (
                              <form
                                onSubmit={(e) => handleSaveSubtask(sub, e)}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 flex-1 min-w-0"
                              >
                                <input
                                  type="text"
                                  autoFocus
                                  value={editSubtaskTitle}
                                  onChange={(e) => setEditSubtaskTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') handleCancelEditSubtask(e);
                                  }}
                                  disabled={isSavingSubtask}
                                  className="flex-1 min-w-0 text-xs px-1.5 py-0.5 border border-blue-400 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                                />
                                <button
                                  type="submit"
                                  disabled={isSavingSubtask || !editSubtaskTitle.trim()}
                                  className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer disabled:opacity-50 shrink-0"
                                  title="Guardar cambios (Enter)"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleCancelEditSubtask(e)}
                                  disabled={isSavingSubtask}
                                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded cursor-pointer shrink-0"
                                  title="Cancelar (Esc)"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </form>
                            ) : (
                              <>
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onToggleSubtask) {
                                      onToggleSubtask(item, sub);
                                    }
                                  }}
                                  onDoubleClick={(e) => {
                                    if (onUpdateSubtask) {
                                      handleStartEditSubtask(sub, e);
                                    }
                                  }}
                                  className="flex items-start gap-1.5 flex-1 min-w-0 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isDone}
                                    onChange={() => {}}
                                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none shrink-0"
                                  />
                                  <span
                                    className={`leading-snug transition-all break-words ${
                                      isDone
                                        ? 'line-through text-slate-400'
                                        : 'text-slate-700 group-hover/sub:text-slate-900'
                                    }`}
                                    title={onUpdateSubtask ? 'Doble clic para editar subtarea' : undefined}
                                  >
                                    {sub.title}
                                  </span>
                                </div>

                                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                                  {onUpdateSubtask && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleStartEditSubtask(sub, e)}
                                      className="p-0.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                      title="Editar subtarea"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}

                                  {onDeleteSubtask && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm(`¿Eliminar subtarea "${sub.title}"?`)) {
                                          onDeleteSubtask(item, sub);
                                        }
                                      }}
                                      className="p-0.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                      title="Eliminar subtarea"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                    })}
                    {subDropProvided.placeholder}
                  </div>
                );
              }}
            </Droppable>
          )}

          {/* Formulario para añadir subtarea (solo visible bajo demanda) */}
          {onAddSubtask && showAddSubtask && (
            <form
              onSubmit={handleSubmitSubtask}
              className="mt-1.5 flex items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                placeholder="Nueva subtarea..."
                autoFocus
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowAddSubtask(false);
                }}
                className="flex-1 min-w-0 text-xs px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Cancelar"
              >
                <X className="w-3 h-3" />
              </button>
            </form>
          )}
        </div>
      )}
    </Draggable>
  );
};
