import { sendReaction } from '../../middlewares/reactions.js';
import { logMessage } from '../../utils/logger.js';
import { updateGame, getGames } from '../../utils/storage.js';

const metadataCache = new Map();
const profileNameCache = new Map();

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

function renderBoard(board) {
    const symbols = { null: '⬜', 'X': '❌', 'O': '⭕' };
    return board.reduce((str, cell, i) => {
        str += symbols[cell] || '⬜';
        if (i % 3 === 2) {
            str += '\n';
            if (i !== 8) str += '------+------+------\n';
        } else {
            str += ' | ';
        }
        return str;
    }, '');
}

function checkWinner(board) {
    const wins = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of wins) {
        if (board[a] && board[a] === board[b] && board[b] === board[c]) {
            return board[a];
        }
    }
    return null;
}

export default async function tictactoeCommands(sock, msg, command, args, storage, sender, chatId, role, prefix) {
    try {
        const games = await getGames();
        let game = games.tictactoe?.[chatId];

        if (command === 'tictactoe' || command === 'ttt') {
            if (args[0] === 'forfeit') {
                if (!game || !game.active || !game.players.includes(sender)) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'No active game or you are not a player.' });
                    return true;
                }
                const player1Name = await getDisplayName(sock, game.players[0], chatId, msg);
                const player2Name = await getDisplayName(sock, game.players[1], chatId, msg);
                const winner = game.players[game.players[0] === sender ? 1 : 0];
                const winnerName = game.players[0] === sender ? player2Name : player1Name;
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, {
                    text: `${player1Name === (await getDisplayName(sock, sender, chatId, msg)) ? player1Name : player2Name} forfeited. ${winnerName} wins!`,
                    mentions: [sender, winner]
                });
                
                const updatedGames = { ...games };
                delete updatedGames.tictactoe[chatId];
                await updateGame(chatId, updatedGames);
                
                await logMessage('info', `Tic Tac Toe forfeited in ${chatId} by ${sender}, winner: ${winner}`);
                return true;
            }

            if (game && game.active) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'A Tic Tac Toe game is already active!' });
                return true;
            }
            if (!msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Please tag a user to play with.' });
                return true;
            }
            const opponent = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
            const metadata = await sock.groupMetadata(chatId);
            if (!metadata.participants.some(p => p.id === opponent)) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Tagged user is not a participant in this group.' });
                return true;
            }
            if (opponent === sender) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'You cannot play against yourself.' });
                return true;
            }
            const player1Name = await getDisplayName(sock, sender, chatId, msg);
            const player2Name = await getDisplayName(sock, opponent, chatId, msg);
            
            const gameData = {
                active: true,
                players: [sender, opponent],
                board: Array(9).fill(null),
                turn: 0
            };
            
            const updatedGames = { ...games };
            updatedGames.tictactoe = updatedGames.tictactoe || {};
            updatedGames.tictactoe[chatId] = gameData;
            await updateGame(chatId, updatedGames);
            
            await sendReaction(sock, msg, '🎮');
            await sock.sendMessage(chatId, {
                text: `Tic Tac Toe: ${player1Name} (❌) vs ${player2Name} (⭕)\n${renderBoard(gameData.board)}\n${player1Name}'s turn (❌). Use ${prefix}m {1-9}`,
                mentions: [sender, opponent]
            });
            await logMessage('info', `Tic Tac Toe started in ${chatId}: ${sender} (X) vs ${opponent} (O)`);
            return true;
        }

        if (command === 'm') {
            if (!game || !game.active || !game.players.includes(sender)) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'No active game or you are not a player.' });
                return true;
            }
            if (game.players[game.turn % 2] !== sender) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Not your turn!' });
                return true;
            }
            const move = parseInt(args[0]) - 1;
            if (isNaN(move) || move < 0 || move > 8 || game.board[move]) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: `Invalid move. Use ${prefix}m {1-9} for an empty cell.` });
                return true;
            }
            
            const newBoard = [...game.board];
            newBoard[move] = game.turn % 2 === 0 ? 'X' : 'O';
            const newTurn = game.turn + 1;
            
            const winner = checkWinner(newBoard);
            const player1Name = await getDisplayName(sock, game.players[0], chatId, msg);
            const player2Name = await getDisplayName(sock, game.players[1], chatId, msg);
            
            if (winner) {
                await sendReaction(sock, msg, '🎉');
                await sock.sendMessage(chatId, {
                    text: `${winner === 'X' ? player1Name : player2Name} wins!\n${renderBoard(newBoard)}`,
                    mentions: [winner === 'X' ? game.players[0] : game.players[1]]
                });
                
                const updatedGames = { ...games };
                delete updatedGames.tictactoe[chatId];
                await updateGame(chatId, updatedGames);
                
                await logMessage('info', `Tic Tac Toe ended in ${chatId}, winner: ${winner === 'X' ? game.players[0] : game.players[1]}`);
                return true;
            }
            
            if (!newBoard.includes(null)) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: `Draw!\n${renderBoard(newBoard)}` });
                
                const updatedGames = { ...games };
                delete updatedGames.tictactoe[chatId];
                await updateGame(chatId, updatedGames);
                
                await logMessage('info', `Tic Tac Toe ended in ${chatId}, result: draw`);
                return true;
            }
            
            await sendReaction(sock, msg, '✅');
            await sock.sendMessage(chatId, {
                text: `${renderBoard(newBoard)}\n${newTurn % 2 === 0 ? player1Name : player2Name}'s turn (${newTurn % 2 === 0 ? '❌' : '⭕'}). Use ${prefix}m {1-9}`,
                mentions: [newTurn % 2 === 0 ? game.players[0] : game.players[1]]
            });
            
            const updatedGames = { ...games };
            updatedGames.tictactoe[chatId] = {
                ...game,
                board: newBoard,
                turn: newTurn
            };
            await updateGame(chatId, updatedGames);
            
            await logMessage('info', `Tic Tac Toe move in ${chatId}, player: ${sender}, move: ${move + 1}`);
            return true;
        }

        return false;
    } catch (error) {
        await logMessage('error', `Error in tictactoe command ${command} for ${chatId}: ${error.message}`);
        await sendReaction(sock, msg, '❌');
        await sock.sendMessage(chatId, { text: 'An error occurred in the Tic Tac Toe game. Please try again.' });
        return false;
    }
}