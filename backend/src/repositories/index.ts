import { IKanbanRepository, PrismaKanbanRepository } from './kanban.repository.js';
import { InMemoryKanbanRepository } from './inMemoryKanban.repository.js';
import { checkDbConnection } from '../db/prisma.js';

let activeRepository: IKanbanRepository;
const inMemory = new InMemoryKanbanRepository();
const prismaRepo = new PrismaKanbanRepository();

export async function getRepository(): Promise<IKanbanRepository> {
  if (activeRepository) return activeRepository;

  const isConnected = await checkDbConnection();
  if (isConnected) {
    console.log('[Database] Conectado exitosamente a PostgreSQL vía Prisma.');
    activeRepository = prismaRepo;
  } else {
    console.warn('[Database] No se pudo conectar a PostgreSQL. Operando con repositorio resiliente en memoria para desarrollo/demo.');
    activeRepository = inMemory;
  }

  return activeRepository;
}

export { IKanbanRepository, PrismaKanbanRepository, InMemoryKanbanRepository };
