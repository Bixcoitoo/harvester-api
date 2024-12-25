import winston from 'winston';
import { Console } from 'console';
import chalk from 'chalk';

class CustomConsole extends Console {
  constructor() {
    super(process.stdout, process.stderr);
  }

  formatLog(level: string, message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const colors = {
      info: 'cyan',
      warn: 'yellow',
      error: 'red',
      debug: 'green'
    };

    let output = `${chalk.dim(timestamp)} ${chalk[colors[level]](`[${level.toUpperCase()}]`)} ${message}`;
    
    if (meta?.progress) {
      output += `\n${chalk.blue('Progress:')} ${meta.progress}% | Speed: ${meta.speed} MB/s`;
    }
    
    if (meta?.requestId) {
      output = `${chalk.gray(meta.requestId)} ${output}`;
    }

    return output;
  }

  log(level: string, message: string, meta?: any) {
    super.log(this.formatLog(level, message, meta));
  }
}

const customConsole = new CustomConsole();

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    }),
    new winston.transports.Console({
      format: winston.format.printf((info: any) => {
        return customConsole.formatLog(info.level, info.message, info.meta);
      })
    })
  ]
});