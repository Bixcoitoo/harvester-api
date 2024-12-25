import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import ytdl from 'ytdl-core';
const ffmpeg = require('fluent-ffmpeg');
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface DownloadJob {
  id: string;
  url: string;
  format: 'mp3' | 'mp4';
  quality: string;
  userId: string;
}

async function processDownload(job: DownloadJob) {
  try {
    // Atualiza status
    await prisma.download.update({
      where: { id: job.id },
      data: { status: 'downloading' }
    });

    // Obtém informações do vídeo
    const info = await ytdl.getInfo(job.url);
    
    // Configura o download baseado no formato
    const stream = ytdl(job.url, {
      quality: job.format === 'mp3' ? 'highestaudio' : 'highest'
    });

    // Monitora progresso
    stream.on('progress', (_, downloaded, total) => {
      const progress = Math.floor((downloaded / total) * 100);
      parentPort?.postMessage({ 
        type: 'progress', 
        data: { 
          id: job.id, 
          progress,
          speed: (downloaded / 1024 / 1024).toFixed(2)
        }
      });
    });

    // Processa o download
    if (job.format === 'mp3') {
      await new Promise((resolve, reject) => {
        new ffmpeg()
          .addInput(stream)
          .toFormat('mp3')
          .on('end', resolve)
          .on('error', reject)
          .save(`downloads/${job.id}.mp3`);
      });
    } else {
      await new Promise((resolve, reject) => {
        stream.pipe(require('fs').createWriteStream(`downloads/${job.id}.mp4`))
          .on('finish', resolve)
          .on('error', reject);
      });
    }

    // Atualiza status como completo
    await prisma.download.update({
      where: { id: job.id },
      data: { status: 'completed', progress: 100 }
    });

    parentPort?.postMessage({ 
      type: 'complete', 
      data: { id: job.id }
    });

  } catch (error) {
    logger.error('Download error', { error, jobId: job.id });
    
    await prisma.download.update({
      where: { id: job.id },
      data: { 
        status: 'error',
        error: error.message 
      }
    });

    parentPort?.postMessage({ 
      type: 'error', 
      data: { id: job.id, error: error.message }
    });
  }
}

if (!isMainThread) {
  processDownload(workerData as DownloadJob);
}