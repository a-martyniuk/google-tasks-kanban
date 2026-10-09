import React, { useState, useEffect } from 'react';
import { BeforeCapture, DragDropContext, DropResult } from '@hello-pangea/dnd';
import { KanbanColumn as KanbanColumnType, KanbanItem, KanbanStatus, SubTaskItem } from '../types';
import { KanbanColumn } from './KanbanColumn';
import {
  PROMOTE_DROP_PREFIX,
  SUBLIST_DROP_PREFIX,
  SUBTASK_DND_TYPE,
  SUBTASK_DRAG_PREFIX,
} from './dndIds';

interface KanbanBoardProps {
  initialColumns: KanbanColumnType[];
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
  onMoveTask: (task: KanbanItem, targetStatus: KanbanStatus, targetPosition: number) => Promise<void>;
  onAddTask?: (status: KanbanStatus, title: string, description?: string, dueDate?: string | null) => Promise<void>;
  onDeleteTask?: (task: KanbanItem) => Promise<void>;
  onToggleSubtask?: (task: KanbanItem, subtask: SubTaskItem) => void;
  onAddSubtask?: (task: KanbanItem, title: string) => Promise<void>;
  onDeleteSubtask?: (task: KanbanItem, subtask: SubTaskItem) => void;
  onUpdateSubtask?: (task: KanbanItem, subtask: SubTaskItem, newTitle: string) => Promise<void>;
  onUpdateTask?: (task: KanbanItem, updates: { title?: string; description?: string | null; dueDate?: string | null }) => Promise<void>;
  onNestTask?: (task: KanbanItem, parent: KanbanItem) => Promise<void>;
  onPromoteSubtask?: (subtask: SubTaskItem, parent: KanbanItem, targetStatus: KanbanStatus) => Promise<void>;
  onMoveSubtask?: (
    subtask: SubTaskItem,
    fromParent: KanbanItem,
    toParent: KanbanItem,
    previousId: string | null,
    targetIndex: number
  ) => Promise<void>;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  initialColumns,
  onNotify,
  onMoveTask,
  onAddTask,
  onDeleteTask,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onUpdateSubtask,
  onUpdateTask,
  onNestTask,
  onPromoteSubtask,
  onMoveSubtask,
}) => {
  const [columns, setColumns] = useState<KanbanColumnType[]>(initialColumns);
  const [isDraggingSubtask, setIsDraggingSubtask] = useState(false);

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  const calculateNewPosition = (items: KanbanItem[], targetIndex: number): number => {
    if (items.length <= 1) return 1000;
    if (targetIndex === 0) {
      const nextPos = items[1]?.position || 2000;
      return nextPos > 0 ? nextPos / 2 : 1000;
    }
    if (targetIndex === items.length - 1) {
      const prevPos = items[items.length - 2]?.position || 1000;
      return prevPos + 1000;
    }
    const prevPos = items[targetIndex - 1]?.position || 0;
    let nextPos = items[targetIndex + 1]?.position || prevPos + 2000;
    if (nextPos <= prevPos) {
      nextPos = prevPos + 2000;
    }
    return (prevPos + nextPos) / 2;
  };

  const findItem = (cols: KanbanColumnType[], itemId: string): KanbanItem | undefined => {
    for (const col of cols) {
      const found = col.items.find((i) => i.id === itemId);
      if (found) return found;
    }
    return undefined;
  };

  /** Mostrar zonas "convertir en tarea" antes de que la librería mida el DOM */
  const handleBeforeCapture = (before: BeforeCapture) => {
    setIsDraggingSubtask(before.draggableId.startsWith(SUBTASK_DRAG_PREFIX));
  };

  // ---------- Soltar una tarjeta sobre otra: convertir en subtarea ----------
  const handleCombine = async (result: DropResult) => {
    const { draggableId, combine } = result;
    if (!combine || !onNestTask) return;

    const task = findItem(columns, draggableId);
    const parent = findItem(columns, combine.draggableId);
    if (!task || !parent || task.id === parent.id) return;

    if (parent.parentId) {
      onNotify('error', 'No se puede anidar dentro de una subtarea: Google Tasks admite un solo nivel.');
      return;
    }

    const previousColumns = columns;
    const taskAsSub: SubTaskItem = {
      id: task.id,
      title: task.title,
      status: task.sourceStatus === 'completed' ? 'completed' : 'needsAction',
    };
    const newSubs = [taskAsSub, ...(task.subtasks || [])];

    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        items: col.items
          .filter((i) => i.id !== task.id)
          .map((i) =>
            i.id === parent.id ? { ...i, subtasks: [...(i.subtasks || []), ...newSubs] } : i
          ),
      }))
    );

    try {
      await onNestTask(task, parent);
    } catch (err: any) {
      setColumns(previousColumns);
      onNotify('error', `Error al anidar tarea: ${err.message || 'Fallo de conexión con Google'}`);
    }
  };

  // ---------- Arrastre de subtareas: reordenar, mover a otra tarjeta o convertir en tarea ----------
  const handleSubtaskDragEnd = async (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    if (!source.droppableId.startsWith(SUBLIST_DROP_PREFIX)) return;

    const fromParent = findItem(columns, source.droppableId.slice(SUBLIST_DROP_PREFIX.length));
    const sub = fromParent?.subtasks?.[source.index];
    if (!fromParent || !sub || sub.id.startsWith('temp-')) return;

    const previousColumns = columns;

    // a) Convertir en tarea principal
    if (destination.droppableId.startsWith(PROMOTE_DROP_PREFIX)) {
      if (!onPromoteSubtask) return;
      const targetStatus = destination.droppableId.slice(PROMOTE_DROP_PREFIX.length) as KanbanStatus;

      setColumns((prev) =>
        prev.map((col) => {
          const items = col.items.map((i) =>
            i.id === fromParent.id
              ? { ...i, subtasks: (i.subtasks || []).filter((s) => s.id !== sub.id) }
              : i
          );
          if (col.id !== targetStatus) return { ...col, items };
          const minPos = items.reduce((m, i) => Math.min(m, i.position), Infinity);
          const optimistic: KanbanItem = {
            id: sub.id,
            userId: fromParent.userId,
            source: 'google_tasks',
            sourceId: sub.id,
            sourceListId: fromParent.sourceListId,
            sourceListName: col.title,
            title: sub.title,
            description: null,
            status: targetStatus,
            position: Number.isFinite(minPos) ? minPos - 1000 : 0,
            dueDate: null,
            sourceStatus: sub.status,
            lastSyncedAt: new Date().toISOString(),
            parentId: null,
            subtasks: [],
          };
          return { ...col, items: [optimistic, ...items] };
        })
      );

      try {
        await onPromoteSubtask(sub, fromParent, targetStatus);
      } catch (err: any) {
        setColumns(previousColumns);
        onNotify('error', `Error al convertir subtarea: ${err.message || 'Fallo de conexión con Google'}`);
      }
      return;
    }

    // b) Reordenar o mover a la lista de subtareas de otra tarjeta
    if (destination.droppableId.startsWith(SUBLIST_DROP_PREFIX)) {
      if (!onMoveSubtask) return;
      const toParent = findItem(columns, destination.droppableId.slice(SUBLIST_DROP_PREFIX.length));
      if (!toParent) return;
      if (fromParent.id === toParent.id && source.index === destination.index) return;

      const targetSubs = (toParent.subtasks || []).filter((s) => s.id !== sub.id);
      targetSubs.splice(destination.index, 0, sub);
      const previousId = destination.index > 0 ? targetSubs[destination.index - 1]?.id ?? null : null;

      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          items: col.items.map((i) => {
            if (i.id === toParent.id) return { ...i, subtasks: targetSubs };
            if (i.id === fromParent.id) {
              return { ...i, subtasks: (i.subtasks || []).filter((s) => s.id !== sub.id) };
            }
            return i;
          }),
        }))
      );

      try {
        await onMoveSubtask(sub, fromParent, toParent, previousId, destination.index);
      } catch (err: any) {
        setColumns(previousColumns);
        onNotify('error', `Error al mover subtarea: ${err.message || 'Fallo de conexión con Google'}`);
      }
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    setIsDraggingSubtask(false);

    if (result.type === SUBTASK_DND_TYPE) {
      await handleSubtaskDragEnd(result);
      return;
    }

    if (result.combine) {
      await handleCombine(result);
      return;
    }

    const { source, destination } = result;

    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    // 1. Snapshot previo para ROLLBACK ante fallos
    const previousColumns = JSON.parse(JSON.stringify(columns)) as KanbanColumnType[];

    // 2. ACTUALIZACIÓN OPTIMISTA INMEDIATA (0 ms de latencia percibida)
    const sourceColIndex = columns.findIndex((c) => c.id === source.droppableId);
    const destColIndex = columns.findIndex((c) => c.id === destination.droppableId);

    if (sourceColIndex === -1 || destColIndex === -1) return;

    const sourceCol = { ...columns[sourceColIndex] };
    const destCol = { ...columns[destColIndex] };

    const sourceItems = [...sourceCol.items];
    const [movedItem] = sourceItems.splice(source.index, 1);

    if (!movedItem) return;

    const targetStatus = destination.droppableId as KanbanStatus;
    const updatedCard: KanbanItem = {
      ...movedItem,
      status: targetStatus,
    };

    let newColumns: KanbanColumnType[];

    if (source.droppableId === destination.droppableId) {
      sourceItems.splice(destination.index, 0, updatedCard);
      sourceCol.items = sourceItems;
      newColumns = [...columns];
      newColumns[sourceColIndex] = sourceCol;
    } else {
      const destItems = [...destCol.items];
      destItems.splice(destination.index, 0, updatedCard);
      sourceCol.items = sourceItems;
      destCol.items = destItems;
      newColumns = [...columns];
      newColumns[sourceColIndex] = sourceCol;
      newColumns[destColIndex] = destCol;
    }

    const targetColItems =
      source.droppableId === destination.droppableId
        ? newColumns[sourceColIndex].items
        : newColumns[destColIndex].items;

    const newPosition = calculateNewPosition(targetColItems, destination.index);
    updatedCard.position = newPosition;

    setColumns(newColumns);

    // 3. PERSISTIR EN GOOGLE TASKS (Mover tarea de lista remota)
    try {
      await onMoveTask(movedItem, targetStatus, newPosition);
    } catch (err: any) {
      // 4. ROLLBACK AUTOMÁTICO
      console.error('[KanbanBoard] Error al persistir movimiento en Google Tasks:', err);
      setColumns(previousColumns);
      onNotify('error', `Error al mover tarea: ${err.message || 'Fallo de conexión con Google'}`);
    }
  };

  return (
    <DragDropContext onBeforeCapture={handleBeforeCapture} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-6 pt-2 px-1 scroll-smooth">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            isDraggingSubtask={isDraggingSubtask}
            canNest={!!onNestTask}
            canPromote={!!onPromoteSubtask}
            onAddTask={onAddTask}
            onDeleteTask={onDeleteTask}
            onToggleSubtask={onToggleSubtask}
            onAddSubtask={onAddSubtask}
            onDeleteSubtask={onDeleteSubtask}
            onUpdateSubtask={onUpdateSubtask}
            onUpdateTask={onUpdateTask}
          />
        ))}
      </div>
    </DragDropContext>
  );
};
