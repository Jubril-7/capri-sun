import fs from "fs";
import path from "path";

/**
 * YouTube anti-bot utilities
 * Provides rotating user agents, cookie management, and proxy support
 */

// Rotating User Agents to avoid detection
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
];

let currentUserAgentIndex = 0;

/**
 * Get the next user agent in rotation
 */
function getRotatingUserAgent() {
    const userAgent = USER_AGENTS[currentUserAgentIndex];
    currentUserAgentIndex = (currentUserAgentIndex + 1) % USER_AGENTS.length;
    return userAgent;
}

/**
 * Get yt-dlp options with anti-bot measures
 */
function getYtDlpOptions(additionalOptions = {}) {
    const userAgent = getRotatingUserAgent();
    const baseOptions = {
        userAgent: userAgent,
        noPlaylist: true,
        forceIpv4: true,
        retries: 3,
        fragmentRetries: 5,
        sleepInterval: 2,
        maxFilesize: "50M",
        noCheckCertificate: true,
        addHeader: [
            `User-Agent:${userAgent}`,
            "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language:en-US,en;q=0.9",
            "Accept-Encoding:gzip, deflate, br",
        ]
    };

    // Add cookies if available
    const cookiesPath = path.join(process.cwd(), 'cookies.txt');
    if (fs.existsSync(cookiesPath)) {
        baseOptions.cookies = cookiesPath;
    }

    return { ...baseOptions, ...additionalOptions };
}

/**
 * Delay function for rate limiting
 */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 2000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            const delayTime = baseDelay * Math.pow(2, i) + Math.random() * 1000;
            await delay(delayTime);
        }
    }
}

/**
 * Check if error is related to bot detection
 */
function isBotDetectionError(error) {
    const errorMessage = error.message.toLowerCase();
    return (
        errorMessage.includes("sign in to confirm") ||
        errorMessage.includes("bot") ||
        errorMessage.includes("automated") ||
        errorMessage.includes("verification") ||
        errorMessage.includes("captcha") ||
        errorMessage.includes("403") ||
        errorMessage.includes("429")
    );
}

/**
 * Check if yt-dlp binary is working properly
 */
async function checkYtDlpBinary() {
    try {
        const { exec } = await import('child_process');
        return new Promise((resolve) => {
            exec('yt-dlp --version', (error) => {
                resolve(!error);
            });
        });
    } catch (error) {
        return false;
    }
}

export {
    getRotatingUserAgent,
    getYtDlpOptions,
    delay,
    retryWithBackoff,
    isBotDetectionError,
    checkYtDlpBinary
};