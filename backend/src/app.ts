import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { apiRouter } from './routes/index.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { config } from './config/index.js';

export const app = express();

app.use(
  cors({
    origin: [config.frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rutas de API
app.use('/api', apiRouter);

// Manejador centralizado de errores
app.use(errorMiddleware);
