import { sendReaction } from '../middlewares/reactions.js';
import { logMessage } from '../utils/logger.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { YtDlp } from 'ytdlp-nodejs';
import installer from '@ffmpeg-installer/ffmpeg';
import axios from 'axios';

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

    // Movie info function using OMDB API
    const getMovieInfo = async (title) => {
        try {
            const OMDB_API_KEY = process.env.OMDB_API_KEY;
            if (!OMDB_API_KEY) {
                throw new Error('OMDB API key not configured');
            }

            const response = await axios.get(`http://www.omdbapi.com/`, {
                params: {
                    apikey: OMDB_API_KEY,
                    t: title,
                    plot: 'full'
                },
                timeout: 10000
            });

            if (response.data.Response === 'False') {
                throw new Error('Movie not found');
            }

            const movie = response.data;

            let info = `🎬 *${movie.Title}* (${movie.Year})\n\n`;
            info += `⭐ *Rating:* ${movie.imdbRating}/10 (${movie.imdbVotes} votes)\n`;
            info += `⏱️ *Runtime:* ${movie.Runtime}\n`;
            info += `🎭 *Genre:* ${movie.Genre}\n`;
            info += `🎥 *Director:* ${movie.Director}\n`;
            info += `👥 *Cast:* ${movie.Actors}\n`;
            info += `📖 *Plot:* ${movie.Plot}\n`;
            info += `🏆 *Awards:* ${movie.Awards}\n`;
            info += `🌍 *Language:* ${movie.Language}\n`;
            info += `🇺🇸 *Country:* ${movie.Country}\n`;

            return {
                info,
                poster: movie.Poster !== 'N/A' ? movie.Poster : null
            };
        } catch (error) {
            throw error;
        }
    };

    // Anime info function using Jikan API (MyAnimeList)
    const getAnimeInfo = async (title) => {
        try {
            const response = await axios.get(`https://api.jikan.moe/v4/anime`, {
                params: {
                    q: title,
                    limit: 1
                },
                timeout: 10000
            });

            if (!response.data.data || response.data.data.length === 0) {
                throw new Error('Anime not found');
            }

            const anime = response.data.data[0];

            let info = `🎌 *${anime.title}* (${anime.title_japanese || ''})\n\n`;
            info += `⭐ *Rating:* ${anime.score || 'N/A'}/10\n`;
            info += `📊 *Rank:* #${anime.rank || 'N/A'}\n`;
            info += `🎞️ *Episodes:* ${anime.episodes || 'Unknown'}\n`;
            info += `📺 *Status:* ${anime.status}\n`;
            info += `📅 *Aired:* ${anime.aired?.string || 'Unknown'}\n`;
            info += `🎭 *Genre:* ${anime.genres?.map(g => g.name).join(', ') || 'Unknown'}\n`;
            info += `🏢 *Studio:* ${anime.studios?.map(s => s.name).join(', ') || 'Unknown'}\n`;
            info += `📖 *Synopsis:* ${anime.synopsis?.substring(0, 300)}${anime.synopsis?.length > 300 ? '...' : ''}\n`;

            return {
                info,
                image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || null
            };
        } catch (error) {
            throw error;
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

        case 'play': {
            if (!args.length) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Please provide a song name or YouTube link.' });
                return true;
            }
            const query = args.join(' ');
            await sendReaction(sock, msg, '⏳');
            let tempFile = null;
            try {
                const ffmpegPath = installer.path;
                const isWin = process.platform === 'win32';
                const binaryPath = path.join(process.cwd(), isWin ? 'yt-dlp.exe' : 'yt-dlp');

                // Rotating User Agents to avoid detection
                const USER_AGENTS = [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
                ];
                const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

                const ytdlp = new YtDlp({
                    binaryPath,
                    ffmpegPath: installer.path,
                    jsRuntimes: ['deno'],
                    userAgent: randomUA,
                    referer: 'https://www.youtube.com/',
                    extractorArgs: {
                        'youtube': 'skip=dash,initial_data;player_client=web,android;formats=missing_pot'
                    },
                    forceIPv4: true,
                    sleepInterval: 3,
                    maxSleepInterval: 15,
                    retries: 5,
                    fragmentRetries: 20,
                    noWarnings: false,
                    ignoreErrors: false
                });
                let finalUrl, title;
                if (query.includes('youtube.com') || query.includes('youtu.be')) {
                    finalUrl = query;
                    title = 'Audio';
                    await sock.sendMessage(chatId, { text: 'Downloading from YouTube link...' });
                } else {
                    const raw = await ytdlp.execAsync(`ytsearch1:${query}`, {
                        dumpJson: true,
                        impersonate: 'chrome'  // Add impersonate for search
                    });
                    const video = JSON.parse(raw);
                    if (!video?.id) {
                        await sendReaction(sock, msg, '❌');
                        await sock.sendMessage(chatId, { text: 'No results found.' });
                        return true;
                    }
                    finalUrl = `https://www.youtube.com/watch?v=${video.id}`;
                    title = video.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 100);
                    await sendReaction(sock, msg, '🔍');
                    await sock.sendMessage(chatId, { text: `Found: *${video.title}*\nDownloading audio...\nYouTube Link: ${finalUrl}` });
                }
                tempFile = path.join(os.tmpdir(), `play_${Date.now()}.mp3`);
                await ytdlp.execAsync(finalUrl, {
                    output: tempFile,
                    format: 'bestaudio/best',
                    extractAudio: true,
                    audioFormat: 'mp3',
                    audioQuality: 0,
                    ffmpegLocation: ffmpegPath,
                    addMetadata: true,
                    noCheckCertificate: true,
                    referer: 'https://www.youtube.com/',
                    impersonate: 'chrome'  // Add impersonate for download
                });
                const stats = fs.statSync(tempFile);
                if (stats.size < 100000) {
                    throw new Error('Downloaded file too small');
                }
                const audioBuffer = fs.readFileSync(tempFile);
                await sock.sendMessage(chatId, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`,
                    ptt: false,
                });
                await sendReaction(sock, msg, '✅');
                await logMessage('info', `Play success: ${title} | ${sender}`);
            } catch (err) {
                console.error('Play error:', err.message);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, {
                    text: 'Failed to download audio. Try a direct YouTube link or wait a few minutes and retry.'
                });
                await logMessage('error', `Play failed: ${err.message}`);
            } finally {
                if (tempFile && fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch { }
                }
            }
            return true;
        }

        case 'dl':
        case 'video':
        case 'download': {
            if (!args.length) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Send a video link bro\nExample: !dl https://www.instagram.com/reel/...' });
                return true;
            }

            const url = args[0];
            if (!url.match(/^https?:\/\//i)) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: "That doesn't look like a valid URL" });
                return true;
            }

            await sendReaction(sock, msg, '⏳');
            await sock.sendMessage(chatId, { text: 'Downloading video... Hang tight!' });

            let tempFile = null;

            try {
                const ffmpegPath = installer.path;

                // Smart yt-dlp path detection (works on Windows local + Linux Koyeb)
                const getYtDlpPath = () => {
                    const localWin = path.join(process.cwd(), 'yt-dlp.exe');
                    const localLinux = path.join(process.cwd(), 'yt-dlp');

                    if (process.platform === 'win32' && fs.existsSync(localWin)) {
                        return localWin;
                    }
                    if (fs.existsSync(localLinux)) {
                        return localLinux;
                    }
                    // Fallback: assume it's in PATH (rare)
                    return 'yt-dlp';
                };

                const binaryPath = getYtDlpPath();

                const ytdlp = new YtDlp({
                    binaryPath,
                    ffmpegPath,
                    cookiesFromBrowser: 'chrome',
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                });

                let title = 'video';

                try {
                    const infoRaw = await ytdlp.execAsync(url, { dumpJson: true, noDownload: true });
                    const info = JSON.parse(infoRaw);
                    title = (info.title || info.webpage_url_basename || 'video')
                        .replace(/[\\/:*?"<>|]/g, '')
                        .slice(0, 100);
                } catch (e) {
                    console.log("Couldn't fetch title:", e.message);
                }

                tempFile = path.join(os.tmpdir(), `video_${Date.now()}.mp4`);

                await ytdlp.execAsync(url, {
                    output: tempFile,
                    format: 'best[height<=720][ext=mp4]/bestvideo[height<=720]+bestaudio/best',
                    mergeOutputFormat: 'mp4',
                    ffmpegLocation: ffmpegPath,
                    noCheckCertificate: true,
                    retries: 3,
                });

                const stats = fs.statSync(tempFile);
                if (stats.size < 50_000) {
                    throw new Error('Downloaded file too small or failed');
                }

                if (stats.size > 95 * 1024 * 1024) {
                    await sock.sendMessage(chatId, { text: 'Video too big for WhatsApp (>95MB). Try a shorter clip or lower quality.' });
                    await sendReaction(sock, msg, '❌');
                    return true;
                }

                const videoBuffer = fs.readFileSync(tempFile);

                await sock.sendMessage(chatId, {
                    video: videoBuffer,
                    mimetype: 'video/mp4',
                    caption: `Downloaded by *ωнιмѕι¢αℓ ¢əρяιѕυη*: ${title}`,
                });

                await sendReaction(sock, msg, '✅');
                await logMessage('info', `Video downloaded & sent: ${title} | Size: ${(stats.size / (1024 * 1024)).toFixed(1)}MB | ${sender}`);

            } catch (err) {
                console.error('Video download error:', err.message);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, {
                    text: `Failed to download video.\nError: ${err.message.includes('ERROR') ? 'Unsupported site or private video' : err.message}`
                });
                await logMessage('error', `Video DL failed: ${url} | ${err.message}`);
            } finally {
                if (tempFile && fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch { }
                }
            }
            return true;
        }

        case 'movie':
        case 'movieinfo': {
            if (!args.length) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Please provide a movie title.\nExample: !movie The Matrix' });
                return true;
            }

            const movieTitle = args.join(' ');
            await sendReaction(sock, msg, '⏳');

            try {
                const movieData = await getMovieInfo(movieTitle);

                if (movieData.poster) {
                    await sock.sendMessage(chatId, {
                        image: { url: movieData.poster },
                        caption: movieData.info
                    });
                } else {
                    await sock.sendMessage(chatId, { text: movieData.info });
                }

                await sendReaction(sock, msg, '✅');
                await logMessage('info', `Movie info fetched: ${movieTitle} | ${sender}`);

            } catch (error) {
                await sendReaction(sock, msg, '❌');
                if (error.message.includes('API key')) {
                    await sock.sendMessage(chatId, { text: 'Movie search is currently unavailable. Please configure OMDB API key.' });
                } else {
                    await sock.sendMessage(chatId, { text: `Movie not found: "${movieTitle}"\nPlease check the title and try again.` });
                }
                await logMessage('error', `Movie info failed: ${movieTitle} | ${error.message}`);
            }
            return true;
        }

        case 'anime':
        case 'animeinfo': {
            if (!args.length) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Please provide an anime title.\nExample: !anime Attack on Titan' });
                return true;
            }

            const animeTitle = args.join(' ');
            await sendReaction(sock, msg, '⏳');

            try {
                const animeData = await getAnimeInfo(animeTitle);

                if (animeData.image) {
                    await sock.sendMessage(chatId, {
                        image: { url: animeData.image },
                        caption: animeData.info
                    });
                } else {
                    await sock.sendMessage(chatId, { text: animeData.info });
                }

                await sendReaction(sock, msg, '✅');
                await logMessage('info', `Anime info fetched: ${animeTitle} | ${sender}`);

            } catch (error) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: `Anime not found: "${animeTitle}"\nPlease check the title and try again.` });
                await logMessage('error', `Anime info failed: ${animeTitle} | ${error.message}`);
            }
            return true;
        }

        case 'vo':
        case 'viewonce':
        case 'unvo':
        case 'save': {
            // Owner-only restriction
            if (role !== 'owner') {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: '👑 This command is for bot owner only.' });
                await logMessage('info', `Permission denied: ${sender} tried to use viewonce command in ${chatId}`);
                return true;
            }

            if (!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'Reply to a *View Once* photo or video with !vo' });
                return true;
            }

            const quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage;

            // Check if quoted message has image or video (View Once or normal)
            const hasImage = quoted.imageMessage || (quoted.viewOnceMessage?.message?.imageMessage) || (quoted.viewOnceMessageV2?.message?.imageMessage);
            const hasVideo = quoted.videoMessage || (quoted.viewOnceMessage?.message?.videoMessage) || (quoted.viewOnceMessageV2?.message?.videoMessage);

            if (!hasImage && !hasVideo) {
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, { text: 'That\'s not a photo or video.' });
                return true;
            }

            try {
                const { downloadMediaMessage } = await import('@whiskeysockets/baileys');

                // Build proper quoted message structure for download
                const quotedMsgForDownload = {
                    key: {
                        remoteJid: chatId,
                        fromMe: msg.message.extendedTextMessage.contextInfo.participant === sock.user?.id,
                        id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                        participant: msg.message.extendedTextMessage.contextInfo.participant
                    },
                    message: quoted
                };

                await sendReaction(sock, msg, '⏳');

                const buffer = await downloadMediaMessage(
                    quotedMsgForDownload,
                    'buffer',
                    {},
                    {
                        logger: {
                            info: () => { },
                            warn: (m) => logMessage('warn', m),
                            error: (m) => logMessage('error', m)
                        }
                    }
                );

                if (hasVideo) {
                    await sock.sendMessage(chatId, {
                        video: buffer,
                        caption: 'View Once Video Unlocked',
                        gifPlayback: false
                    });
                } else {
                    await sock.sendMessage(chatId, {
                        image: buffer,
                        caption: 'View Once Photo Unlocked'
                    });
                }

                await sendReaction(sock, msg, '✅');
                await logMessage('info', `View Once unlocked successfully by ${sender} in ${chatId}`);

            } catch (error) {
                console.error('VO Error:', error);
                await sendReaction(sock, msg, '❌');
                await sock.sendMessage(chatId, {
                    text: 'Failed to unlock View Once.\nPossible reasons:\n• Already viewed & expired\n• Too old\n• Not actually View Once'
                });
                await logMessage('error', `ViewOnce failed: ${error.message}`);
            }
            return true;
        }
    }
    return false;
}