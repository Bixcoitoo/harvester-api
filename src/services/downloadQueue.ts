import { Worker } from 'worker_threads';
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';
import path from 'path';

const prisma = new PrismaClient();

export class DownloadQueue {
  private workers: Worker[] = [];
  private maxWorkers: number;
  private queue: any[] = [];

  constructor(maxWorkers = 2) {
    this.maxWorkers = maxWorkers;
  }

  async addDownload(downloadData: any) {
    // Cria registro no banco
    const download = await prisma.download.create({
      data: {
        userId: downloadData.userId,
        url: downloadData.url,
        format: downloadData.format,
        status: 'queued'
      }
    });

    // Adiciona à fila ou processa imediatamente
    if (this.workers.length < this.maxWorkers) {
      this.startWorker(download);
    } else {
      this.queue.push(download);
    }

    return download.id;
  }

  private startWorker(downloadData: any) {
    const worker = new Worker(
      path.join(__dirname, '../workers/downloadWorker.ts'),
      { workerData: downloadData }
    );

    worker.on('message', async (message) => {
      switch (message.type) {
        case 'progress':
          await this.handleProgress(message.data);
          break;
        case 'complete':
          await this.handleComplete(message.data);
          this.processNextInQueue();
          break;
        case 'error':
          await this.handleError(message.data);
          this.processNextInQueue();
          break;
      }
    });

    this.workers.push(worker);
  }

  private async handleProgress(data: any) {
    await prisma.download.update({
      where: { id: data.id },
      data: { progress: data.progress }
    });
    
    logger.info('Download progress', { 
      downloadId: data.id,
      progress: data.progress,
      speed: data.speed
    });
  }

  private async handleComplete(data: any) {
    await prisma.download.update({
      where: { id: data.id },
      data: { status: 'completed' }
    });
    
    logger.info('Download completed', { downloadId: data.id });
  }

  private async handleError(data: any) {
    await prisma.download.update({
      where: { id: data.id },
      data: { 
        status: 'error',
        error: data.error
      }
    });
    
    logger.error('Download failed', { 
      downloadId: data.id,
      error: data.error
    });
  }

  private processNextInQueue() {
    if (this.queue.length > 0) {
      const nextDownload = this.queue.shift();
      this.startWorker(nextDownload);
    }
  }
}

export const downloadQueue = new DownloadQueue();