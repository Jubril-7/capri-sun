import pino from 'pino';
import express from 'express';
import { config } from './config.js';
import { connectDB, closeDB } from './utils/mongodb.js';
import { getRole, isGroupApproved } from './middlewares/roles.js';
import { sendReaction } from './middlewares/reactions.js';
import { logMessage } from './utils/logger.js';
import { loadStorage, saveStorage, getGroups, getBans, getWarnings, getGames, updateGroup, updateBan, updateWarning, updateGame } from './utils/storage.js';
import systemCommands from './commands/system.js';
import adminCommands from './commands/admin.js';
import mediaCommands from './commands/media.js';
import hangmanCommands from './commands/games/hangman.js';
import tictactoeCommands from './commands/games/tictactoe.js';
import wordgameCommands from './commands/games/wordgame.js';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('CapriSun WhatsApp Bot is running fine!'));

let latestQR = null;
let qrHtml = '<h1>No QR code yet. Waiting for connection...</h1>';

app.get('/qr', (req, res) => {
    if (latestQR) {
        QRCode.toDataURL(latestQR, { scale: 8, margin: 2 }, (err, url) => {
            if (err) return res.status(500).send('QR generation failed');
            qrHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CapriSun - Scan QR</title>
    <style>
        body { font-family: system-ui, sans-serif; text-align: center; margin-top: 3rem; background: #f4f4f4; }
        .container { max-width: 420px; margin: 0 auto; padding: 2rem; background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        h1 { color: #25D366; }
        img { margin: 1.5rem 0; border: 8px solid #25D366; border-radius: 12px; }
        p { color: #555; }
        .refresh { margin-top: 1rem; font-size: 0.9rem; color: #888; }
    </style>
</head>
<body>
    <div class="container">
        <h1>CapriSun Bot</h1>
        <p>Scan this QR code with <strong>WhatsApp → Linked Devices</strong></p>
        <img src="${url}" alt="WhatsApp QR Code"/>
        <p class="refresh">QR expires in ~30s. Refresh page if needed.</p>
    </div>
</body>
</html>`;
            res.send(qrHtml);
        });
    } else {
        res.send(qrHtml);
    }
});

app.listen(PORT, () => console.log(`Health check server started on port ${PORT}`));

let sock;

async function handleWarningKick(chatId, sender) {
    try {
        const storage = await loadStorage();
        const groups = await getGroups();
        const warnings = await getWarnings();

        const role = await getRole(sock, sender, chatId, { ...storage, groups, bans: await getBans() });
        if (role !== 'owner') {
            await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
            await sock.sendMessage(chatId, { text: `@${sender.split('@')[0]} has been kicked for reaching 3 warnings.`, mentions: [sender] });
            await logMessage('info', `User ${sender} kicked from ${chatId} for reaching 3 warnings`);
        }
        await updateWarning(sender, 0);
    } catch (error) {
        await logMessage('error', `Failed to kick ${sender} for warnings: ${error.message}`);
    }
}

// Enhanced function to detect links in any content
function containsLink(text) {
    if (!text) return false;
    
    // Check for common URL patterns
    const urlPatterns = [
        /https?:\/\//i,                          // http:// or https://
        /www\./i,                                 // www.
        /\b[a-z0-9]+\.(com|net|org|io|co|me|app|dev|tech|ly|tv|to|gg|xyz|online|site|store|shop|biz|info)\b/i, // common domains
        /bit\.ly/i,                               // url shorteners
        /tinyurl\.com/i,
        /t\.co/i,
        /goo\.gl/i,
        /ow\.ly/i,
        /chat\.whatsapp\.com/i,                  // WhatsApp group links
        /wa\.me/i                                 // WhatsApp direct links
    ];
    
    return urlPatterns.some(pattern => pattern.test(text));
}

// Enhanced function to extract all text content from a message
function extractMessageContent(msg) {
    const contents = [];
    
    // Regular text message
    if (msg.message.conversation) {
        contents.push(msg.message.conversation);
    }
    
    // Extended text message
    if (msg.message.extendedTextMessage?.text) {
        contents.push(msg.message.extendedTextMessage.text);
    }
    
    // Image caption
    if (msg.message.imageMessage?.caption) {
        contents.push(msg.message.imageMessage.caption);
    }
    
    // Video caption
    if (msg.message.videoMessage?.caption) {
        contents.push(msg.message.videoMessage.caption);
    }
    
    // Document caption
    if (msg.message.documentMessage?.caption) {
        contents.push(msg.message.documentMessage.caption);
    }
    
    // Audio/PTT message (some apps allow links in audio metadata)
    if (msg.message.audioMessage?.caption) {
        contents.push(msg.message.audioMessage.caption);
    }
    
    // Sticker message (rarely has captions but checking for completeness)
    if (msg.message.stickerMessage?.caption) {
        contents.push(msg.message.stickerMessage.caption);
    }

    return contents.join(' ');
}

const ADMIN_COMMANDS = new Set(['admin', 'groupinfo', 'grouplink', 'kick', 'promote', 'demote', 'add', 'close', 'open', 'welcome', 'setwelcome', 'goodbye', 'setgoodbye', 'warn', 'warnings', 'clearwarn', 'delete', 'antilink', 'tag']);
const OWNER_COMMANDS = new Set(['ban', 'unban', 'accept', 'reject', 'status', 'setprefix', 'listgroups', 'removegroup']);

async function connectToWhatsApp() {
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = await import('@whiskeysockets/baileys');

    const silentLogger = pino({
        level: 'silent',
        base: null,
        timestamp: false
    });

    console.debug = () => { };
    console.trace = () => { };
    console.info = () => { };

    const AUTH_DIR = process.env.AUTH_DIR || 'auth_info';
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
        logger: silentLogger,
        auth: state
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            latestQR = qr;
            const domain = process.env.NF_PUBLIC_URL || '<your-service>.nf.app';
            console.log(`QR Ready`);
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(shouldReconnect ? 'Reconnecting...' : 'Logged out. Delete /data and rescan QR.');
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            console.log('Connected to WhatsApp');
            await logMessage('info', 'Connected to WhatsApp');
            latestQR = null;
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message) return;

            const chatId = msg.key.remoteJid;
            const isGroup = chatId.endsWith('@g.us');
            const sender = msg.key.fromMe ? sock.user.id : (msg.key.participant || msg.key.remoteJid);
            const fromMe = msg.key.fromMe;

            const storage = await loadStorage();
            const groups = await getGroups();
            const bans = await getBans();
            const warnings = await getWarnings();
            const games = await getGames();

            const fullStorage = {
                ...storage,
                groups,
                bans,
                warnings,
                games
            };

            let prefix = storage.prefix || config.prefix;

            const approved = await isGroupApproved(chatId, fullStorage);
            if (isGroup && !approved) {
                if (msg.message.conversation?.startsWith(`${prefix}alive`)) {
                    await handleUnapprovedGroup(sock, msg, chatId, fullStorage);
                }
                return;
            }

            const role = await getRole(sock, sender, chatId, fullStorage);
            if (role === 'banned' && !fromMe) return;

            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

            // Enhanced antilink check - runs for all messages in groups with antilink enabled
            if (isGroup && groups[chatId]?.antilink === 'on' && !fromMe) {
                // Check if sender is owner - only owners are exempt from antilink
                if (role !== 'owner') {
                    // Extract all content from the message
                    const messageContent = extractMessageContent(msg);
                    
                    // Check if the message contains any links
                    if (containsLink(messageContent)) {
                        await handleAntilink(sock, msg, chatId, sender, fullStorage);
                        return; // Stop processing this message
                    }
                }
            }

            if (!text.startsWith(prefix)) {
                return;
            }

            const [command, ...args] = text.slice(prefix.length).trim().split(/\s+/);
            const commandLower = command.toLowerCase();

            if (OWNER_COMMANDS.has(commandLower) && role !== 'owner') {
                await sendReaction(sock, msg, 'No');
                await sock.sendMessage(chatId, { text: 'This command is for bot owners only.' });
                return;
            }

            if (ADMIN_COMMANDS.has(commandLower) && role !== 'admin' && role !== 'owner') {
                await sendReaction(sock, msg, 'No');
                await sock.sendMessage(chatId, { text: 'This command is for group admins only.' });
                return;
            }

            let handled = await systemCommands(sock, msg, commandLower, args, fullStorage, sender, chatId, role, prefix);
            if (handled) return;

            handled = await adminCommands(sock, msg, commandLower, args, fullStorage, sender, chatId, role, prefix);
            if (handled) return;

            handled = await mediaCommands(sock, msg, commandLower, args, fullStorage, sender, chatId, role);
            if (handled) return;

            handled = await hangmanCommands(sock, msg, commandLower, args, fullStorage, sender, chatId, role, prefix);
            if (handled) return;

            handled = await tictactoeCommands(sock, msg, commandLower, args, fullStorage, sender, chatId, role, prefix);
            if (handled) return;

            handled = await wordgameCommands(sock, msg, commandLower, args, fullStorage, sender, chatId, role, prefix);
            if (handled) return;

            if (!handled) {
                await sendReaction(sock, msg, 'No');
                await sock.sendMessage(chatId, { text: `Unknown command: ${command}. Type ${prefix}help for available commands.` });
            }
        } catch (err) {
            if (String(err).includes('Bad MAC') || String(err).includes('decrypt')) {
                console.warn('Ignored Bad MAC/decrypt error');
            } else {
                console.error('messages.upsert error:', err);
            }
        }
    });

    sock.ev.on('group-participants.update', async ({ id: chatId, participants, action }) => {
        const groups = await getGroups();
        const groupSettings = groups[chatId];

        if (!groupSettings) return;

        if (action === 'add' && groupSettings.welcome === 'on') {
            const welcomeMsg = groupSettings.welcomeMessage || 'Welcome to the group! Intro...';
            for (const participant of participants) {
                const participantJid = typeof participant === 'string' ? participant : participant.id;
                const participantNumber = participantJid.split('@')[0];
                await sock.sendMessage(chatId, {
                    text: `${welcomeMsg} @${participantNumber}`,
                    mentions: [participantJid]
                });
            }
        }

        if (action === 'remove' && groupSettings.goodbye === 'on') {
            const goodbyeMsg = groupSettings.goodbyeMessage || 'Goodbye! We are sorry to see you go.';
            for (const participant of participants) {
                const participantJid = typeof participant === 'string' ? participant : participant.id;
                const participantNumber = participantJid.split('@')[0];
                await sock.sendMessage(chatId, {
                    text: `${goodbyeMsg} @${participantNumber}`,
                    mentions: [participantJid]
                });
            }
        }
    });
}

async function handleUnapprovedGroup(sock, msg, chatId, storage) {
    try {
        const groupMeta = await sock.groupMetadata(chatId);
        const groupName = groupMeta.subject;
        await sock.sendMessage(chatId, { text: 'This group is not approved. Request sent to control group.' });
        await sock.sendMessage(config.controlGroupId, {
            text: `New group request:\nName: ${groupName}\nID: ${chatId}\nUse ${config.prefix}accept ${chatId} or ${config.prefix}reject ${chatId}`
        });
    } catch (error) {
        await logMessage('error', `Failed to handle unapproved group ${chatId}: ${error.message}`);
    }
}

async function handleAntilink(sock, msg, chatId, sender, storage) {
    try {
        const warnings = storage.warnings[sender] || 0;
        const newWarnings = warnings + 1;
        await updateWarning(sender, newWarnings);

        // Send warning message
        await sock.sendMessage(chatId, { 
            text: `⚠️ @${sender.split('@')[0]}, links are not allowed in this group!\n\nWarning: ${newWarnings}/3\n${newWarnings >= 3 ? '❌ Maximum warnings reached. You will be removed.' : ''}`, 
            mentions: [sender] 
        });

        // Delete the message containing the link
        try {
            await sock.sendMessage(chatId, { delete: msg.key });
            await logMessage('info', `Deleted message with link from ${sender} in ${chatId}`);
        } catch (deleteError) {
            await logMessage('error', `Failed to delete message: ${deleteError.message}`);
        }

        // Kick user if they reached 3 warnings
        if (newWarnings >= 3) {
            await handleWarningKick(chatId, sender);
        }
    } catch (error) {
        await logMessage('error', `Error in handleAntilink: ${error.message}`);
    }
}

async function initializeBot() {
    try {
        await connectDB();
        await connectToWhatsApp();
    } catch (error) {
        console.error('Failed to initialize bot:', error);
        process.exit(1);
    }
}

initializeBot().catch(console.error);

process.on('SIGTERM', async () => {
    console.log('SIGTERM received – logging out...');
    if (sock) {
        try {
            await sock.logout();
        } catch (e) {
            console.warn('Logout failed:', e.message);
        }
    }
    await closeDB();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    if (String(err).includes('Bad MAC') || String(err).includes('decrypt')) {
        console.warn('Ignored uncaught decrypt error');
    } else {
        console.error('Uncaught Exception:', err);
    }
});

process.on('unhandledRejection', (reason) => {
    if (String(reason).includes('Bad MAC') || String(reason).includes('decrypt')) {
        console.warn('Ignored unhandled decrypt rejection');
    } else {
        console.error('Unhandled Rejection:', reason);
    }
});