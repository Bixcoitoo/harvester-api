import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { downloadQueue } from '../services/downloadQueue';
import { logger } from '../utils/logger';
import { rateLimit } from 'express-rate-limit';
import { validateUrl, getUniqueUserId } from '../utils/helpers';

const router = Router();
const prisma = new PrismaClient();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100
});

router.use(limiter);

// Rota de download
router.post('/download', async (req, res) => {
  try {
    const { url, format = 'mp3', quality = 'high' } = req.body;
    const userId = getUniqueUserId(req);

    // Valida URL
    if (!validateUrl(url)) {
      return res.status(400).json({ 
        error: 'URL inválida. Apenas YouTube e SoundCloud são suportados.' 
      });
    }

    // Verifica limite de downloads
    const userDownloads = await prisma.user.findUnique({
      where: { id: userId }
    });

    const downloadLimit = userDownloads?.isPremium ? 100 : 5;
    
    if (userDownloads?.downloadsCount >= downloadLimit) {
      return res.status(429).json({ 
        error: 'Limite de downloads atingido' 
      });
    }

    // Inicia download
    const downloadId = await downloadQueue.addDownload({
      userId,
      url,
      format,
      quality
    });

    // Incrementa contador de downloads
    await prisma.user.upsert({
      where: { id: userId },
      update: { downloadsCount: { increment: 1 } },
      create: { 
        id: userId,
        downloadsCount: 1
      }
    });

    logger.info('Download iniciado', { 
      downloadId,
      userId,
      url,
      format 
    });

    res.json({ 
      success: true, 
      downloadId,
      message: 'Download iniciado com sucesso' 
    });

  } catch (error) {
    logger.error('Erro ao processar download', { error });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para verificar status do download
router.get('/download/:id/status', async (req, res) => {
  try {
    const download = await prisma.download.findUnique({
      where: { id: req.params.id }
    });

    if (!download) {
      return res.status(404).json({ error: 'Download não encontrado' });
    }

    res.json({
      status: download.status,
      progress: download.progress,
      error: download.error
    });

  } catch (error) {
    logger.error('Erro ao verificar status', { error });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para verificar downloads restantes
router.get('/downloads/remaining', async (req, res) => {
  try {
    const userId = getUniqueUserId(req);
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    const limit = user?.isPremium ? 100 : 5;
    const used = user?.downloadsCount || 0;

    res.json({
      remaining: Math.max(0, limit - used),
      total: limit,
      isPremium: user?.isPremium || false
    });

  } catch (error) {
    logger.error('Erro ao verificar downloads restantes', { error });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para ativar premium
router.post('/premium/activate', async (req, res) => {
  try {
    const userId = getUniqueUserId(req);
    
    await prisma.user.upsert({
      where: { id: userId },
      update: { isPremium: true },
      create: {
        id: userId,
        isPremium: true
      }
    });

    logger.info('Premium ativado', { userId });
    res.json({ success: true, message: 'Premium ativado com sucesso' });

  } catch (error) {
    logger.error('Erro ao ativar premium', { error });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;