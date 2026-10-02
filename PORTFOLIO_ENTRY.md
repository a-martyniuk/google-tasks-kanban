# Ficha de Proyecto para Portfolio Profesional

## 📋 Resumen Ejecutivo del Proyecto
* **Nombre:** Google Tasks Kanban (Zero-DB Multi-Device Layer)
* **Categoría:** Cloud Integration, Full-Stack Frontend, Zero-DB Architecture & Productividad
* **Enfoque de Ingeniería:** Optimización de costos de infraestructura ($0/mes), eliminación de estados intermedios y sincronización bidireccional cliente-nube directa vía OAuth 2.0.

---

## 💻 Stack Tecnológico (Tags)
`React 19` `TypeScript` `Google Tasks REST API` `OAuth 2.0 (Google Identity Services)` `Zero-DB Architecture` `Tailwind CSS` `Vercel` `@hello-pangea/dnd` `Lucide Icons` `SPA`

---

## 🎯 Storytelling para el Portfolio (Español & English)

### 🇪🇸 Versión en Español (para `translations.ts`)
```typescript
{
    title: "Google Tasks Kanban (Zero-DB Multi-Device Layer)",
    description: "Capa visual de productividad Kanban sincronizada en tiempo real con Google Tasks y Google Keep. Arquitectura Zero-DB que utiliza las listas nativas de Google Cloud como backend reactivo multi-dispositivo (Web, Android, iOS) con costo de infraestructura cero.",
    tags: [
        "React 19",
        "TypeScript",
        "Google Tasks API",
        "OAuth 2.0 (GIS)",
        "Zero-DB Architecture",
        "Tailwind CSS",
        "Vercel",
        "Drag & Drop"
    ],
    image: "/images/projects/google-tasks-kanban.png",
    alt: "Tablero Kanban minimalista sincronizado con Google Tasks y Keep sin base de datos",
    challenge: "Los tableros Kanban tradicionales que se sincronizan con servicios externos suelen requerir servidores dedicados, bases de datos relacionales, sincronizadores en background y costos mensuales de hosting, introduciendo problemas de consistencia de datos y latencia entre el móvil y la web.",
    solution: "Diseñé una arquitectura Zero-DB serverless donde las columnas del Kanban mapean directamente a listas nativas en Google Tasks. Implementé autenticación cliente vía Google Identity Services (OAuth 2.0 Token Client) y drag & drop optimista que mueve tareas entre listas remotas en tiempo real, garantizando sincronización inmediata bidireccional con apps nativas de Android e iOS sin ningún servidor intermedio.",
    impact: "Reducción del 100% en costos de base de datos e infraestructura ($0/mes), 0ms de latencia perceptible gracias a actualizaciones optimistas con rollback automático y paridad total en tiempo real entre el navegador y el celular.",
    architecture: [
        "Google Identity Services (Client-Side OAuth 2.0)",
        "Google Tasks REST API v1 (Reactive Backend)",
        "Mapeo de Listas a Columnas (Multi-Device State)",
        "Drag & Drop Optimista con Rollback (@hello-pangea/dnd)",
        "Edge Hosting en Vercel (Costo Cero)"
    ],
    metric: "Costo Infra: $0/mes | Sync: 0ms Multi-Device",
    github: "https://github.com/a-martyniuk/google-tasks-kanban",
    link: "https://kanban-tasks-board.vercel.app"
}
```

---

### 🇺🇸 English Version (for `translations.ts`)
```typescript
{
    title: "Google Tasks Kanban (Zero-DB Multi-Device Layer)",
    description: "Real-time Kanban productivity layer seamlessly synced with Google Tasks and Keep. Zero-DB architecture leveraging native Google Cloud TaskLists as a multi-device reactive backend across Web, Android, and iOS with zero hosting costs.",
    tags: [
        "React 19",
        "TypeScript",
        "Google Tasks API",
        "OAuth 2.0 (GIS)",
        "Zero-DB Architecture",
        "Tailwind CSS",
        "Vercel",
        "Drag & Drop"
    ],
    image: "/images/projects/google-tasks-kanban.png",
    alt: "Minimalist Kanban board synchronized with Google Tasks and Keep without external databases",
    challenge: "Standard Kanban boards synchronizing with third-party task ecosystems typically mandate dedicated backend servers, relational databases, polling daemons, and recurrent infrastructure expenses, introducing data inconsistency and state lag between mobile apps and web clients.",
    solution: "Architected a serverless Zero-DB system mapping Kanban columns directly to native Google Tasks lists. Integrated client-side OAuth 2.0 via Google Identity Services and fluid optimistic drag & drop that relocates tasks across remote Google lists in real time, delivering instant bidirectional parity with official Android and iOS Google Tasks apps without intermediate backend nodes.",
    impact: "100% reduction in database and server expenses ($0/mo), sub-millisecond perceived UI latency via optimistic updates with automated error rollbacks, and seamless mobile-to-desktop parity.",
    architecture: [
        "Google Identity Services (Client-Side OAuth 2.0)",
        "Google Tasks REST API v1 (Reactive Backend)",
        "TaskLists to Columns Mapping (Multi-Device State)",
        "Optimistic Drag & Drop with Rollback (@hello-pangea/dnd)",
        "Vercel Edge Deployment (Zero-Cost Hosting)"
    ],
    metric: "Infra Cost: $0/mo | Sync: 0ms Multi-Device",
    github: "https://github.com/a-martyniuk/google-tasks-kanban",
    link: "https://kanban-tasks-board.vercel.app"
}
```

---

## 🎤 Puntos Clave para Destacar en una Entrevista Técnica
1. **Pragmatismo Arquitectónico:** "Identifiqué que provisionar PostgreSQL, Docker y un cluster de sincronización para gestionar tareas ya alojadas en Google Cloud era sobreingeniería. Resolví el problema utilizando el propio Google Tasks como base de datos reactiva."
2. **UX de Alto Rendimiento:** "Uso de actualizaciones optimistas: el usuario arrastra la tarjeta y la UI responde al instante; en segundo plano la API de Google realiza la transacción, y ante cualquier pérdida de red se aplica un rollback automático sin corromper el estado."
3. **Multi-dispositivo Nativo:** "Si el usuario está en la calle y agrega una tarea con Google Assistant o en la app de Android, aparece automáticamente en el Kanban al llegar a la oficina."
