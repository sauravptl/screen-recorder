// ─── Audio toggle buttons ───
document.getElementById('micToggle').addEventListener('click', function () {
    const isActive = this.dataset.active === 'true';
    this.dataset.active = String(!isActive);
    this.classList.toggle('active', !isActive);
});

document.getElementById('sysToggle').addEventListener('click', function () {
    const isActive = this.dataset.active === 'true';
    this.dataset.active = String(!isActive);
    this.classList.toggle('active', !isActive);
});

// ─── On popup open, sync state with background ───
chrome.runtime.sendMessage({ type: 'get-status' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.isRecording) {
        updateUI('recording');
        updateTimer(response.duration);
        if (response.isPaused) {
            updateUI('paused');
        }
    }
});

// ─── Start button ───
document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('startBtn').disabled = true;
    document.getElementById('status').textContent = 'Starting...';

    const micEnabled = document.getElementById('micToggle').dataset.active === 'true';
    const sysEnabled = document.getElementById('sysToggle').dataset.active === 'true';

    chrome.runtime.sendMessage(
        {
            type: 'start-recording',
            options: { micEnabled, sysEnabled }
        },
        (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error:', chrome.runtime.lastError.message);
                updateUI('idle');
                document.getElementById('status').textContent = 'Error starting recording.';
                return;
            }
            if (response && response.success) {
                // Close popup — the recorder tab is now open for screen selection
                window.close();
            } else {
                updateUI('idle');
                document.getElementById('status').textContent =
                    response?.error || 'Failed to start.';
            }
        }
    );
});

// ─── Pause / Resume button ───
document.getElementById('pauseBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'toggle-pause' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.isPaused) {
            updateUI('paused');
        } else {
            updateUI('recording');
        }
    });
});

// ─── Stop button ───
document.getElementById('stopBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'stop-recording' });
    updateUI('idle');
    document.getElementById('status').textContent = 'Saving...';
});

// ─── My Recordings button ───
document.getElementById('recordingsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'recordings.html' });
});

// ─── Incoming messages (timer ticks, status changes) ───
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'timer-update') {
        updateTimer(message.duration);
    } else if (message.type === 'recording-started') {
        updateUI('recording');
    } else if (message.type === 'recording-finished') {
        updateUI('idle');
        document.getElementById('status').textContent = 'Recording saved!';
    } else if (message.type === 'recording-cancelled') {
        updateUI('idle');
        document.getElementById('status').textContent = 'Recording cancelled.';
    }
});

// ─── Timer display ───
function updateTimer(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    document.getElementById('timerDisplay').textContent =
        `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── UI state machine ───
function updateUI(state) {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const timer = document.getElementById('timerDisplay');
    const status = document.getElementById('status');
    const audioOptions = document.getElementById('audioOptions');

    switch (state) {
        case 'recording':
            startBtn.style.display = 'none';
            audioOptions.style.display = 'none';
            stopBtn.style.display = 'block';
            stopBtn.disabled = false;
            pauseBtn.style.display = 'block';
            pauseBtn.textContent = '⏸ Pause';
            timer.style.display = 'block';
            status.textContent = '● Recording...';
            status.style.color = '#ef4444';
            break;

        case 'paused':
            startBtn.style.display = 'none';
            audioOptions.style.display = 'none';
            stopBtn.style.display = 'block';
            stopBtn.disabled = false;
            pauseBtn.style.display = 'block';
            pauseBtn.textContent = '▶ Resume';
            timer.style.display = 'block';
            status.textContent = '⏸ Paused';
            status.style.color = '#fbbf24';
            break;

        case 'idle':
        default:
            startBtn.style.display = 'flex';
            startBtn.disabled = false;
            audioOptions.style.display = 'flex';
            stopBtn.style.display = 'none';
            pauseBtn.style.display = 'none';
            timer.style.display = 'none';
            timer.textContent = '00:00';
            status.textContent = 'Ready to record';
            status.style.color = '#475569';
            break;
    }
}
