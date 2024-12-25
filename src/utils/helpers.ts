import { Request } from 'express';
import { createHash } from 'crypto';

const ALLOWED_DOMAINS = ['youtube.com', 'youtu.be', 'soundcloud.com'];

export function validateUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    return ALLOWED_DOMAINS.some(allowed => domain.includes(allowed));
  } catch {
    return false;
  }
}

export function getUniqueUserId(req: Request): string {
  const fingerprint = req.headers['canvas-fingerprint'] as string;
  const userAgent = req.headers['user-agent'];
  const ip = req.ip;

  return createHash('md5')
    .update(`${fingerprint}:${userAgent}:${ip}`)
    .digest('hex');
}

export function optimizeDownloadSettings(fileSize: number) {
  if (fileSize > 100 * 1024 * 1024) { // 100MB
    return {
      chunkSize: 8192 * 4,
      bufferSize: 1024 * 1024,
      maxRetries: 5
    };
  }
  
  return {
    chunkSize: 8192,
    bufferSize: 1024 * 512,
    maxRetries: 3
  };
}