import { app } from './app.js';
import { config } from './config/index.js';
import { getRepository } from './repositories/index.js';

async function startServer() {
  try {
    // Inicializar conexión con repositorio de datos
    await getRepository();

    app.listen(config.port, () => {
      console.log(`=======================================================`);
      console.log(`🚀 Kanban Tasks Board API ejecutándose en puerto ${config.port}`);
      console.log(`🌐 Ambiente: ${config.nodeEnv}`);
      console.log(`🔗 Frontend esperado en: ${config.frontendUrl}`);
      console.log(`🔑 Demo Mode: ${config.enableDemoMode ? 'ACTIVADO' : 'DESACTIVADO'}`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Error fatal al iniciar el servidor:', err);
    process.exit(1);
  }
}

startServer();
