import axios from 'axios';
import { sendReaction } from '../../middlewares/reactions.js';
import { logMessage } from '../../utils/logger.js';
import { updateGame, getGames } from '../../utils/storage.js';
import { validateWord } from '../../utils/dictionary.js';

export default async function hangmanCommands(sock, msg, command, args, storage, sender, chatId, role, prefix) {
    try {
        const games = await getGames();
        let game = games.hangman?.[chatId];

        if (game && game.guessed && Array.isArray(game.guessed)) {
            game.guessed = new Set(game.guessed);
        }

        if (command === 'hangman' || (command === 'hg' && !args[0])) {
            if (game && game.active) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'A hangman game is already active!' });
                return true;
            }
            try {
                const { data: [word] } = await axios.get('https://random-word-api.vercel.app/api?words=1');
                if (!await validateWord(word)) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Failed to fetch a valid word. Try again.' });
                    return true;
                }
                
                const gameData = {
                    active: true,
                    player: sender,
                    word: word.toLowerCase(),
                    guessed: Array.from(new Set()),
                    attempts: 6
                };
                
                const updatedGames = { ...games };
                updatedGames.hangman = updatedGames.hangman || {};
                updatedGames.hangman[chatId] = gameData;
                await updateGame(chatId, updatedGames);
                
                await sendReaction(sock, msg, '🎮');
                await sock.sendMessage(chatId, { text: `Hangman started by @${sender.split('@')[0]}!\nWord: ${word.split('').map(() => '_').join(' ')}\nAttempts left: 6`, mentions: [sender] });
                await logMessage('info', `Hangman game started in ${chatId} by ${sender}, word: ${word}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error starting hangman game in ${chatId}: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error starting hangman game. Please try again.' });
                return true;
            }
        }

        if (command === 'guess') {
            if (!game || !game.active || game.player !== sender) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'No active game or you are not the player.' });
                return true;
            }
            if (!args[0] || args[0].length !== 1 || !/[a-z]/i.test(args[0])) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Please guess a single letter.' });
                return true;
            }
            const letter = args[0].toLowerCase();
            if (game.guessed.includes(letter)) {
                await sendReaction(sock, msg, '⚠️');
                await sock.sendMessage(chatId, { text: 'Letter already guessed!' });
                return true;
            }
            
            const newGuessed = [...game.guessed, letter];
            let reaction = '✅';
            let newAttempts = game.attempts;
            
            if (!game.word.includes(letter)) {
                newAttempts -= 1;
                reaction = '❌';
            }
            
            const display = game.word.split('').map(l => newGuessed.includes(l) ? l : '_').join(' ');
            
            if (newAttempts <= 0) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: `Game over! The word was ${game.word}.` });
                
                const updatedGames = { ...games };
                delete updatedGames.hangman[chatId];
                await updateGame(chatId, updatedGames);
                
                await logMessage('info', `Hangman game ended in ${chatId}, word: ${game.word}, reason: no attempts left`);
                return true;
            }
            
            if (!display.includes('_')) {
                await sendReaction(sock, msg, '🎉');
                await sock.sendMessage(chatId, { text: `Congratulations @${sender.split('@')[0]}! You guessed ${game.word}!`, mentions: [sender] });
                
                const updatedGames = { ...games };
                delete updatedGames.hangman[chatId];
                await updateGame(chatId, updatedGames);
                
                await logMessage('info', `Hangman game ended in ${chatId}, word: ${game.word}, reason: word guessed`);
                return true;
            }
            
            await sendReaction(sock, msg, reaction);
            await sock.sendMessage(chatId, { text: `Word: ${display}\nAttempts left: ${newAttempts}` });
            
            const updatedGames = { ...games };
            updatedGames.hangman[chatId] = {
                ...game,
                guessed: newGuessed,
                attempts: newAttempts
            };
            await updateGame(chatId, updatedGames);
            
            await logMessage('info', `Hangman guess in ${chatId}, letter: ${letter}, word: ${display}, attempts: ${newAttempts}`);
            return true;
        }

        if (command === 'hg' && args[0] === 'forfeit') {
            if (!game || !game.active || game.player !== sender) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'No active game or you are not the player.' });
                return true;
            }
            await sendReaction(sock, msg, '❌');
            await sock.sendMessage(chatId, { text: `Game forfeited by @${sender.split('@')[0]}. The word was ${game.word}.`, mentions: [sender] });
            
            const updatedGames = { ...games };
            delete updatedGames.hangman[chatId];
            await updateGame(chatId, updatedGames);
            
            await logMessage('info', `Hangman game forfeited in ${chatId} by ${sender}, word: ${game.word}`);
            return true;
        }

        return false;
    } catch (error) {
        await logMessage('error', `Error in hangman command ${command} for ${chatId}: ${error.message}`);
        await sendReaction(sock, msg, '❌');
        await sock.sendMessage(chatId, { text: 'An error occurred in the hangman game. Please try again.' });
        return false;
    }
}