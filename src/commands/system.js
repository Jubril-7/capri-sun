import os from 'os';
import { formatJID } from '../utils/helpers.js';
import { sendReaction } from '../middlewares/reactions.js';
import { logMessage } from '../utils/logger.js';
import { updatePrefix, getGroups, updateGroup, getApprovedGroups } from '../utils/storage.js';
import { config } from '../config.js';

export default async function systemCommands(sock, msg, command, args, storage, sender, chatId, role, prefix) {
    try {
        const OWNER_COMMANDS = new Set(['status', 'setprefix', 'listgroups', 'removegroup']);

        if (OWNER_COMMANDS.has(command) && role !== 'owner') {
            await sendReaction(sock, msg, '❌');
            await sock.sendMessage(chatId, { text: '👑 This command is for bot owner only.' });
            await logMessage('info', `Permission denied: ${sender} tried to use owner command ${command} in ${chatId}`);
            return true;
        }

        if (command === 'alive') {
            await sendReaction(sock, msg, '✅');
            await sock.sendMessage(chatId, { text: '¢əρяιѕυη is alive!' });
            return true;
        }

        if (command === 'ping') {
            const start = Date.now();
            await sendReaction(sock, msg, '✅');
            await sock.sendMessage(chatId, { text: `Pong ${Date.now() - start}ms` });
            return true;
        }

        if (command === 'uptime') {
            const uptime = process.uptime();
            await sendReaction(sock, msg, '✅');
            await sock.sendMessage(chatId, { text: `Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s` });
            return true;
        }

        if (command === 'status') {
            try {
                const cpu = os.loadavg()[0].toFixed(2);
                const memUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
                const memTotal = (os.totalmem() / 1024 / 1024).toFixed(2);
                const uptime = Math.floor(process.uptime() / 3600);
                const statusText = `Bot Status:\nCPU Load: ${cpu}\nMemory: ${memUsed} MB / ${memTotal} MB\nUptime: ${uptime}h`;
                await logMessage('info', `Sending status: ${statusText}`);
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: statusText });
                return true;
            } catch (error) {
                await logMessage('error', `Error in status command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error retrieving status. Please try again.' });
                return true;
            }
        }

        if (command === 'owner') {
            const ownerNumbers = config.ownerNumber.split(',').map(num => num.trim());
            const ownerDisplay = await Promise.all(ownerNumbers.map(id => formatJID(id)));
            await sendReaction(sock, msg, '✅');
            await sock.sendMessage(chatId, { text: `Bot owners:\n${ownerDisplay.join('\n')}` });
            return true;
        }

        if (command === 'grouplink') {
            try {
                if (!chatId.endsWith('@g.us')) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'This command can only be used in groups.' });
                    return true;
                }

                const groupMeta = await sock.groupMetadata(chatId);
                const inviteCode = await sock.groupInviteCode(chatId);
                const groupLink = `https://chat.whatsapp.com/${inviteCode}`;
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `Group Link for "${groupMeta.subject}":\n${groupLink}` });
                await logMessage('info', `Grouplink command executed: Generated link for ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in grouplink command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error generating group link. Please try again.' });
                return true;
            }
        }

        if (command === 'listgroups') {
            try {
                const approvedGroups = await getApprovedGroups();

                if (Object.keys(approvedGroups).length === 0) {
                    await sendReaction(sock, msg, 'ℹ️');
                    await sock.sendMessage(chatId, { text: 'No approved groups found.' });
                    return true;
                }

                let groupsList = `📋 *Approved Groups (${Object.keys(approvedGroups).length}):*\n\n`;

                for (const [chatId, group] of Object.entries(approvedGroups)) {
                    try {
                        const groupMeta = await sock.groupMetadata(chatId);
                        groupsList += `*Group:* ${groupMeta.subject}\n`;
                        groupsList += `*ID:* ${chatId}\n`;
                        groupsList += `*Members:* ${groupMeta.participants.length}\n`;
                        groupsList += `*Welcome:* ${group.welcome || 'off'}\n`;
                        groupsList += `*Goodbye:* ${group.goodbye || 'off'}\n`;  // Add this line
                        groupsList += `*Antilink:* ${group.antilink || 'off'}\n`;
                        groupsList += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                    } catch (error) {
                        groupsList += `*Group:* ${chatId} (Unable to fetch details)\n`;
                        groupsList += `*Welcome:* ${group.welcome || 'off'}\n`;
                        groupsList += `*Goodbye:* ${group.goodbye || 'off'}\n`;  // Add this line
                        groupsList += `*Antilink:* ${group.antilink || 'off'}\n`;
                        groupsList += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                    }
                }

                await sendReaction(sock, msg, '📋');
                await sock.sendMessage(chatId, { text: groupsList });
                await logMessage('info', `Listgroups command executed by ${sender}, showed ${Object.keys(approvedGroups).length} approved groups`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in listgroups command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error retrieving group list. Please try again.' });
                return true;
            }
        }
        if (command === 'removegroup') {
            try {
                if (args.length === 0) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please provide a group ID to remove.\nUsage: removegroup <groupId>' });
                    return true;
                }

                const groupId = args[0];

                // Validate if it's a proper group ID format
                if (!groupId.endsWith('@g.us')) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Invalid group ID format. Group ID should end with @g.us' });
                    return true;
                }

                const groups = await getGroups();
                const group = groups[groupId];

                if (!group) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: `Group ${groupId} not found in database.` });
                    return true;
                }

                if (!group.approved) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: `Group ${groupId} is not approved.` });
                    return true;
                }

                // Remove the group from approved list by setting approved to false
                await updateGroup(groupId, { approved: false, blocked: false });

                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `Group ${groupId} has been removed from approved list.\nThe group will need to send ${prefix}alive again to request approval.` });
                await logMessage('info', `Removegroup command executed by ${sender}, removed group: ${groupId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in removegroup command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error removing group. Please try again.' });
                return true;
            }
        }

        if (command === 'help') {
            const commandsList = [
                '*System Commands*',
                `${prefix}alive - Check if bot is active`,
                `${prefix}ping - Check response time`,
                `${prefix}uptime - Show bot uptime`,
                `${prefix}status - Show system info (Owner only)`,
                `${prefix}owner - Show owner contact`,
                `${prefix}grouplink - Get group invite link`,
                `${prefix}help - Show this menu`,
                role === 'admin' || role === 'owner' ? '*Admin Commands*' : '',
                `${prefix}admin - List group admins`,
                `${prefix}groupinfo - Show group details`,
                `${prefix}kick @user - Kick a user`,
                `${prefix}promote @user - Promote to admin`,
                `${prefix}demote @user - Demote from admin`,
                `${prefix}ban @user - Ban from bot (Owner)`,
                `${prefix}unban @user - Unban user (Owner)`,
                `${prefix}add @number - Add user`,
                `${prefix}close - Restrict group`,
                `${prefix}open - Open group`,
                `${prefix}welcome on/off - Toggle welcome`,
                `${prefix}setwelcome [text] - Set welcome msg`,
                `${prefix}goodbye on/off - Toggle goodbye`,
                `${prefix}setgoodbye [text] - Set goodbye msg`,
                `${prefix}warn @user - Warn user`,
                `${prefix}warnings @user - Check warnings`,
                `${prefix}clearwarn @user - Clear warnings`,
                `${prefix}delete - Delete replied msg`,
                `${prefix}antilink on/off - Toggle anti-link`,
                `${prefix}tag <message> - Tag all members`,
                role === 'owner' ? '*Owner Commands*' : '',
                `${prefix}accept <groupId> - Approve group`,
                `${prefix}reject <groupId> - Reject group`,
                `${prefix}setprefix <prefix> - Change prefix`,
                `${prefix}listgroups - List all approved groups`,
                `${prefix}removegroup <groupId> - Remove group from approved list`,
                '*Media Commands*',
                `${prefix}sticker - Make sticker`,
                `${prefix}toimg - Sticker to image`,
                '*Game Commands*',
                `${prefix}hangman - Start hangman`,
                `${prefix}guess <letter> - Guess letter`,
                `${prefix}hg forfeit - Forfeit hangman`,
                `${prefix}tictactoe @user - Start Tic Tac Toe`,
                `${prefix}m {1-9} - Make move`,
                `${prefix}ttt forfeit - Forfeit Tic Tac Toe`,
                `${prefix}wordgame [easy/medium/hard] - Start word game`,
                `${prefix}wjoin - Join word game`,
                `${prefix}wstart - Start word game`,
                `${prefix}w <word> - Submit word`,
                `${prefix}wg forfeit - Forfeit word game`,
            ].filter(line => line).join('\n');
            await sendReaction(sock, msg, '✅');
            await sock.sendMessage(chatId, { text: commandsList });
            return true;
        }

        if (command === 'setprefix') {
            if (args.length === 0) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Please provide a new prefix.' });
                return true;
            }
            await updatePrefix(args[0]);
            await sendReaction(sock, msg, '✅');
            await sock.sendMessage(chatId, { text: `Prefix updated to ${args[0]}` });
            return true;
        }

        return false;
    } catch (error) {
        await logMessage('error', `Error in systemCommands for ${command}: ${error.message}`);
        await sendReaction(sock, msg, '❌');
        await sock.sendMessage(chatId, { text: 'An error occurred in system commands. Please try again.' });
        return false;
    }
}