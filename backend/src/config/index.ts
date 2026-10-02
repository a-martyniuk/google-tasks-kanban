import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://kanban_user:kanban_secure_password@localhost:5432/kanban_tasks_db?schema=public',
  sessionSecret: process.env.SESSION_SECRET || 'desarrollo_secreto_super_seguro_minimo_32_caracteres_12345',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback',
    scopes: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/tasks',
    ],
  },
  enableDemoMode: process.env.ENABLE_DEMO_MODE === 'true' || !process.env.GOOGLE_CLIENT_ID,
};
