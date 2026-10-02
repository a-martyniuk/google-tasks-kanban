# Arquitectura y Decisiones Técnicas: Kanban Tasks Board

Este documento describe la arquitectura técnica, modelo de datos, evaluación formal de la API de Google Tasks, mecanismo de sincronización idempotente y estrategia de despliegue para la aplicación web **Kanban Tasks Board**.

---

## 1. Principio Fundamental del Sistema

> **La fuente externa (Google Tasks) es la única autoridad sobre la existencia, título, notas y fecha de un ítem.**
> **El Kanban es la autoridad exclusiva sobre el flujo visual de trabajo (columna actual, orden relativo e historial de transiciones).**

Cualquier elemento en el Kanban existe si y solo si existe en la fuente original. Si un elemento es borrado en Google Tasks, desaparece inmediatamente del Kanban en la siguiente sincronización, sin importar si estaba en *Para hacer*, *En progreso*, *En revisión* o *Terminado*.

---

## 2. Evaluación Técnica Oficial de las APIs de Google

Antes de implementar cualquier integración, se realizó un análisis exhaustivo de las especificaciones REST oficiales de Google:

### 2.1 Google Tasks API v1 (`tasks.googleapis.com`)
* **Disponibilidad**: Abierta para todas las cuentas de Google (tanto personales `@gmail.com` como dominios empresariales de Google Workspace).
* **Flujo de Autenticación**: OAuth 2.0 estándar (Authorization Code Flow con `access_type=offline` y `prompt=consent` para obtener `refresh_token`).
* **Scopes Necesarios**:
  * `https://www.googleapis.com/auth/tasks` (lectura y escritura de tareas y listas).
  * `https://www.googleapis.com/auth/userinfo.email` y `https://www.googleapis.com/auth/userinfo.profile` (identificación del usuario).
* **Capacidades Oficiales**:
  * `tasklists.list`: Listado de listas de tareas disponibles del usuario.
  * `tasks.list`: Obtención de tareas de una lista. Soporta parámetros clave:
    * `showCompleted=true/false`: permite filtrar o incluir tareas completadas.
    * `showDeleted=true/false`: permite detectar qué tareas fueron eliminadas en la fuente para sincronización incremental.
    * `updatedMin`: timestamp ISO-8601 para traer únicamente tareas creadas o modificadas desde la última sincronización.
  * `tasks.patch`: Permite marcar una tarea como completada (`status: "completed"`) en Google Tasks cuando el usuario lo configure en el Kanban al moverla a *Terminado*.
* **Veredicto Técnico**: 100% compatible con todos los requisitos del Kanban.

### 2.2 Descarte Técnico Fundamentado de Google Keep
* **Evaluación Inicial:** Se analizó la integración con Google Keep API v1 (`keep.googleapis.com`).
* **Restricción Fundamental de Google:**
  A diferencia de Google Tasks, Drive o Calendar, **la API oficial de Google Keep NO está habilitada para cuentas de usuario estándar (`@gmail.com`)**.
* **Tipo de Acceso Restringido:**
  * Google exige un entorno corporativo **Google Workspace Enterprise**.
  * La autenticación requiere **Cuentas de Servicio (Service Account) con Delegación de Todo el Dominio (Domain-Wide Delegation)** configuradas por un administrador de Google Workspace.
  * Si una aplicación web solicita los scopes `https://www.googleapis.com/auth/keep` o `https://www.googleapis.com/auth/keep.readonly` con una cuenta personal `@gmail.com`, la pantalla de consentimiento de Google OAuth falla con error `400 invalid_scope` o `403 Insufficient authentication scopes`.
* **Decisión de Ingeniería:**
  Para garantizar una experiencia 100% fluida, abierta y sin fricciones para cualquier usuario con cuenta de Google (`@gmail.com` y Workspace), **se descartó Google Keep del sistema**, focalizando la arquitectura exclusivamente en **Google Tasks** con sincronización directa cliente-nube (Zero-DB) y soporte de subtareas jerárquicas nativas.

---

## 3. Diagrama de Arquitectura del Sistema

```mermaid
flowchart TD
    subgraph Frontend ["Frontend (React + Vite + Tailwind)"]
        UI[Kanban Board View]
        DND[Drag & Drop Controller]
        OptState[Optimistic UI Manager]
        SettingsUI[Configuración & Fuentes]
    end

    subgraph Backend ["Backend (Node.js + Express + TypeScript)"]
        Router[API Gateway / Router]
        AuthCtrl[Auth Controller & OAuth Flow]
        KanbanCtrl[Kanban Board Controller]
        SyncEngine[Sync Service - Idempotent Diff Engine]
        
        subgraph Adapters ["Source Adapters"]
            TaskAdapter[GoogleTasksAdapter - v1 REST]
        end
    end

    subgraph External ["Servicios Google"]
        GAuth[Google OAuth 2.0 Server]
        GTasksAPI[Google Tasks API]
    end

    subgraph Storage ["Base de Datos PostgreSQL"]
        DB_Users[(users)]
        DB_OAuth[(oauth_accounts)]
        DB_Items[(kanban_items)]
        DB_Movements[(kanban_movements)]
        DB_Sync[(sync_logs)]
    end

    UI --> DND
    DND --> OptState
    OptState -->|REST API Requests| Router
    SettingsUI -->|Gestión de listas y sync| Router

    Router --> AuthCtrl
    Router --> KanbanCtrl
    Router --> SyncEngine

    AuthCtrl --> GAuth
    AuthCtrl --> DB_Users
    AuthCtrl --> DB_OAuth

    SyncEngine --> TaskAdapter
    TaskAdapter --> GTasksAPI

    SyncEngine --> DB_Items
    SyncEngine --> DB_Sync
    KanbanCtrl --> DB_Items
    KanbanCtrl --> DB_Movements
```

---

## 4. Modelo de Datos (PostgreSQL / Prisma)

### 4.1 Restricción de Identidad
Para garantizar que nunca se confundan dos tareas con el mismo título ni se generen duplicados:
```sql
CONSTRAINT uq_user_source_source_id UNIQUE (user_id, source, source_id);
```

### 4.2 Tablas Principales
* **`users`**: Identidad del usuario autenticado en la plataforma.
* **`oauth_accounts`**: Almacena el `access_token`, `refresh_token` (cifrado) y vencimiento para mantener la sesión y conectividad continua con Google sin solicitar re-login.
* **`user_settings`**:
  * Listas de Google Tasks activas para sincronizar (`selected_task_lists`).
  * Opción booleana `complete_in_source_on_done` (por defecto `false`).
  * Intervalo de sincronización periódica automática (segundos).
* **`kanban_items`**:
  * `id`: UUID (Primary Key).
  * `user_id`: UUID (Foreign Key a `users`).
  * `source`: `google_tasks`.
  * `source_id`: Identificador original del elemento en Google.
  * `source_list_id` y `source_list_name`: Lista de origen.
  * `title`: Título original.
  * `description`: Notas/contenido.
  * `due_date`: Fecha de vencimiento provista por la fuente.
  * `status`: `todo` | `in_progress` | `review` | `done` (Propiedad exclusiva del Kanban).
  * `position`: Posición flotante para reordenamiento fluido sin renumerar toda la columna.
  * `last_synced_at`: Timestamp de la última verificación con la fuente.
* **`kanban_movements`**: Registro cronológico de movimientos entre columnas (`from_status`, `to_status`, `moved_at`).
* **`sync_logs`**: Auditoría de cada ejecución del motor de sincronización (`items_added`, `items_updated`, `items_removed`, `status`, `error_message`).

---

## 5. Algoritmo de Sincronización Idempotente (Diff Engine)

El motor de sincronización ejecuta los siguientes pasos secuenciales:

```mermaid
sequenceDiagram
    autonumber
    actor Usuario
    participant Kanban as Kanban Board
    participant Sync as Sync Service
    participant Adapter as Google Tasks Adapter
    participant DB as PostgreSQL

    Usuario->>Kanban: Solicita Sincronizar (o Timer)
    Kanban->>Sync: POST /api/sync/run
    Sync->>Adapter: Obtener tareas de listas activas
    Adapter-->>Sync: NormalizedTask[] (conjunto remoto actual)
    
    Sync->>DB: Obtener kanban_items actuales del usuario
    DB-->>Sync: ExistingItems[] (conjunto local actual)
    
    rect rgb(240, 248, 255)
    Note over Sync: Análisis de Conjuntos (Set Difference)
    Sync->>Sync: 1. Identificar Nuevas (Remoto - Local) -> Status: 'todo'
    Sync->>Sync: 2. Identificar Modificadas (Remoto ∩ Local) -> Actualizar título, notas, fecha
    Sync->>Sync: 3. Identificar Eliminadas (Local - Remoto) -> ELIMINAR DE CUALQUIER COLUMNA
    end

    Sync->>DB: INSERT nuevas tareas en 'todo'
    Sync->>DB: UPDATE contenido de tareas existentes (MANTIENE status kanban intacto)
    Sync->>DB: DELETE tareas que ya no existen en la fuente
    Sync->>DB: Registrar log en sync_logs
    
    Sync-->>Kanban: { added, updated, removed, last_synced_at }
    Kanban-->>Usuario: Actualizar vista con badges y animación fluida
```

### 5.1 Reglas Clave del Sincronizador:
1. **Altas**: Si una tarea no existe localmente, se inserta **únicamente en `todo` ("Para hacer")**.
2. **Modificaciones**: Si cambió el título, descripción o fecha en Google, se actualizan esos campos. El estado del Kanban (`todo`, `in_progress`, `review`, `done`) **permanece intacto**.
3. **Bajas**: Si una tarea local ya no viene en el set de Google Tasks (o fue marcada como `deleted: true`), se borra inmediatamente de la base de datos local, **sin importar en qué columna esté**.
4. **Idempotencia**: Si se ejecuta el proceso N veces seguidas sin cambios remotos, el delta es 0: 0 inserts, 0 updates, 0 deletes.

---

## 6. Drag & Drop y Actualizaciones Optimistas

1. Cuando el usuario arrastra una tarjeta:
   - El frontend actualiza de inmediato el estado visual local en memoria (0ms latencia perceptible).
   - Se emite una petición asíncrona: `PATCH /api/kanban/items/:id/move` con `{ targetStatus, targetPosition }`.
   - Si la opción `complete_in_source_on_done` está activada y la tarjeta se movió a `done`, el backend invoca en background el método `completeTask` en el adaptador de Google Tasks.
2. **Rollback automático ante fallos**:
   - Si la red falla o el backend responde con error (ej. la tarea fue eliminada en Google justo en ese instante), el frontend revierte instantáneamente la tarjeta a su columna anterior y muestra una notificación de error clara.

---

## 7. Seguridad y Privacidad

* **Protección de Credenciales**: Ni el `client_secret` de Google ni los `refresh_token` se exponen jamás al navegador del cliente.
* **Sesiones Seguras**: Cookies HTTP-Only con flags `SameSite=Lax` y `Secure` (en producción), firmadas criptográficamente.
* **Principio de Mínimo Privilegio**: Solo se solicitan los scopes indispensables para operar con Google Tasks.
* **Protección de Datos**: Cada consulta a la base de datos incluye explícitamente el `user_id` de la sesión activa, impidiendo acceso cruzado entre usuarios.
