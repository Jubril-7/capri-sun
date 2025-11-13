import { MongoClient } from 'mongodb';
import { config } from '../config.js';
import { logMessage } from './logger.js';

let client = null;
let db = null;

export async function connectDB() {
    try {
        if (db) return db;
        
        client = new MongoClient(config.mongoUri, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        
        await client.connect();
        db = client.db();
        
        await db.collection('groups').createIndex({ chatId: 1 }, { unique: true });
        await db.collection('bans').createIndex({ userId: 1 }, { unique: true });
        await db.collection('warnings').createIndex({ userId: 1 }, { unique: true });
        await db.collection('games').createIndex({ chatId: 1 }, { unique: true });
        await db.collection('storage').createIndex({ key: 1 }, { unique: true });
        
        await logMessage('info', 'Connected to MongoDB');
        return db;
    } catch (error) {
        await logMessage('error', `MongoDB connection failed: ${error.message}`);
        throw error;
    }
}

export async function closeDB() {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
}

export function getDB() {
    if (!db) throw new Error('Database not connected. Call connectDB first.');
    return db;
}