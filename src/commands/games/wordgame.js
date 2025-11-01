import { sendReaction } from '../../middlewares/reactions.js';
import { logMessage } from '../../utils/logger.js';
import { saveStorage } from '../../utils/storage.js';
import { validateWord } from '../../utils/dictionary.js';

const metadataCache = new Map();
const profileNameCache = new Map();
const wordCache = new Map();
const activeTimers = new Map();
const activeGames = new Map();

async function getDisplayName(sock, jid, chatId, msg) {
    if (!jid) {
        await logMessage('error', `getDisplayName: JID is undefined in ${chatId}`);
        return '@unknown';
    }
    try {
        if (profileNameCache.has(jid)) {
            await logMessage('debug', `Name for ${jid} in ${chatId}: @${profileNameCache.get(jid)} from profileNameCache`);
            return `@${profileNameCache.get(jid)}`;
        }

        let metadata = metadataCache.get(chatId);
        if (!metadata) {
            metadata = await sock.groupMetadata(chatId);
            metadataCache.set(chatId, metadata);
            await logMessage('debug', `Cached group metadata for ${chatId}`);
        }

        const participant = metadata.participants.find(p => p.id === jid);
        if (participant) {
            const name = participant.name || participant.notifyName || participant.vname || participant.shortName;
            if (name) {
                profileNameCache.set(jid, name);
                await logMessage('debug', `Name for ${jid} in ${chatId}: @${name} from group metadata`);
                return `@${name}`;
            }
        }

        if (msg.pushName && jid === msg.key.participant) {
            profileNameCache.set(jid, msg.pushName);
            await logMessage('debug', `Name for ${jid} in ${chatId}: @${msg.pushName} from msg.pushName`);
            return `@${msg.pushName}`;
        }

        const number = jid.split('@')[0].replace(/^\+?/, '');
        await logMessage('debug', `Name for ${jid} in ${chatId}: using fallback @${number}`);
        return `@${number}`;
    } catch (error) {
        await logMessage('error', `Failed to get name for ${jid} in ${chatId}: ${error.message}`);
        const number = jid.split('@')[0].replace(/^\+?/, '');
        return `@${number}`;
    }
}

function getRandomLetter() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return letters[Math.floor(Math.random() * letters.length)];
}

function clearGameTimer(chatId) {
    if (activeTimers.has(chatId)) {
        clearTimeout(activeTimers.get(chatId));
        activeTimers.delete(chatId);
        logMessage('debug', `Cleared active timer for ${chatId}`);
    }
}

async function startRound(sock, chatId, game, prefix, msg) {
    clearGameTimer(chatId);

    if (game.roundLock) {
        await logMessage('debug', `startRound blocked for ${chatId}: roundLock=true`);
        return;
    }

    game.roundLock = true;
    game.round += 1;
    
    const baseTime = { easy: 45, medium: 40, hard: 35 }[game.difficulty];
    const timeDecrement = { easy: 3, medium: 4, hard: 5 }[game.difficulty];
    game.timeLimit = Math.max(15, baseTime - ((game.round - 1) * timeDecrement));
    
    game.minLength = 3 + Math.floor((game.round - 1) / 2);
    
    game.currentLetter = getRandomLetter();
    game.responses = new Map();
    game.roundUsedWords = new Set();

    try {
        await logMessage('debug', `startRound initializing for ${chatId}: round=${game.round}, letter=${game.currentLetter}, timeLimit=${game.timeLimit}, minLength=${game.minLength}, players=${JSON.stringify(game.players.map(p => p.jid))}`);
        
        const playerNames = await Promise.all(game.players.map(async p => await getDisplayName(sock, p.jid, chatId, msg)));
        await sendReaction(sock, msg, '🎮');
        
        await sock.sendMessage(chatId, {
            text: `Round ${game.round}: Submit a word starting with "${game.currentLetter}" (min ${game.minLength} letters) with ${prefix}w <word>. Time: ${game.timeLimit} seconds!\n\nRound progression: Time ⏱️ decreases, Word length 📏 increases!`,
            mentions: game.players.map(p => p.jid)
        });
        
        await logMessage('info', `Word game round ${game.round} started in ${chatId}, letter: ${game.currentLetter}, time: ${game.timeLimit}s, minLength: ${game.minLength}`);

        const timer = setTimeout(async () => {
            activeTimers.delete(chatId);
            await logMessage('debug', `Timer triggered for round ${game.round} in ${chatId}, checking responses...`);
            await checkRound(sock, chatId, game, prefix, msg);
        }, game.timeLimit * 1000);
        
        activeTimers.set(chatId, timer);
        await logMessage('debug', `startRound completed for ${chatId}: timer set for ${game.timeLimit}s at ${new Date().toISOString()}`);
        
    } catch (err) {
        await logMessage('error', `Error starting round ${game.round} in ${chatId}: ${err.message}`);
        game.roundLock = false;
        clearGameTimer(chatId);
    }
}

async function checkRound(sock, chatId, game, prefix, msg) {
    if (!game) {
        await logMessage('debug', `checkRound skipped for ${chatId}: game is undefined`);
        return;
    }

    clearGameTimer(chatId);

    const responsesArray = Array.from(game.responses.entries());
    await logMessage('debug', `checkRound for ${chatId}: responses=${JSON.stringify(responsesArray)}, players=${JSON.stringify(game.players.map(p => p.jid))}, roundLock=${game.roundLock}`);

    const eliminated = game.players.filter(p => !game.responses.has(p.jid));
    
    let message = '';
    const mentions = [];
    
    if (eliminated.length > 0) {
        const eliminatedNames = await Promise.all(eliminated.map(async p => await getDisplayName(sock, p.jid, chatId, msg)));
        message += `⏰ Time's up! Eliminated: ${eliminatedNames.join(', ')}\n`;
        mentions.push(...eliminated.map(p => p.jid));
        
        game.players = game.players.filter(p => game.responses.has(p.jid));
    }
    
    if (game.players.length === 0) {
        message += `🏁 Game over! No winner - both players were eliminated.`;
        activeGames.delete(chatId);
        await logMessage('info', `Word game ended in ${chatId} with no winner - both players eliminated`);
    } else if (game.players.length === 1) {
        const winner = game.players[0];
        const winnerName = await getDisplayName(sock, winner.jid, chatId, msg);
        message += `🏆 Game over! Winner: ${winnerName}`;
        mentions.push(winner.jid);
        activeGames.delete(chatId);
        await logMessage('info', `Word game ended in ${chatId}, winner: ${winner.jid}`);
    } else {
        const remainingNames = await Promise.all(game.players.map(async p => await getDisplayName(sock, p.jid, chatId, msg)));
        message += `🎯 Remaining: ${remainingNames.join(', ')}\n🔄 Next round starting...`;
        mentions.push(...game.players.map(p => p.jid));
        
        game.roundLock = false;
        
        setTimeout(async () => {
            await startRound(sock, chatId, game, prefix, msg);
        }, 3000);
        
        await logMessage('info', `Word game round ${game.round} completed in ${chatId}, ${eliminated.length} players eliminated, ${game.players.length} remaining`);
    }

    try {
        await sendReaction(sock, msg, eliminated.length > 0 ? '⏰' : '🎉');
        await sock.sendMessage(chatId, { text: message, mentions });
    } catch (err) {
        await logMessage('error', `Error sending checkRound message in ${chatId}: ${err.message}`);
    }
}

export default async function wordgameCommands(sock, msg, command, args, storage, sender, chatId, role, prefix) {
    try {
        let game = activeGames.get(chatId);

        if (command === 'wordgame' || command === 'wg') {
            if (args[0] === 'forfeit') {
                if (!game || game.lobby || !game.players.some(p => p.jid === sender)) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'No active game or you are not a player.' });
                    return true;
                }
                
                clearGameTimer(chatId);
                const senderPlayer = game.players.find(p => p.jid === sender);
                game.players = game.players.filter(p => p.jid !== sender);
                
                let message = `${senderPlayer.name} has forfeited!`;
                const mentions = [sender];
                
                if (game.players.length === 0) {
                    message += `\n🏁 Game over! No winner - both players forfeited.`;
                    activeGames.delete(chatId);
                } else if (game.players.length === 1) {
                    const winner = game.players[0];
                    const winnerName = await getDisplayName(sock, winner.jid, chatId, msg);
                    message += `\n🏆 Game over! Winner: ${winnerName}`;
                    mentions.push(winner.jid);
                    activeGames.delete(chatId);
                } else {
                    const remainingNames = await Promise.all(game.players.map(async p => await getDisplayName(sock, p.jid, chatId, msg)));
                    message += `\n🎯 Remaining: ${remainingNames.join(', ')}\n🔄 Next round starting...`;
                    mentions.push(...game.players.map(p => p.jid));
                    
                    game.roundLock = false;
                    setTimeout(async () => {
                        await startRound(sock, chatId, game, prefix, msg);
                    }, 3000);
                }
                
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: message, mentions });
                return true;
            }

            if (args[0] === 'end') {
                if (!game || !game.players.some(p => p.jid === sender)) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'No active game or you are not a player.' });
                    return true;
                }
                
                clearGameTimer(chatId);
                const senderName = await getDisplayName(sock, sender, chatId, msg);
                activeGames.delete(chatId);
                
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, {
                    text: `Word game ended by ${senderName}.`,
                    mentions: [sender]
                });
                await logMessage('info', `Word game ended in ${chatId} by ${sender}`);
                return true;
            }

            if (game && !game.lobby) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'A word game is already active!' });
                return true;
            }

            if (args[0] === 'easy' || args[0] === 'medium' || args[0] === 'hard') {
                if (!game || !game.lobby) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'No active lobby to set difficulty.' });
                    return true;
                }
                game.difficulty = args[0];
                const baseTime = { easy: 45, medium: 40, hard: 35 }[args[0]];
                game.timeLimit = baseTime;
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `Difficulty set to ${args[0]}. Starting time: ${baseTime} seconds.` });
                return true;
            }

            const senderName = await getDisplayName(sock, sender, chatId, msg);
            const baseTime = { easy: 45, medium: 40, hard: 35 }[args[0] && ['easy', 'medium', 'hard'].includes(args[0].toLowerCase()) ? args[0].toLowerCase() : 'medium'];
            game = {
                lobby: true,
                players: [{ jid: sender, name: senderName }],
                difficulty: args[0] && ['easy', 'medium', 'hard'].includes(args[0].toLowerCase()) ? args[0].toLowerCase() : 'medium',
                baseTime: baseTime,
                timeLimit: baseTime,
                timeDecrement: { easy: 3, medium: 4, hard: 5 }[args[0] && ['easy', 'medium', 'hard'].includes(args[0].toLowerCase()) ? args[0].toLowerCase() : 'medium'],
                minLength: 3,
                round: 0,
                responses: new Map(),
                roundUsedWords: new Set(),
                gameUsedWords: new Set(),
                roundLock: false
            };
            activeGames.set(chatId, game);
            await sendReaction(sock, msg, '🎮');
            await sock.sendMessage(chatId, {
                text: `🎲 Word game lobby started on ${game.difficulty} mode by ${senderName}!\n⏱️ Starting time: ${baseTime} seconds\n📏 Starting word length: 3 letters\n\nUse ${prefix}wjoin to join, ${prefix}wg easy/medium/hard to set difficulty, or ${prefix}wstart to begin.`,
                mentions: [sender]
            });
            await logMessage('info', `Word game lobby started in ${chatId} by ${sender}, difficulty: ${game.difficulty}, baseTime: ${baseTime}`);
            return true;
        }

        if (command === 'wjoin') {
            if (!game || !game.lobby) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'No active word game lobby. Start one with /wordgame [easy/medium/hard].' });
                return true;
            }
            if (game.players.some(p => p.jid === sender)) {
                const senderName = await getDisplayName(sock, sender, chatId, msg);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, {
                    text: `${senderName}, you're already in the lobby!`,
                    mentions: [sender]
                });
                return true;
            }
            const senderName = await getDisplayName(sock, sender, chatId, msg);
            game.players.push({ jid: sender, name: senderName });
            await sendReaction(sock, msg, '✅');
            await sock.sendMessage(chatId, {
                text: `${senderName} joined the word game! Current players: ${game.players.length}`,
                mentions: [sender]
            });
            await logMessage('info', `${sender} joined word game lobby in ${chatId}`);
            return true;
        }

        if (command === 'wstart') {
            if (!game || !game.lobby) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'No active word game lobby. Start one with /wordgame [easy/medium/hard].' });
                return true;
            }
            if (game.players.length < 2) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Need at least 2 players to start!' });
                return true;
            }
            game.lobby = false;
            await startRound(sock, chatId, game, prefix, msg);
            return true;
        }

        if (command === 'w') {
            if (!game || game.lobby) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'No active word game round.' });
                await logMessage('debug', `No active round for ${chatId}: game=${!!game}, lobby=${game?.lobby}`);
                return true;
            }

            if (!game.roundLock) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Round has ended. Please wait for the next round.' });
                await logMessage('debug', `Round ended for ${chatId}, cannot accept submissions`);
                return true;
            }

            const player = game.players.find(p => p.jid === sender);
            if (!player) {
                const senderName = await getDisplayName(sock, sender, chatId, msg);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, {
                    text: `${senderName}, you're not in this game!`,
                    mentions: [sender]
                });
                return true;
            }
            if (game.responses.has(sender)) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, {
                    text: `${player.name}, you already submitted a word this round!`,
                    mentions: [sender]
                });
                return true;
            }
            const word = args[0]?.trim();
            if (!word || !/^[a-zA-Z]+$/.test(word) || word.length < game.minLength || !word.toLowerCase().startsWith(game.currentLetter.toLowerCase())) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, {
                    text: `${player.name}, invalid word! It must start with "${game.currentLetter}" and be at least ${game.minLength} letters.`,
                    mentions: [sender]
                });
                return true;
            }
            const lowerWord = word.toLowerCase();
            if (!wordCache.has(lowerWord)) {
                const valid = await validateWord(lowerWord);
                wordCache.set(lowerWord, valid);
                if (!valid) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, {
                        text: `${player.name}, "${word}" is not a valid dictionary word.`,
                        mentions: [sender]
                    });
                    return true;
                }
            } else if (!wordCache.get(lowerWord)) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, {
                    text: `${player.name}, "${word}" is not a valid dictionary word.`,
                    mentions: [sender]
                });
                return true;
            }
            if (game.gameUsedWords.has(lowerWord)) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, {
                    text: `${player.name}, "${word}" has already been used in this game.`,
                    mentions: [sender]
                });
                return true;
            }
            if (game.roundUsedWords.has(lowerWord)) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, {
                    text: `${player.name}, "${word}" has already been submitted in this round.`,
                    mentions: [sender]
                });
                return true;
            }
            game.responses.set(sender, word);
            game.roundUsedWords.add(lowerWord);
            game.gameUsedWords.add(lowerWord);
            
            const responsesArray = Array.from(game.responses.entries());
            await logMessage('debug', `Responses after ${sender} submission in ${chatId}: ${JSON.stringify(responsesArray)}`);
            
            await sendReaction(sock, msg, '✅');
            await sock.sendMessage(chatId, {
                text: `${player.name} submitted "${word}"!`,
                mentions: [sender]
            });
            await logMessage('info', `Word game move in ${chatId}, player: ${sender}, word: ${word}`);
            
            if (game.responses.size === game.players.length) {
                clearGameTimer(chatId);
                await logMessage('debug', `Calling checkRound for ${chatId} after all players responded`);
                await checkRound(sock, chatId, game, prefix, msg);
            }
            return true;
        }

        return false;
    } catch (error) {
        await logMessage('error', `Error in wordgame command ${command} for ${chatId}: ${error.message}`);
        await sendReaction(sock, msg, '❌');
        await sock.sendMessage(chatId, { text: 'An error occurred in the word game. Please try again.' });
        return false;
    }
}