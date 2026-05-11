// ─── State ───
let isRecording = false;
let isPaused = false;
let lastDuration = 0;
let recorderTabId = null;
let recorderWindowId = null;

// ─── Message Listener ───
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // ── Status query (popup asks "are we recording?") ──
    if (message.type === 'get-status') {
        sendResponse({ isRecording, isPaused, duration: lastDuration });
        return false;
    }

    // ── Start recording — open the recorder window ──
    if (message.type === 'start-recording') {
        if (isRecording) {
            sendResponse({ success: false, error: 'Already recording.' });
            return false;
        }
        const options = message.options || {};
        openRecorderWindow(options)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true; // async
    }

    // ── Stop recording — forward to recorder tab ──
    if (message.type === 'stop-recording') {
        if (recorderTabId) {
            // Reliably deliver the stop request — if the recorder tab is
            // momentarily unresponsive (e.g. still wiring up its listener,
            // or busy with a chunk write), a single fire-and-forget message
            // can be silently dropped, leaving the user with no saved file.
            // Retry a few times, then give up cleanly.
            sendStopToRecorderTabWithRetry(recorderTabId);
        }
        sendResponse({ success: true });
        return false;
    }

    // ── Pause/Resume — forward to recorder tab ──
    if (message.type === 'toggle-pause') {
        if (recorderTabId) {
            chrome.tabs.sendMessage(recorderTabId, { type: 'toggle-pause-tab' }, (resp) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ isPaused });
                    return;
                }
                isPaused = resp?.isPaused ?? isPaused;
                sendResponse({ isPaused });
            });
        } else {
            sendResponse({ isPaused });
        }
        return true; // async
    }

    // ── Timer update from recorder tab ──
    if (message.type === 'timer-update') {
        lastDuration = message.duration;
        const totalSec = Math.floor(message.duration / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        chrome.action.setBadgeText({ text: `${m}:${s.toString().padStart(2, '0')}` });
        chrome.action.setBadgeBackgroundColor({ color: isPaused ? '#f59e0b' : '#ef4444' });
        return false;
    }

    // ── Recorder tab: recording started ──
    if (message.type === 'recording-started') {
        isRecording = true;
        isPaused = false;
        lastDuration = 0;
        chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
        return false;
    }

    // ── Recorder tab: recording finished (saved to IndexedDB) ──
    if (message.type === 'recording-finished') {
        isRecording = false;
        isPaused = false;
        lastDuration = 0;
        recorderTabId = null;
        recorderWindowId = null;
        chrome.action.setBadgeText({ text: '' });
        // Open the recordings page (reuse existing tab if open)
        openRecordingsPage();
        return false;
    }

    // ── Recorder tab: recording cancelled (user denied picker) ──
    if (message.type === 'recording-cancelled') {
        isRecording = false;
        isPaused = false;
        lastDuration = 0;
        chrome.action.setBadgeText({ text: '' });
        return false;
    }

    return false;
});

// ─── Open the recorder in a new tab with audio options ───
async function openRecorderWindow(options = {}) {
    const params = new URLSearchParams();
    if (options.micEnabled) params.set('mic', 'true');
    if (options.sysEnabled === false) params.set('sys', 'false');

    const queryStr = params.toString();
    const url = queryStr ? `recorder.html?${queryStr}` : 'recorder.html';

    const tab = await chrome.tabs.create({
        url: url,
        active: true
    });
    recorderTabId = tab.id;
}

// ─── Reliably send 'stop-recording-tab' to the recorder tab ───
// Retries on "Receiving end does not exist" / no-response, which can happen
// if the message races with the tab still loading its listener.
async function sendStopToRecorderTabWithRetry(tabId, attempt = 0) {
    const maxAttempts = 5;
    try {
        const resp = await chrome.tabs.sendMessage(tabId, { type: 'stop-recording-tab' });
        if (resp && resp.ok) return;
        throw new Error('No ack from recorder tab');
    } catch (err) {
        if (attempt + 1 >= maxAttempts) {
            console.warn('[background] Could not deliver stop to recorder tab; clearing state.', err?.message);
            // Recorder tab is unreachable — reset state so the popup/badge don't
            // get stuck pretending we're still recording.
            isRecording = false;
            isPaused = false;
            lastDuration = 0;
            recorderTabId = null;
            recorderWindowId = null;
            chrome.action.setBadgeText({ text: '' });
            return;
        }
        // Back off briefly and retry.
        setTimeout(() => sendStopToRecorderTabWithRetry(tabId, attempt + 1), 250);
    }
}

// ─── Open recordings page: reuse existing tab or create new one ───
async function openRecordingsPage() {
    const url = chrome.runtime.getURL('recordings.html');
    const tabs = await chrome.tabs.query({ url });
    if (tabs.length > 0) {
        await chrome.tabs.update(tabs[0].id, { active: true });
        await chrome.tabs.reload(tabs[0].id);
    } else {
        await chrome.tabs.create({ url: 'recordings.html' });
    }
}

// ─── Detect if the recorder window/tab is closed while recording ───
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === recorderTabId) {
        console.log('[background] Recorder tab was closed.');
        isRecording = false;
        isPaused = false;
        lastDuration = 0;
        recorderTabId = null;
        recorderWindowId = null;
        chrome.action.setBadgeText({ text: '' });
    }
});
