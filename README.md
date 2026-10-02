# 📋 Kanban Tasks Board (Sincronizado con Google Tasks & Keep)

Una aplicación web moderna, rápida y minimalista que actúa como una **capa visual de gestión de flujo de trabajo Kanban** sobre **Google Tasks** y **Google Keep**, sin convertirse en un gestor de tareas aislado e independiente.

---

## 🎯 Principio Fundamental de Sincronización

> **La fuente remota (Google Tasks / Google Keep) es la autoridad sobre la existencia del elemento.**
> **El Kanban es la autoridad exclusiva sobre el estado visual (columna) y su orden relativo.**

1. **Bandeja de Entrada Automática:** Toda nueva tarea creada en Google Tasks o Google Keep ingresa automáticamente en la primera columna: **"Para hacer"**.
2. **Eliminación Total:** Si una tarea es borrada en Google Tasks o Keep, **desaparece de inmediato del Kanban durante la sincronización**, sin importar si estaba en *Para hacer*, *En progreso*, *En revisión* o *Terminado* (nunca quedan tareas huérfanas).
3. **Persistencia de Flujo:** Si se edita el título, descripción o fecha en Google, el Kanban actualiza el contenido pero **respeta la columna actual** donde el usuario la posicionó.
4. **Idempotencia Absoluta:** Ejecutar la sincronización múltiples veces jamás genera tarjetas duplicadas gracias al índice único: `(user_id, source, source_id)`.

---

## 🏗️ 1. Arquitectura del Sistema

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite + TS)                 │
│  - Tablero Kanban 4 Columnas (@hello-pangea/dnd)                │
│  - Optimistic UI con Rollback automático ante fallos de red     │
│  - Badges [G Tasks] y [G Keep], fechas de vencimiento y notas   │
│  - Modal de Selección de Listas y Configuración de Fuentes      │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST API (Cookies HttpOnly Seguras)
┌───────────────────────────────▼─────────────────────────────────┐
│                 Backend API (Node.js + Express + TS)            │
│                                                                 │
│  Auth Controller ──► Google OAuth 2.0 (Refresh Tokens offline)  │
│  Kanban Controller ─► Drag & Drop, movimientos y ordenamiento   │
│  Sync Service ──────► Motor de Conciliación de Conjuntos (Diff) │
│                                                                 │
│  ├── GoogleTasksAdapter: Cliente oficial Tasks API v1           │
│  └── GoogleKeepAdapter:  Evaluación Workspace & Ingest Bridge   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│            Base de Datos (PostgreSQL vía Prisma ORM)            │
│  - users, oauth_accounts (tokens seguros)                       │
│  - kanban_items (UNIQUE user_id + source + source_id)           │
│  - kanban_movements (auditoría cronológica de estados)          │
│  - user_settings (listas seleccionadas, auto-complete en done)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 2. Estructura del Proyecto

```text
kanban-tasks-board/
├── ARCHITECTURE.md                  # Especificación técnica detallada
├── docker-compose.yml               # PostgreSQL local listo con 1 comando
├── package.json                     # Monorepo con scripts unificados
├── .env.example                     # Variables de entorno documentadas
├── backend/
│   ├── prisma/
│   │   └── schema.prisma            # Esquema de base de datos PostgreSQL
│   ├── src/
│   │   ├── adapters/                # Patrón Adapter para fuentes
│   │   │   ├── sourceAdapter.interface.ts
│   │   │   ├── googleTasks.adapter.ts
│   │   │   └── googleKeep.adapter.ts
│   │   ├── config/                  # Configuración tipada
│   │   ├── controllers/             # Controladores REST Express
│   │   ├── db/                      # Cliente Prisma y comprobación de salud
│   │   ├── middleware/              # Auth JWT y captura de errores
│   │   ├── repositories/            # Capa repositorio con fallback in-memory
│   │   ├── routes/                  # Rutas /api/...
│   │   ├── services/                # Reglas de negocio y motor de sync
│   │   ├── app.ts
│   │   └── server.ts
│   └── tests/
│       └── sync_and_kanban.test.ts  # Tests unitarios e integración (8 tests)
└── frontend/
    ├── src/
    │   ├── api/client.ts            # Cliente HTTP tipado con cookies
    │   ├── components/
    │   │   ├── Header.tsx           # Barra superior con sync y avatar
    │   │   ├── KanbanBoard.tsx      # Orquestador Drag & Drop optimista
    │   │   ├── KanbanColumn.tsx     # Columnas con acentos visuales
    │   │   ├── KanbanCard.tsx       # Tarjeta con badges, notas y fechas
    │   │   ├── SettingsModal.tsx    # Configuración de listas y Keep
    │   │   └── Toast.tsx            # Alertas visuales no bloqueantes
    │   ├── types/index.ts           # Modelos de datos
    │   ├── App.tsx
    │   └── main.tsx
    ├── index.html
    └── vite.config.ts
```

---

## 🔍 3. Evaluación Técnica Oficial de Google Tasks y Google Keep

### A. Google Tasks API v1 (`tasks.googleapis.com`)
* **Estado:** ✅ **Totalmente compatible y abierta** para cuentas personales (`@gmail.com`) y Google Workspace.
* **Operaciones utilizadas:**
  * `tasklists.list`: Listado de listas del usuario.
  * `tasks.list`: Extracción de tareas activas con soporte para parámetros incrementales (`showCompleted`, `showDeleted`, `updatedMin`).
  * `tasks.patch`: Actualización de estado a `completed` cuando el usuario activa la opción configurable en el Kanban.
* **Scopes OAuth:** `https://www.googleapis.com/auth/tasks`

### B. Google Keep API v1 (`keep.googleapis.com`) — Realidad Técnica
* **Limitación Fundamental:** ⚠️ **Google restringe la API oficial de Keep a dominios empresariales de Google Workspace**.
* **Motivo:** La API oficial de Keep requiere autenticación mediante **Cuentas de Servicio con Delegación de Todo el Dominio (Domain-Wide Delegation)**. Si una aplicación solicita scopes de Keep para un usuario estándar `@gmail.com`, Google responde con error `400: invalid_scope` o `403: Insufficient authentication scopes`.
* **Solución Implementada:**
  1. `GoogleKeepAdapter`: Soporta credenciales Workspace para entornos corporativos.
  2. Para cuentas personales, el modal de configuración explica la restricción oficial de Google de forma transparente.
  3. Incluye un **Keep Ingest Bridge** que permite importar notas o checklists estructuradas de Keep directamente a la columna *"Para hacer"*, identificadas con el badge visual oficial `[G Keep]`.

---

## 🗄️ 4. Modelo de Base de Datos (PostgreSQL)

```sql
-- Restricción de unicidad para evitar duplicados en la sincronización
CREATE UNIQUE INDEX uq_user_source_source_id 
ON kanban_items (user_id, source, source_id);

-- Índices de consulta rápida
CREATE INDEX idx_kanban_items_user_status 
ON kanban_items (user_id, status);
```

### Tabla `kanban_items`:
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Clave primaria |
| `user_id` | UUID | Clave foránea a `users` |
| `source` | VARCHAR | `'google_tasks'` o `'google_keep'` |
| `source_id` | VARCHAR | ID original en Google |
| `source_list_id`| VARCHAR | ID de lista de origen |
| `source_list_name`| VARCHAR | Nombre legible de lista |
| `title` | TEXT | Título sincronizado |
| `description` | TEXT | Notas o cuerpo de la tarea |
| `status` | VARCHAR | `'todo'`, `'in_progress'`, `'review'`, `'done'` (autoridad Kanban) |
| `position` | FLOAT | Posición ordinal para Drag & Drop |
| `due_date` | TIMESTAMP | Fecha de vencimiento |
| `last_synced_at`| TIMESTAMP | Última conciliación con la fuente |

---

## 🚀 5. Instrucciones para Ejecutar Localmente

### Prerrequisitos
- **Node.js** v18+ (recomendado v20 o v24).
- **Docker** (opcional, para PostgreSQL local) o cualquier instancia de PostgreSQL (Supabase / Neon / PostgreSQL local).

### Paso 1: Clonar e instalar dependencias
```bash
cd d:/Projects/kanban-tasks-board
npm install
```

### Paso 2: Base de Datos PostgreSQL
Puedes iniciar una base de datos PostgreSQL local en un segundo con Docker Compose:
```bash
docker compose up -d
```
*(Nota: Si no tienes Docker o PostgreSQL activo, el sistema incluye un repositorio en memoria que se activa automáticamente para desarrollo/demo sin romper el flujo).*

Para aplicar las migraciones de Prisma en tu PostgreSQL:
```bash
npm run prisma:push --workspace=backend
```

### Paso 3: Configurar variables de entorno
Copia `.env.example` a `.env`:
```bash
copy .env.example .env
```

### Paso 4: Iniciar la aplicación
Puedes iniciar tanto el backend como el frontend en modo desarrollo:
```bash
# Terminal 1 - Backend (puerto 3001)
npm run dev:backend

# Terminal 2 - Frontend (puerto 5173)
npm run dev:frontend
```
Abre tu navegador en: **`http://localhost:5173`**

---

## 🔑 6. Cómo Crear las Credenciales en Google Cloud Console

Para conectar la aplicación con tu cuenta real de Google:

1. Ve a [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un nuevo proyecto (ej. `Kanban-Tasks-App`).
3. Ve a **APIs & Services > Library** y habilita:
   - **Google Tasks API**
4. Ve a **APIs & Services > OAuth consent screen**:
   - Tipo de usuario: **External**.
   - Nombre de la app: `Mi Kanban`.
   - Correo de soporte y desarrollador: Tu correo de Gmail.
   - En **Scopes**, añade:
     - `https://www.googleapis.com/auth/tasks`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`
   - En **Test users**, añade tu cuenta personal de Gmail.
5. Ve a **APIs & Services > Credentials**:
   - Haz clic en **Create Credentials > OAuth client ID**.
   - Application type: **Web application**.
   - Name: `Kanban Web Client`.
   - **Authorized JavaScript origins:** `http://localhost:5173`
   - **Authorized redirect URIs:** `http://localhost:3001/api/auth/google/callback`
6. Copia el **Client ID** y el **Client Secret** en tu archivo `.env`:
   ```env
   GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxx
   GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
   ```

---

## 🧪 7. Ejecución de Tests Automatizados

El backend cuenta con una suite completa de pruebas unitarias y de integración que validan todas las reglas de negocio del Kanban:
- Creación de tareas entrantes en *"Para hacer"*.
- Actualización de contenido manteniendo la columna actual.
- Eliminación de tareas de cualquier columna cuando se borran en Google.
- Idempotencia y prevención de duplicados con `(user_id, source, source_id)`.
- Movimiento fluido entre columnas y persistencia de posición.
- Regla configurable de auto-complete en Google Tasks al pasar a *"Terminado"*.
- Manejo y recuperación ante errores.

Para ejecutar los tests:
```bash
npm run test --workspace=backend
```

---

## ☁️ 8. Estrategia de Despliegue Económica / Free Tier

Para desplegar la aplicación a producción a costo cero o muy bajo:

| Componente | Servicio Recomendado | Costo / Plan |
|---|---|---|
| **Base de Datos** | **Neon.tech** o **Supabase** | Free Tier (PostgreSQL administrado con SSL) |
| **Backend API** | **Render.com** o **Railway.app** | Free Tier / Hobby ($5/mes si requiere 24/7) |
| **Frontend** | **Vercel** o **Cloudflare Pages** | 100% Gratuito con SSL automático |

### Variables de producción:
- En Render/Railway:
  - `DATABASE_URL`: URL provista por Supabase o Neon (`postgresql://...`).
  - `FRONTEND_URL`: URL de tu frontend en Vercel (`https://tu-kanban.vercel.app`).
  - `GOOGLE_REDIRECT_URI`: `https://tu-api.onrender.com/api/auth/google/callback`.
- En Google Cloud Console:
  - Añade la URL de producción en *Authorized redirect URIs*.
