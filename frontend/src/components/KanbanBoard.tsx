import React, { useState, useEffect } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { KanbanColumn as KanbanColumnType, KanbanItem, KanbanStatus, SubTaskItem } from '../types';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps {
  initialColumns: KanbanColumnType[];
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
  onMoveTask: (task: KanbanItem, targetStatus: KanbanStatus, targetPosition: number) => Promise<void>;
  onAddTask?: (status: KanbanStatus, title: string, description?: string, dueDate?: string | null) => Promise<void>;
  onDeleteTask?: (task: KanbanItem) => Promise<void>;
  onToggleSubtask?: (task: KanbanItem, subtask: SubTaskItem) => void;
  onAddSubtask?: (task: KanbanItem, title: string) => Promise<void>;
  onDeleteSubtask?: (task: KanbanItem, subtask: SubTaskItem) => void;
  onUpdateTask?: (task: KanbanItem, updates: { title?: string; description?: string | null; dueDate?: string | null }) => Promise<void>;
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
  onUpdateTask,
}) => {
  const [columns, setColumns] = useState<KanbanColumnType[]>(initialColumns);

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

  const handleDragEnd = async (result: DropResult) => {
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
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-6 pt-2 px-1 scroll-smooth">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            onAddTask={onAddTask}
            onDeleteTask={onDeleteTask}
            onToggleSubtask={onToggleSubtask}
            onAddSubtask={onAddSubtask}
            onDeleteSubtask={onDeleteSubtask}
            onUpdateTask={onUpdateTask}
          />
        ))}
      </div>
    </DragDropContext>
  );
};
