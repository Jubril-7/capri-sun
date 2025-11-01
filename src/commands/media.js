import { sendReaction } from '../middlewares/reactions.js';
import { logMessage } from '../utils/logger.js';
import sharp from 'sharp';

export default async function mediaCommands(sock, msg, command, args, storage, sender, chatId, role) {
    let quotedMsg = null;

    const resizeToStickerSize = async (buffer) => {
        try {
            const image = sharp(buffer);
            const metadata = await image.metadata();
            const { width, height } = metadata;
            const targetSize = 512;

            if (width === height) {
                return await image
                    .resize(targetSize, targetSize)
                    .webp({ quality: 80, effort: 6 })
                    .toBuffer();
            } else {
                return await image
                    .resize(targetSize, targetSize, {
                        fit: 'cover',
                        position: 'center'
                    })
                    .webp({ quality: 80, effort: 6 })
                    .toBuffer();
            }
        } catch (error) {
            await logMessage('error', `Error resizing image: ${error.message}`);
            throw error;
        }
    };

    const processVideoForSticker = async (buffer) => {
        try {
            return await sharp(buffer, { animated: true })
                .resize(512, 512, {
                    fit: 'cover',
                    position: 'center'
                })
                .webp({ quality: 80, effort: 6 })
                .toBuffer();
        } catch (error) {
            await logMessage('error', `Error processing video for sticker: ${error.message}`);
            throw error;
        }
    };

    const createSticker = async (msg, chatId, quotedMsg, sender) => {
        let imageMsg = msg.message?.imageMessage;
        let videoMsg = msg.message?.videoMessage;

        if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
            imageMsg = imageMsg || quotedMsg.imageMessage;
            videoMsg = videoMsg || quotedMsg.videoMessage;
        }

        if (!imageMsg && !videoMsg) {
            await sendReaction(sock, msg, '❌');
            await sock.sendMessage(chatId, { text: 'Please send or reply to an image/video.' });
            await logMessage('info', `Sticker command failed in ${chatId}: No image or video found`);
            return false;
        }

        try {
            const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
            const isQuoted = !!quotedMsg && (quotedMsg.imageMessage || quotedMsg.videoMessage);
            const mediaMsg = isQuoted ? { 
                key: { 
                    remoteJid: chatId, 
                    id: msg.message.extendedTextMessage.contextInfo.stanzaId, 
                    participant: msg.message.extendedTextMessage.contextInfo.participant 
                }, 
                message: quotedMsg 
            } : msg;

            const buffer = await downloadMediaMessage(mediaMsg, 'buffer', {}, { 
                logger: { 
                    warn: (msg) => logMessage('warn', msg), 
                    error: (msg) => logMessage('error', msg) 
                } 
            });

            let webpBuffer;
            if (videoMsg) {
                webpBuffer = await processVideoForSticker(buffer);
            } else {
                webpBuffer = await resizeToStickerSize(buffer);
            }

            await sock.sendMessage(chatId, { 
                sticker: webpBuffer,
                isAnimated: !!videoMsg,
                packname: "ωнιмѕι¢αℓ ¢əρяιѕυη - вℓσσ∂ℓιηє",
                author: `@${sender.split('@')[0]}`
            });

            await sendReaction(sock, msg, '✅');
            await logMessage('info', `Sticker created successfully in ${chatId} by ${sender}`);
            return true;
        } catch (error) {
            await sendReaction(sock, msg, '❌');
            await sock.sendMessage(chatId, { text: 'Error creating sticker. Please try again.' });
            await logMessage('error', `Sticker creation error in ${chatId}: ${error.message}`);
            return false;
        }
    };

    switch (command) {
        case 'sticker':
        case 's': {
            return await createSticker(msg, chatId, quotedMsg, sender);
        }

        case 'toimg': {
            let stickerMsg = msg.message?.stickerMessage;

            if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
                stickerMsg = stickerMsg || quotedMsg.stickerMessage;
            }

            if (!stickerMsg) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Please send or reply to a sticker.' });
                return true;
            }

            try {
                const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
                const isQuoted = !!quotedMsg && quotedMsg.stickerMessage;
                const mediaMsg = isQuoted ? { 
                    key: { 
                        remoteJid: chatId, 
                        id: msg.message.extendedTextMessage.contextInfo.stanzaId, 
                        participant: msg.message.extendedTextMessage.contextInfo.participant 
                    }, 
                    message: quotedMsg 
                } : msg;

                const buffer = await downloadMediaMessage(mediaMsg, 'buffer', {}, { 
                    logger: { 
                        warn: (msg) => logMessage('warn', msg), 
                        error: (msg) => logMessage('error', msg) 
                    } 
                });

                const jpegBuffer = await sharp(buffer)
                    .resize(512, 512, {
                        fit: 'cover',
                        position: 'center'
                    })
                    .jpeg({ quality: 80 })
                    .toBuffer();

                await sock.sendMessage(chatId, { 
                    image: jpegBuffer,
                    mimetype: 'image/jpeg',
                    caption: 'Converted sticker to image (512x512)'
                });

                await sendReaction(sock, msg, '✅');
                await logMessage('info', `Sticker converted to image successfully in ${chatId} by ${sender}`);
            } catch (error) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error converting sticker to image. Please try again.' });
                await logMessage('error', `Sticker to image error in ${chatId}: ${error.message}`);
            }
            return true;
        }

        case 'tag': {
            if (!(role === 'admin' || role === 'owner')) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'This command is for admins only.' });
                return true;
            }
            if (!args[0]) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Please provide a message to tag.' });
                return true;
            }
            try {
                const groupMeta = await sock.groupMetadata(chatId);
                const mentions = groupMeta.participants.map(p => p.id);
                await sock.sendMessage(chatId, { text: args.join(' '), mentions });
                await sendReaction(sock, msg, '✅');
                await logMessage('info', `Tag command executed in ${chatId} by ${sender}`);
            } catch (error) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Error tagging members. Please try again.' });
                await logMessage('error', `Tag error in ${chatId}: ${error.message}`);
            }
            return true;
        }
    }
    return false;
}