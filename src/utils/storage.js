import { promises as fs } from 'fs';
import path from 'path';

// Use persistent directory for storage
const PERSISTENT_DIR = process.env.PERSISTENT_DIR || './data';
const STORAGE_PATH = path.join(PERSISTENT_DIR, 'storage.json');

export async function loadStorage() {
    try {
        // Ensure directory exists
        await fs.mkdir(PERSISTENT_DIR, { recursive: true });
        
        const data = await fs.readFile(STORAGE_PATH, 'utf8');
        const storage = JSON.parse(data);
        
        // Convert wordgame state objects to Maps and Sets
        if (storage.games?.wordgame) {
            for (const chatId in storage.games.wordgame) {
                const game = storage.games.wordgame[chatId];
                if (game.responses && !(game.responses instanceof Map)) {
                    game.responses = new Map(Object.entries(game.responses));
                }
                if (game.roundUsedWords && !(game.roundUsedWords instanceof Set)) {
                    game.roundUsedWords = new Set(game.roundUsedWords);
                }
                if (game.gameUsedWords && !(game.gameUsedWords instanceof Set)) {
                    game.gameUsedWords = new Set(game.gameUsedWords);
                }
            }
        }
        
        return storage;
    } catch {
        // Return default storage if file doesn't exist
        return { groups: {}, bans: {}, warnings: {}, games: {}, prefix: '+' };
    }
}

export async function saveStorage(storage) {
    try {
        // Ensure directory exists
        await fs.mkdir(PERSISTENT_DIR, { recursive: true });
        
        // Convert Maps and Sets to plain objects/arrays for JSON serialization
        const serializedStorage = JSON.parse(JSON.stringify(storage, (key, value) => {
            if (value instanceof Map) {
                return Object.fromEntries(value);
            }
            if (value instanceof Set) {
                return Array.from(value);
            }
            return value;
        }));
        
        await fs.writeFile(STORAGE_PATH, JSON.stringify(serializedStorage, null, 2));
    } catch (error) {
        console.error('Error saving storage:', error);
    }
}