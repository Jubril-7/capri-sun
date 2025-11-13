import { connectDB, getDB } from './mongodb.js';
import { logMessage } from './logger.js';

const DEFAULT_STORAGE = {
    prefix: '+'
};

export async function loadStorage() {
    try {
        await connectDB();
        const db = getDB();
        
        const storageDoc = await db.collection('storage').findOne({ key: 'bot_storage' });
        
        if (!storageDoc) {
            await db.collection('storage').insertOne({
                key: 'bot_storage',
                ...DEFAULT_STORAGE,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            return DEFAULT_STORAGE;
        }
        
        const { _id, key, createdAt, updatedAt, ...storage } = storageDoc;
        
        await logMessage('debug', 'Storage loaded from MongoDB');
        return storage;
    } catch (error) {
        await logMessage('error', `Failed to load storage from MongoDB: ${error.message}`);
        return DEFAULT_STORAGE;
    }
}

export async function saveStorage(storage) {
    try {
        await connectDB();
        const db = getDB();
        
        await db.collection('storage').updateOne(
            { key: 'bot_storage' },
            { 
                $set: { 
                    ...storage,
                    updatedAt: new Date()
                } 
            },
            { upsert: true }
        );
        
        await logMessage('debug', 'Storage saved to MongoDB');
    } catch (error) {
        await logMessage('error', `Failed to save storage to MongoDB: ${error.message}`);
        throw error;
    }
}

export async function getGroups() {
    try {
        await connectDB();
        const db = getDB();
        const groups = await db.collection('groups').find({}).toArray();
        const result = {};
        groups.forEach(group => {
            const { _id, chatId, ...groupData } = group;
            result[chatId] = groupData;
        });
        return result;
    } catch (error) {
        await logMessage('error', `Failed to get groups: ${error.message}`);
        return {};
    }
}

export async function getApprovedGroups() {
    try {
        await connectDB();
        const db = getDB();
        const groups = await db.collection('groups').find({ 
            approved: true,
            blocked: { $ne: true }
        }).toArray();
        
        const result = {};
        groups.forEach(group => {
            const { _id, chatId, ...groupData } = group;
            result[chatId] = groupData;
        });
        return result;
    } catch (error) {
        await logMessage('error', `Failed to get approved groups: ${error.message}`);
        return {};
    }
}

export async function updateGroup(chatId, update) {
    try {
        await connectDB();
        const db = getDB();
        await db.collection('groups').updateOne(
            { chatId },
            { $set: { ...update, updatedAt: new Date() } },
            { upsert: true }
        );
    } catch (error) {
        await logMessage('error', `Failed to update group ${chatId}: ${error.message}`);
        throw error;
    }
}

export async function deleteGroup(chatId) {
    try {
        await connectDB();
        const db = getDB();
        await db.collection('groups').deleteOne({ chatId });
    } catch (error) {
        await logMessage('error', `Failed to delete group ${chatId}: ${error.message}`);
        throw error;
    }
}

export async function getBans() {
    try {
        await connectDB();
        const db = getDB();
        const bans = await db.collection('bans').find({}).toArray();
        const result = {};
        bans.forEach(ban => {
            result[ban.userId] = true;
        });
        return result;
    } catch (error) {
        await logMessage('error', `Failed to get bans: ${error.message}`);
        return {};
    }
}

export async function updateBan(userId, banned) {
    try {
        await connectDB();
        const db = getDB();
        if (banned) {
            await db.collection('bans').updateOne(
                { userId },
                { $set: { userId, banned: true, updatedAt: new Date() } },
                { upsert: true }
            );
        } else {
            await db.collection('bans').deleteOne({ userId });
        }
    } catch (error) {
        await logMessage('error', `Failed to update ban for ${userId}: ${error.message}`);
        throw error;
    }
}

export async function getWarnings() {
    try {
        await connectDB();
        const db = getDB();
        const warnings = await db.collection('warnings').find({}).toArray();
        const result = {};
        warnings.forEach(warning => {
            result[warning.userId] = warning.count;
        });
        return result;
    } catch (error) {
        await logMessage('error', `Failed to get warnings: ${error.message}`);
        return {};
    }
}

export async function updateWarning(userId, count) {
    try {
        await connectDB();
        const db = getDB();
        if (count > 0) {
            await db.collection('warnings').updateOne(
                { userId },
                { $set: { userId, count, updatedAt: new Date() } },
                { upsert: true }
            );
        } else {
            await db.collection('warnings').deleteOne({ userId });
        }
    } catch (error) {
        await logMessage('error', `Failed to update warning for ${userId}: ${error.message}`);
        throw error;
    }
}

export async function getGames() {
    try {
        await connectDB();
        const db = getDB();
        const games = await db.collection('games').find({}).toArray();
        const result = {};
        games.forEach(game => {
            result[game.chatId] = game.data;
        });
        return result;
    } catch (error) {
        await logMessage('error', `Failed to get games: ${error.message}`);
        return {};
    }
}

export async function updateGame(chatId, gameData) {
    try {
        await connectDB();
        const db = getDB();
        if (gameData) {
            await db.collection('games').updateOne(
                { chatId },
                { $set: { chatId, data: gameData, updatedAt: new Date() } },
                { upsert: true }
            );
        } else {
            await db.collection('games').deleteOne({ chatId });
        }
    } catch (error) {
        await logMessage('error', `Failed to update game for ${chatId}: ${error.message}`);
        throw error;
    }
}

export async function getPrefix() {
    try {
        await connectDB();
        const db = getDB();
        const storage = await db.collection('storage').findOne({ key: 'bot_storage' });
        return storage?.prefix || '+';
    } catch (error) {
        await logMessage('error', `Failed to get prefix: ${error.message}`);
        return '+';
    }
}

export async function updatePrefix(prefix) {
    try {
        await connectDB();
        const db = getDB();
        await db.collection('storage').updateOne(
            { key: 'bot_storage' },
            { $set: { prefix, updatedAt: new Date() } }
        );
    } catch (error) {
        await logMessage('error', `Failed to update prefix: ${error.message}`);
        throw error;
    }
}