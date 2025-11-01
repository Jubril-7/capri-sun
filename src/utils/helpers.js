import * as sock from '../index.js';

export async function formatJID(jid) {
    try {
        const contact = await sock.sock.onWhatsApp(jid);
        if (contact[0]?.verifiedName) return `@${contact[0].verifiedName}`;
        return `@${jid.split('@')[0]}`;
    } catch {
        return `@${jid.split('@')[0]}`;
    }
}