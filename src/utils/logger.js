import { promises as fs } from 'fs';
import path from 'path';

export async function logMessage(level, message) {
    const logDir = path.join(process.cwd(), 'logs');
    await fs.mkdir(logDir, { recursive: true });
    const logEntry = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`;
    await fs.appendFile(path.join(logDir, 'bot.log'), logEntry);
}