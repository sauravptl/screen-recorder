// ─── Globals ───
let recorder = null;
let data = [];
let audioContext = null;
let audioDestination = null;
let activeStreams = [];
let recordingStartTime = 0;
let timerInterval = null;
let pausedDuration = 0;
let pauseStartTime = 0;
let isPaused = false;

// ─── DOM refs ───
const startScreen = document.getElementById('startScreen');
const recordingScreen = document.getElementById('recordingScreen');
const savingScreen = document.getElementById('savingScreen');
const startCaptureBtn = document.getElementById('startCaptureBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const timerEl = document.getElementById('timer');
const recDot = document.getElementById('recDot');
const recLabel = document.getElementById('recLabel');
const errorMsg = document.getElementById('errorMsg');

// ─── Start Capture button (user gesture → getDisplayMedia) ───
startCaptureBtn.addEventListener('click', async () => {
    startCaptureBtn.disabled = true;
    startCaptureBtn.textContent = 'Waiting for selection...';
    errorMsg.style.display = 'none';

    try {
        // 1. Get screen stream — Chrome shows the picker
        //    audio: true enables audio capture.
        //    On macOS: Tab audio works great. Screen + "Share system audio" may
        //    hang — that's a macOS permission issue, not a code bug.
        const desktopStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        activeStreams.push(desktopStream);
        console.log('[recorder] Display stream acquired.',
            'Video:', desktopStream.getVideoTracks().length,
            'Audio:', desktopStream.getAudioTracks().length);

        // 2. Build final stream from all tracks
        const videoTrack = desktopStream.getVideoTracks()[0];
        const audioTracks = desktopStream.getAudioTracks();
        const finalStream = new MediaStream([videoTrack, ...audioTracks]);

        // 3. Create MediaRecorder
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';

        recorder = new MediaRecorder(finalStream, {
            mimeType: mime,
            videoBitsPerSecond: 2500000
        });

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) data.push(e.data);
        };

        recorder.onstop = handleRecordingStop;

        // Safety net — catch MediaRecorder errors
        recorder.onerror = (event) => {
            console.error('[recorder] MediaRecorder error:', event.error);
            cleanup();
            startScreen.style.display = 'block';
            recordingScreen.style.display = 'none';
            startCaptureBtn.disabled = false;
            startCaptureBtn.textContent = '▶ Start Capture';
            errorMsg.textContent = `Recording error: ${event.error?.message || 'Unknown error'}`;
            errorMsg.style.display = 'block';
            chrome.runtime.sendMessage({ type: 'recording-cancelled' }).catch(() => { });
        };

        // 4. Start!
        recorder.start(1000);
        recordingStartTime = Date.now();
        pausedDuration = 0;
        pauseStartTime = 0;
        isPaused = false;

        // Switch UI to recording screen
        startScreen.style.display = 'none';
        recordingScreen.style.display = 'block';

        // Notify background
        chrome.runtime.sendMessage({ type: 'recording-started' }).catch(() => { });
        startTimer();

        // Auto-stop if user clicks "Stop sharing" in Chrome's toolbar
        videoTrack.onended = () => {
            console.log('[recorder] Video track ended (user stopped sharing).');
            doStop();
        };

    } catch (err) {
        console.error('[recorder] Failed to start:', err);
        startCaptureBtn.disabled = false;
        startCaptureBtn.textContent = '▶ Start Capture';
        errorMsg.textContent = err.name === 'NotAllowedError'
            ? 'Screen sharing was cancelled. Click to try again.'
            : `Error: ${err.message}`;
        errorMsg.style.display = 'block';
        chrome.runtime.sendMessage({ type: 'recording-cancelled' }).catch(() => { });
    }
});

// ─── Pause / Resume ───
pauseBtn.addEventListener('click', () => {
    if (!recorder) return;
    togglePause();
});

// ─── Stop ───
stopBtn.addEventListener('click', () => {
    doStop();
});

// ─── Listen for messages from background (popup → background → here) ───
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'stop-recording-tab') {
        doStop();
        sendResponse({ ok: true });
    } else if (message.type === 'toggle-pause-tab') {
        togglePause();
        sendResponse({ isPaused });
    }
    return false;
});

// ─── Toggle pause ───
function togglePause() {
    if (!recorder) return;

    if (recorder.state === 'recording') {
        recorder.pause();
        pauseStartTime = Date.now();
        isPaused = true;
        pauseBtn.textContent = '▶ Resume';
        recDot.classList.add('paused');
        recLabel.textContent = 'Paused';
    } else if (recorder.state === 'paused') {
        pausedDuration += Date.now() - pauseStartTime;
        pauseStartTime = 0;
        isPaused = false;
        recorder.resume();
        pauseBtn.textContent = '⏸ Pause';
        recDot.classList.remove('paused');
        recLabel.textContent = 'Recording';
    }
}

// ─── Stop recording ───
function doStop() {
    stopLocalTimer();
    if (recorder && recorder.state !== 'inactive') {
        if (recorder.state === 'paused') {
            recorder.resume(); // some browsers require resume before stop
        }
        recorder.stop();
    }
    // Show saving screen
    recordingScreen.style.display = 'none';
    savingScreen.style.display = 'block';
}

// ─── Timer ───
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        let elapsed = Date.now() - recordingStartTime - pausedDuration;
        if (pauseStartTime > 0) {
            elapsed -= (Date.now() - pauseStartTime);
        }
        if (elapsed < 0) elapsed = 0;

        // Update local timer display
        const totalSec = Math.floor(elapsed / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

        // Send to background (keeps service worker alive + updates badge)
        chrome.runtime.sendMessage({
            type: 'timer-update',
            duration: elapsed
        }).catch(() => { });
    }, 1000);
}

function stopLocalTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ─── Handle recording stop: save to IndexedDB ───
async function handleRecordingStop() {
    cleanup();

    if (data.length === 0) {
        console.warn('[recorder] No data collected.');
        chrome.runtime.sendMessage({ type: 'recording-cancelled' }).catch(() => { });
        window.close();
        return;
    }

    const blob = new Blob(data, { type: 'video/webm' });
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `ScreenRec_${ts}.webm`;

    try {
        await saveRecording(blob, filename);
        console.log('[recorder] Recording saved to IndexedDB.');
    } catch (dbErr) {
        console.error('[recorder] Failed to save to IndexedDB:', dbErr);
    }

    data = [];

    // Notify background: recording is saved
    chrome.runtime.sendMessage({ type: 'recording-finished' }).catch(() => { });

    // Close this recorder window (background will open recordings page)
    setTimeout(() => window.close(), 300);
}

// ─── Cleanup streams ───
function cleanup() {
    stopLocalTimer();
    activeStreams.forEach(s => s.getTracks().forEach(t => t.stop()));
    activeStreams = [];
    pausedDuration = 0;
    pauseStartTime = 0;

    if (audioContext) {
        audioContext.close().catch(() => { });
        audioContext = null;
        audioDestination = null;
    }
}

// ─── Save partial data if window is being closed unexpectedly ───
window.addEventListener('beforeunload', () => {
    if (recorder && recorder.state !== 'inactive') {
        // Try to stop gracefully — onstop handler will attempt to save
        recorder.stop();
    }
});
