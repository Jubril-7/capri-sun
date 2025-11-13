import { formatJID } from '../utils/helpers.js';
import { sendReaction } from '../middlewares/reactions.js';
import { logMessage } from '../utils/logger.js';
import { updateGroup, updateBan, updateWarning, getGroups, getBans, getWarnings } from '../utils/storage.js';
import { getRole } from '../middlewares/roles.js';

export default async function adminCommands(sock, msg, command, args, storage, sender, chatId, role, prefix) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sendReaction(sock, msg, '❌');
            await sock.sendMessage(chatId, { text: 'Admin commands can only be used in groups.' });
            return true;
        }

        const adminCommands = ['admin', 'groupinfo', 'grouplink', 'kick', 'promote', 'demote', 'add', 'close', 'open', 'welcome', 'setwelcome', 'warn', 'warnings', 'clearwarn', 'delete', 'antilink', 'tag'];
        const ownerCommands = ['ban', 'unban', 'accept', 'reject'];

        if (adminCommands.includes(command) && role !== 'admin' && role !== 'owner') {
            await sendReaction(sock, msg, '❌');
            await sock.sendMessage(chatId, { text: '⛔ This command is for admins only.' });
            await logMessage('info', `Permission denied: ${sender} tried to use admin command ${command} in ${chatId}`);
            return true;
        }

        if (ownerCommands.includes(command) && role !== 'owner') {
            await sendReaction(sock, msg, '❌');
            await sock.sendMessage(chatId, { text: '👑 This command is for bot owner only.' });
            await logMessage('info', `Permission denied: ${sender} tried to use owner command ${command} in ${chatId}`);
            return true;
        }

        if (command === 'admin') {
            try {
                const groupMeta = await sock.groupMetadata(chatId);
                const admins = groupMeta.participants.filter(p => p.admin);

                if (admins.length === 0) {
                    await sock.sendMessage(chatId, { text: 'No admins found in this group.' });
                    return true;
                }

                const adminList = admins.map(a => a.id);
                const mentions = adminList;

                const names = await Promise.all(adminList.map(async (id) => {
                    try {
                        const contact = sock.contacts?.[id];
                        const name =
                            contact?.name ||
                            contact?.verifiedName ||
                            contact?.notify ||
                            id.split('@')[0];
                        return name;
                    } catch {
                        return id.split('@')[0];
                    }
                }));

                const text = `👑 *Group Admins:*\n\n${names
                    .map((_, i) => `• @${adminList[i].split('@')[0]}`)
                    .join('\n')}`;

                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text, mentions });

                await logMessage('info', `Admin command executed: Listed admins for ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in admin command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error listing admins. Please try again.' });
                return true;
            }
        }

        if (command === 'groupinfo') {
            try {
                const groupMeta = await sock.groupMetadata(chatId);
                const text = `Group: ${groupMeta.subject}\nID: ${chatId}\nMembers: ${groupMeta.participants.length}\nCreated: ${new Date(groupMeta.creation * 1000).toLocaleString()}`;
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text });
                await logMessage('info', `Groupinfo command executed: Details for ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in groupinfo command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error retrieving group info. Please try again.' });
                return true;
            }
        }

        if (command === 'grouplink') {
            try {
                const groupMeta = await sock.groupMetadata(chatId);
                const inviteCode = await sock.groupInviteCode(chatId);
                const groupLink = `https://chat.whatsapp.com/${inviteCode}`;
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `Group Link:\n${groupLink}` });
                await logMessage('info', `Grouplink command executed: Generated link for ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in grouplink command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error generating group link. Please try again.' });
                return true;
            }
        }

        if (command === 'kick') {
            try {
                let user;

                if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                    user = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                }
                else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
                    user = msg.message.extendedTextMessage.contextInfo.participant;
                }
                else {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please tag a user or reply to their message to kick.' });
                    return true;
                }

                await sock.groupParticipantsUpdate(chatId, [user], 'remove');
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `@${user.split('@')[0]} has been kicked.`, mentions: [user] });
                await logMessage('info', `Kick command executed: Kicked ${user} from ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in kick command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error kicking user. Please try again.' });
                return true;
            }
        }

        if (command === 'promote') {
            try {
                let user;

                if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                    user = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                }
                else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
                    user = msg.message.extendedTextMessage.contextInfo.participant;
                }
                else {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please tag a user or reply to their message to promote.' });
                    return true;
                }

                await sock.groupParticipantsUpdate(chatId, [user], 'promote');
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `@${user.split('@')[0]} has been promoted to admin.`, mentions: [user] });
                await logMessage('info', `Promote command executed: Promoted ${user} to admin in ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in promote command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error promoting user. Please try again.' });
                return true;
            }
        }

        if (command === 'demote') {
            try {
                let user;

                if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                    user = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                }
                else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
                    user = msg.message.extendedTextMessage.contextInfo.participant;
                }
                else {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please tag a user or reply to their message to demote.' });
                    return true;
                }

                await sock.groupParticipantsUpdate(chatId, [user], 'demote');
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `@${user.split('@')[0]} has been demoted from admin.`, mentions: [user] });
                await logMessage('info', `Demote command executed: Demoted ${user} from admin in ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in demote command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error demoting user. Please try again.' });
                return true;
            }
        }

        if (command === 'ban') {
            try {
                let user;

                if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                    user = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                }
                else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
                    user = msg.message.extendedTextMessage.contextInfo.participant;
                }
                else {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please tag a user or reply to their message to ban.' });
                    return true;
                }

                await updateBan(user, true);
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `@${user.split('@')[0]} has been banned from using the bot.`, mentions: [user] });
                await logMessage('info', `Ban command executed: Banned ${user} from bot usage`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in ban command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error banning user. Please try again.' });
                return true;
            }
        }

        if (command === 'unban') {
            try {
                if (!msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length && !args[0]) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please tag a user or provide a phone number to unban.' });
                    return true;
                }
                const user = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0].replace('+', '') + '@s.whatsapp.net';

                const bans = await getBans();
                if (!bans[user]) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: `@${user.split('@')[0]} is not banned.`, mentions: [user] });
                    return true;
                }

                await updateBan(user, false);
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `@${user.split('@')[0]} has been unbanned.`, mentions: [user] });
                await logMessage('info', `Unban command executed: Unbanned ${user}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in unban command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error unbanning user. Please try again.' });
                return true;
            }
        }

        if (command === 'add') {
            try {
                if (!args[0]) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please provide a phone number to add.' });
                    return true;
                }
                const user = args[0].replace('+', '') + '@s.whatsapp.net';
                await sock.groupParticipantsUpdate(chatId, [user], 'add');
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `@${user.split('@')[0]} has been added.`, mentions: [user] });
                await logMessage('info', `Add command executed: Added ${user} to ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in add command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error adding user. Please try again.' });
                return true;
            }
        }

        if (command === 'close') {
            try {
                await sock.groupSettingUpdate(chatId, 'announcement');
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: 'Group is now restricted to admins.' });
                await logMessage('info', `Close command executed: Restricted ${chatId} to admins`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in close command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error restricting group. Please try again.' });
                return true;
            }
        }

        if (command === 'open') {
            try {
                await sock.groupSettingUpdate(chatId, 'not_announcement');
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: 'Group is now open to all members.' });
                await logMessage('info', `Open command executed: Opened ${chatId} to all members`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in open command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error opening group. Please try again.' });
                return true;
            }
        }

        if (command === 'welcome') {
            try {
                if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Usage: welcome on/off' });
                    return true;
                }
                await updateGroup(chatId, { welcome: args[0].toLowerCase() });
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `Welcome message turned ${args[0].toLowerCase()}.` });
                await logMessage('info', `Welcome command executed: Set welcome to ${args[0].toLowerCase()} for ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in welcome command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error setting welcome message. Please try again.' });
                return true;
            }
        }

        if (command === 'setwelcome') {
            try {
                if (args.length === 0) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please provide a welcome message.' });
                    return true;
                }
                await updateGroup(chatId, { welcomeMessage: args.join(' ') });
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `Welcome message set to: ${args.join(' ')}` });
                await logMessage('info', `Setwelcome command executed: Set welcome message to "${args.join(' ')}" for ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in setwelcome command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error setting welcome message. Please try again.' });
                return true;
            }
        }

        if (command === 'goodbye') {
            try {
                if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Usage: goodbye on/off' });
                    return true;
                }
                await updateGroup(chatId, { goodbye: args[0].toLowerCase() });
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `Goodbye message turned ${args[0].toLowerCase()}.` });
                await logMessage('info', `Goodbye command executed: Set goodbye to ${args[0].toLowerCase()} for ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in goodbye command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error setting goodbye message. Please try again.' });
                return true;
            }
        }

        if (command === 'setgoodbye') {
            try {
                if (args.length === 0) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please provide a goodbye message.' });
                    return true;
                }
                await updateGroup(chatId, { goodbyeMessage: args.join(' ') });
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `Goodbye message set to: ${args.join(' ')}` });
                await logMessage('info', `Setgoodbye command executed: Set goodbye message to "${args.join(' ')}" for ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in setgoodbye command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error setting goodbye message. Please try again.' });
                return true;
            }
        }

        if (command === 'warn') {
            try {
                let user;

                if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                    user = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                }
                else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
                    user = msg.message.extendedTextMessage.contextInfo.participant;
                }
                else {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please tag a user or reply to their message to warn.' });
                    return true;
                }

                const warnings = await getWarnings();
                const newCount = (warnings[user] || 0) + 1;
                await updateWarning(user, newCount);

                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `@${user.split('@')[0]} has been warned. Total warnings: ${newCount}/3.`, mentions: [user] });
                await logMessage('info', `Warn command executed: Warned ${user} in ${chatId}, total warnings: ${newCount}`);

                if (newCount >= 3) {
                    const userRole = await getRole(sock, user, chatId, { ...storage, bans: await getBans() });
                    if (userRole !== 'owner') {
                        await sock.groupParticipantsUpdate(chatId, [user], 'remove');
                        await sock.sendMessage(chatId, { text: `@${user.split('@')[0]} has been kicked for reaching 3 warnings.`, mentions: [user] });
                        await logMessage('info', `User ${user} kicked from ${chatId} for reaching 3 warnings via warn command`);
                    }
                    await updateWarning(user, 0);
                }

                return true;
            } catch (error) {
                await logMessage('error', `Error in warn command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error warning user. Please try again.' });
                return true;
            }
        }

        if (command === 'warnings') {
            try {
                let user;

                if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                    user = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                }
                else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
                    user = msg.message.extendedTextMessage.contextInfo.participant;
                }
                else {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please tag a user or reply to their message to check warnings.' });
                    return true;
                }

                const warnings = await getWarnings();
                const count = warnings[user] || 0;
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `@${user.split('@')[0]} has ${count} warnings.`, mentions: [user] });
                await logMessage('info', `Warnings command executed: Checked warnings for ${user} in ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in warnings command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error checking warnings. Please try again.' });
                return true;
            }
        }

        if (command === 'clearwarn') {
            try {
                let user;

                if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                    user = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                }
                else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
                    user = msg.message.extendedTextMessage.contextInfo.participant;
                }
                else {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please tag a user or reply to their message to clear warnings.' });
                    return true;
                }

                await updateWarning(user, 0);
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `@${user.split('@')[0]} warnings cleared.`, mentions: [user] });
                await logMessage('info', `Clearwarn command executed: Cleared warnings for ${user} in ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in clearwarn command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error clearing warnings. Please try again.' });
                return true;
            }
        }

        if (command === 'delete') {
            try {
                if (!msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please reply to a message to delete.' });
                    return true;
                }
                const quotedMsg = msg.message.extendedTextMessage.contextInfo;
                await sock.sendMessage(chatId, { delete: { remoteJid: chatId, fromMe: false, id: quotedMsg.stanzaId, participant: quotedMsg.participant } });
                await sendReaction(sock, msg, '✅');
                await logMessage('info', `Delete command executed: Deleted message ${quotedMsg.stanzaId} in ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in delete command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error deleting message. Please try again.' });
                return true;
            }
        }

        if (command === 'antilink') {
            try {
                if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Usage: antilink on/off' });
                    return true;
                }
                await updateGroup(chatId, { antilink: args[0].toLowerCase() });
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `Antilink turned ${args[0].toLowerCase()}.` });
                await logMessage('info', `Antilink command executed: Set antilink to ${args[0].toLowerCase()} for ${chatId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in antilink command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error setting antilink. Please try again.' });
                return true;
            }
        }

        if (command === 'accept') {
            try {
                if (!args[0]) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please provide a group ID to accept.' });
                    return true;
                }
                const groupId = args[0];

                // Set default settings: welcome on, antilink on, goodbye on
                await updateGroup(groupId, {
                    approved: true,
                    blocked: false,
                    welcome: 'on',
                    antilink: 'on',
                    goodbye: 'on',
                    welcomeMessage: 'Welcome to the group! Please read the group rules.',
                    goodbyeMessage: 'Goodbye! We are sorry to see you go.'
                });

                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `Group ${groupId} has been approved.\nDefault settings: Welcome ✅ | Anti-link ✅ | Goodbye ❌` });
                await logMessage('info', `Accept command executed: Approved group ${groupId} with default settings`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in accept command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error approving group. Please try again.' });
                return true;
            }
        }


        if (command === 'reject') {
            try {
                if (!args[0]) {
                    await sendReaction(sock, msg, '❌');
                    await sock.sendMessage(chatId, { text: 'Please provide a group ID to reject.' });
                    return true;
                }
                const groupId = args[0];
                await updateGroup(groupId, { blocked: true, approved: false });
                await sendReaction(sock, msg, '✅');
                await sock.sendMessage(chatId, { text: `Group ${groupId} has been rejected.` });
                await logMessage('info', `Reject command executed: Rejected group ${groupId}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in reject command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error rejecting group. Please try again.' });
                return true;
            }
        }

        if (command === 'tag') {
            try {
                const groupMeta = await sock.groupMetadata(chatId);
                const members = groupMeta.participants.map(p => p.id);

                let message;

                if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
                    const quotedMsg = msg.message.extendedTextMessage.contextInfo;
                    const quotedText = quotedMsg.quotedMessage.conversation ||
                        quotedMsg.quotedMessage.extendedTextMessage?.text ||
                        '[Media Message]';
                    message = `${quotedText}\n\n${args.join(' ')}`;

                    await sendReaction(sock, msg, '✅');
                    await sock.sendMessage(chatId, {
                        text: message,
                        mentions: members,
                        contextInfo: {
                            mentionedJid: members,
                            stanzaId: quotedMsg.stanzaId,
                            participant: quotedMsg.participant,
                            remoteJid: chatId,
                            quotedMessage: quotedMsg.quotedMessage
                        }
                    });
                } else {
                    if (args.length === 0) {
                        await sendReaction(sock, msg, '❌');
                        await sock.sendMessage(chatId, { text: 'Please provide a message to tag all members.' });
                        return true;
                    }
                    message = args.join(' ');

                    await sendReaction(sock, msg, '✅');
                    await sock.sendMessage(chatId, {
                        text: message,
                        mentions: members,
                        contextInfo: {
                            mentionedJid: members,
                            participant: sender,
                            stanzaId: msg.key.id,
                            remoteJid: chatId
                        }
                    });
                }

                await logMessage('info', `Tag command executed: Tagged all members in ${chatId} with message "${message}" by ${sender}`);
                return true;
            } catch (error) {
                await logMessage('error', `Error in tag command: ${error.message}`);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error tagging members. Please try again.' });
                return true;
            }
        }

        return false;
    } catch (error) {
        await logMessage('error', `Error in adminCommands for ${command}: ${error.message}`);
        await sendReaction(sock, msg, '❌');
        await sock.sendMessage(chatId, { text: 'An error occurred in admin commands. Please try again.' });
        return false;
    }
}