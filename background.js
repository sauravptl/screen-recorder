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
        openRecorderWindow()
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true; // async
    }

    // ── Stop recording — forward to recorder tab ──
    if (message.type === 'stop-recording') {
        if (recorderTabId) {
            chrome.tabs.sendMessage(recorderTabId, { type: 'stop-recording-tab' }).catch(() => { });
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
        // Open the recordings page
        chrome.tabs.create({ url: 'recordings.html' });
        return false;
    }

    // ── Recorder tab: recording cancelled (user denied picker) ──
    if (message.type === 'recording-cancelled') {
        isRecording = false;
        isPaused = false;
        lastDuration = 0;
        chrome.action.setBadgeText({ text: '' });
        // Don't clear recorderTabId here — the recorder window handles itself
        return false;
    }

    return false;
});

// ─── Open the recorder in a new tab ───
async function openRecorderWindow() {
    const tab = await chrome.tabs.create({
        url: 'recorder.html',
        active: true
    });
    recorderTabId = tab.id;
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
