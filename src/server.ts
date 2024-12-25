import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from './utils/logger';
import apiRoutes from './routes/api';
import { metricsMiddleware, metrics } from './utils/metrics';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const app = express();
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['query', 'info', 'warn', 'error']
});

// Cria diretório de downloads se não existir
const downloadsDir = join(__dirname, '../downloads');
try {
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true, mode: 0o755 });
  }
} catch (error) {
  logger.error('Erro ao criar diretório de downloads', { error });
  process.exit(1);
}

// Configurações básicas
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(cors({
  origin: ['harvester-api-three.vercel.app', 'http://localhost:3000'],
  credentials: true
}));

// Middleware de logs
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
    
    // Atualiza métricas
    metrics.requestDuration.observe(duration);
    metrics.requestsTotal.inc({ 
      method: req.method, 
      path: req.path, 
      status: res.statusCode 
    });
  });
  
  next();
});

// Rota de métricas
app.get('/metrics', metricsMiddleware);

// Rotas da API
app.use('/api', apiRoutes);

// Rota de status
app.get('/health', async (req, res) => {
  try {
    // Verifica conexão com banco
    await prisma.$queryRaw`SELECT 1`;
    
    // Verifica sistema de arquivos
    const downloadsDir = join(__dirname, '../downloads');
    await fs.promises.access(downloadsDir);
    
    res.json({
      status: 'healthy',
      version: process.env.npm_package_version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// Middleware de erro
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { 
    error: err.message,
    stack: err.stack
  });
  
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    requestId: req.id
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`
🚀 Servidor Harvester iniciado!
   
   Porta: ${PORT}
   Ambiente: ${process.env.NODE_ENV}
   Versão: ${process.env.npm_package_version}
   
   Métricas: http://localhost:${PORT}/metrics
   Documentação: http://localhost:${PORT}/docs
  `);
});