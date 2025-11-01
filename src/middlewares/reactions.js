export async function sendReaction(sock, msg, emoji) {
    try {
        await sock.sendMessage(msg.key.remoteJid, {
            react: {
                text: emoji,
                key: msg.key
            }
        });
    } catch (error) {
        console.error(`Failed to send reaction: ${error.message}`);
        throw error;
    }
}