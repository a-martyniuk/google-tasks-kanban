import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { KanbanColumn, KanbanItem, KanbanStatus, SubTaskItem } from '../types';
import { googleTasksDirect } from '../services/googleTasksDirect';
import { ToastMessage } from '../components/Toast';

const STATUS_LABELS: Record<KanbanStatus, string> = {
  todo: 'Para hacer',
  in_progress: 'En progreso',
  review: 'En revisión',
  done: 'Terminado',
};

export const useKanban = (
  addToast: (type: 'success' | 'error' | 'info', text: string) => void,
  searchQuery: string,
  autoSyncInterval: number
) => {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const syncIntervalRef = useRef<number | null>(null);
  const isSyncingRef = useRef(isSyncing);

  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);

  // Cargar tablero desde el servicio directo de Google Tasks
  const loadBoard = useCallback(async () => {
    try {
      const data = await googleTasksDirect.fetchBoardTasks();
      setColumns(data.columns);
      setTotalCount(data.totalCount);
      setLastSyncedAt(data.lastSyncedAt);
    } catch (err: any) {
      console.error('Error cargando tareas:', err);
      addToast('error', `Error al cargar tablero: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // Sincronización periódica automática
  useEffect(() => {
    const intervalMs = Math.max(10, autoSyncInterval) * 1000;

    syncIntervalRef.current = window.setInterval(() => {
      if (!isSyncingRef.current && !googleTasksDirect.getIsSessionPaused()) {
        loadBoard();
      }
    }, intervalMs);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [autoSyncInterval, loadBoard]);

  const normalizeText = (text: string): string => {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  };

  // Filtrado reactivo de tarjetas por búsqueda
  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return columns;
    const q = normalizeText(searchQuery);
    return columns.map((col) => ({
      ...col,
      items: col.items.filter(
        (item) =>
          normalizeText(item.title).includes(q) ||
          (item.description && normalizeText(item.description).includes(q)) ||
          (item.subtasks && item.subtasks.some((s) => normalizeText(s.title).includes(q)))
      ),
    }));
  }, [columns, searchQuery]);

  const searchMatchingCount = useMemo(() => {
    return filteredColumns.reduce((acc, col) => acc + col.items.length, 0);
  }, [filteredColumns]);

  // Sincronizar manualmente
  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await loadBoard();
      addToast('success', 'Tablero sincronizado en vivo con Google Tasks.');
    } catch (err: any) {
      addToast('error', `Error en sincronización: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Mover tarjeta entre listas de Google Tasks (optimista)
  const handleMoveTask = async (
    task: KanbanItem,
    targetStatus: KanbanStatus,
    targetPosition: number,
    previousId?: string | null
  ) => {
    try {
      const updated = await googleTasksDirect.moveTaskBetweenColumns(
        task,
        targetStatus,
        targetPosition,
        previousId
      );
      setColumns((prev) =>
        prev.map((col) => {
          if (task.status === targetStatus && col.id === targetStatus) {
            const itemsWithout = col.items.filter(
              (i) => i.id !== task.id && i.id !== updated.id
            );
            return {
              ...col,
              items: [...itemsWithout, updated].sort((a, b) => a.position - b.position),
            };
          }
          if (col.id === task.status) {
            return {
              ...col,
              items: col.items.filter((i) => i.id !== task.id && i.id !== updated.id),
            };
          }
          if (col.id === targetStatus) {
            const itemsWithout = col.items.filter(
              (i) => i.id !== task.id && i.id !== updated.id
            );
            return {
              ...col,
              items: [...itemsWithout, updated].sort((a, b) => a.position - b.position),
            };
          }
          return col;
        })
      );
    } catch (err: any) {
      console.error('Error al mover tarea:', err);
      addToast('error', `Error al mover tarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Crear tarea rápida (optimista)
  const handleAddTask = async (
    status: KanbanStatus,
    title: string,
    description?: string,
    dueDate?: string | null
  ) => {
    try {
      const created = await googleTasksDirect.createTask(status, title, description, dueDate);
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id !== status) return col;
          return {
            ...col,
            items: [...col.items, created],
          };
        })
      );
      setTotalCount((prev) => prev + 1);
      addToast('success', `Tarea agregada a "${STATUS_LABELS[status] || status}".`);
    } catch (err: any) {
      addToast('error', `Error creando tarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Eliminar tarea en Google Tasks (optimista)
  const handleDeleteTask = async (task: KanbanItem) => {
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        items: col.items.filter((i) => i.id !== task.id),
      }))
    );
    setTotalCount((c) => Math.max(0, c - 1));

    try {
      await googleTasksDirect.deleteTask(task);
      addToast('info', `Tarea "${task.title}" eliminada de Google Tasks.`);
    } catch (err: any) {
      addToast('error', `Error al eliminar tarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Eliminar subtarea
  const handleDeleteSubtask = async (task: KanbanItem, subtask: SubTaskItem) => {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== task.status) return col;
        return {
          ...col,
          items: col.items.map((item) => {
            if (item.id !== task.id) return item;
            return {
              ...item,
              subtasks: (item.subtasks || []).filter((s) => s.id !== subtask.id),
            };
          }),
        };
      })
    );

    try {
      const listId = task.sourceListId || 'mock';
      await googleTasksDirect.deleteSubtask(listId, subtask.id);
      addToast('info', `Subtarea "${subtask.title}" eliminada.`);
    } catch (err: any) {
      addToast('error', `Error al eliminar subtarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Actualizar datos de tarjeta
  const handleUpdateTask = async (
    task: KanbanItem,
    updates: { title?: string; description?: string | null; dueDate?: string | null }
  ) => {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== task.status) return col;
        return {
          ...col,
          items: col.items.map((item) => {
            if (item.id !== task.id) return item;
            return {
              ...item,
              ...(updates.title !== undefined ? { title: updates.title } : {}),
              ...(updates.description !== undefined ? { description: updates.description } : {}),
              ...(updates.dueDate !== undefined ? { dueDate: updates.dueDate } : {}),
            };
          }),
        };
      })
    );

    try {
      await googleTasksDirect.updateTask(task, updates);
      addToast('success', `Tarea "${updates.title || task.title}" actualizada.`);
    } catch (err: any) {
      addToast('error', `Error al actualizar tarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Marcar / Desmarcar subtarea (optimista)
  const handleToggleSubtask = async (task: KanbanItem, subtask: SubTaskItem) => {
    const newStatus = subtask.status === 'completed' ? 'needsAction' : 'completed';

    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== task.status) return col;
        return {
          ...col,
          items: col.items.map((item) => {
            if (item.id !== task.id) return item;
            return {
              ...item,
              subtasks: (item.subtasks || []).map((sub) => {
                if (sub.id !== subtask.id) return sub;
                return { ...sub, status: newStatus };
              }),
            };
          }),
        };
      })
    );

    try {
      const listId = task.sourceListId || 'mock';
      await googleTasksDirect.toggleSubtask(listId, subtask.id, newStatus === 'completed');
    } catch (err: any) {
      addToast('error', `Error al actualizar subtarea: ${err.message}`);
      loadBoard();
    }
  };

  // Añadir subtarea
  const handleAddSubtask = async (task: KanbanItem, title: string) => {
    const tempId = `temp-sub-${Date.now()}`;
    const optimisticSub: SubTaskItem = {
      id: tempId,
      title,
      status: 'needsAction',
    };

    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== task.status) return col;
        return {
          ...col,
          items: col.items.map((item) => {
            if (item.id !== task.id) return item;
            return {
              ...item,
              subtasks: [...(item.subtasks || []), optimisticSub],
            };
          }),
        };
      })
    );

    try {
      const created = await googleTasksDirect.createSubtask(task, title);
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id !== task.status) return col;
          return {
            ...col,
            items: col.items.map((item) => {
              if (item.id !== task.id) return item;
              return {
                ...item,
                subtasks: (item.subtasks || []).map((s) => (s.id === tempId ? created : s)),
              };
            }),
          };
        })
      );
      addToast('success', `Subtarea "${title}" agregada en Google Tasks.`);
    } catch (err: any) {
      addToast('error', `Error al crear subtarea: ${err.message}`);
      loadBoard();
    }
  };

  // Actualizar subtarea
  const handleUpdateSubtask = async (
    task: KanbanItem,
    subtask: SubTaskItem,
    newTitle: string
  ) => {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === subtask.title) return;

    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== task.status) return col;
        return {
          ...col,
          items: col.items.map((item) => {
            if (item.id !== task.id) return item;
            return {
              ...item,
              subtasks: (item.subtasks || []).map((s) =>
                s.id === subtask.id ? { ...s, title: trimmed } : s
              ),
            };
          }),
        };
      })
    );

    try {
      const listId = task.sourceListId || 'mock';
      await googleTasksDirect.updateSubtask(listId, subtask.id, trimmed);
      addToast('success', 'Subtarea actualizada.');
    } catch (err: any) {
      addToast('error', `Error al actualizar subtarea: ${err.message}`);
      await loadBoard();
    }
  };

  // Nest, Promote, Move subtasks
  const handleNestTask = async (task: KanbanItem, parent: KanbanItem) => {
    try {
      const newSubs = await googleTasksDirect.nestTaskUnder(task, parent);
      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          items: col.items
            .filter((i) => i.id !== task.id)
            .map((i) => {
              if (i.id !== parent.id) return i;
              const newSubIds = new Set(newSubs.map((s) => s.id));
              const cleanExisting = (i.subtasks || []).filter(
                (s) => !newSubIds.has(s.id) && s.id !== task.id
              );
              return { ...i, subtasks: [...cleanExisting, ...newSubs] };
            }),
        }))
      );
      setTotalCount((c) => Math.max(0, c - 1));
      const extra = newSubs.length > 1 ? ` (+${newSubs.length - 1} subtareas)` : '';
      addToast('success', `"${task.title}" ahora es subtarea de "${parent.title}"${extra}.`);
    } catch (err: any) {
      addToast('error', `Error al anidar tarea: ${err.message}`);
      await loadBoard();
    }
  };

  const handlePromoteSubtask = async (
    subtask: SubTaskItem,
    parent: KanbanItem,
    targetStatus: KanbanStatus
  ) => {
    try {
      const created = await googleTasksDirect.promoteSubtask(subtask, parent, targetStatus);
      setColumns((prev) =>
        prev.map((col) => {
          const items = col.items.map((i) =>
            i.id === parent.id
              ? { ...i, subtasks: (i.subtasks || []).filter((s) => s.id !== subtask.id) }
              : i
          );
          if (col.id !== targetStatus) return { ...col, items };
          const minPos = items.reduce((m, i) => Math.min(m, i.position), Infinity);
          const withPos = { ...created, position: Number.isFinite(minPos) ? minPos - 1000 : 0 };
          return { ...col, items: [withPos, ...items.filter((i) => i.id !== created.id)] };
        })
      );
      setTotalCount((c) => c + 1);
      addToast('success', `"${subtask.title}" ahora es una tarea.`);
    } catch (err: any) {
      addToast('error', `Error al convertir subtarea: ${err.message}`);
      await loadBoard();
    }
  };

  const handleMoveSubtask = async (
    subtask: SubTaskItem,
    fromParent: KanbanItem,
    toParent: KanbanItem,
    previousId: string | null,
    targetIndex: number
  ) => {
    try {
      const moved = await googleTasksDirect.moveSubtaskToParent(
        subtask,
        fromParent,
        toParent,
        previousId
      );
      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          items: col.items.map((i) => {
            if (i.id !== fromParent.id && i.id !== toParent.id) return i;
            let subs = (i.subtasks || []).filter((s) => s.id !== subtask.id && s.id !== moved.id);
            if (i.id === toParent.id) {
              subs = [...subs];
              subs.splice(Math.min(targetIndex, subs.length), 0, moved);
            }
            return { ...i, subtasks: subs };
          }),
        }))
      );
      if (fromParent.id !== toParent.id) {
        addToast('success', `Subtarea "${subtask.title}" movida a "${toParent.title}".`);
      }
    } catch (err: any) {
      addToast('error', `Error al mover subtarea: ${err.message}`);
      await loadBoard();
    }
  };

  const handleImportFromMyTasks = async () => {
    if (isImporting) return;
    setIsImporting(true);
    try {
      addToast('info', 'Consultando y migrando tareas desde "My Tasks"...');
      const count = await googleTasksDirect.importTasksFromDefaultList();
      if (count > 0) {
        addToast('success', `¡Se importaron ${count} tareas/subtareas a "Para hacer"!`);
        await loadBoard();
      } else {
        addToast('info', 'No se encontraron tareas pendientes en tu lista "My Tasks".');
      }
    } catch (err: any) {
      addToast('error', `Error importando tareas: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return {
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
  };
};