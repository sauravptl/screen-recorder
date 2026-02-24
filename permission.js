// ─── Read reason from URL ───
const params = new URLSearchParams(window.location.search);
const reason = params.get('reason') || 'cancelled';

// ─── DOM refs ───
const icon = document.getElementById('pageIcon');
const badge = document.getElementById('reasonBadge');
const title = document.getElementById('pageTitle');
const desc = document.getElementById('pageDesc');
const retryBtn = document.getElementById('retryBtn');
const closeBtn = document.getElementById('closeBtn');
const successMsg = document.getElementById('successMsg');
const micToggle = document.getElementById('micToggle');
const sysToggle = document.getElementById('sysToggle');
const audioOptions = document.getElementById('audioOptions');

// ─── Customise text based on reason ───
if (reason === 'mic') {
    icon.textContent = '🎙️';
    badge.textContent = 'Microphone Access';
    title.textContent = 'Microphone Permission Required';
    desc.textContent = 'To include your voice in recordings, grant microphone access below.';
    retryBtn.textContent = 'Grant Microphone Access';
    audioOptions.style.display = 'none'; // hide toggles for mic-only flow
} else {
    icon.textContent = '🎬';
    badge.textContent = 'Recording Cancelled';
    title.textContent = 'Screen Recording Cancelled';
    desc.textContent = 'You cancelled or denied the screen sharing request. Select your audio options below and click "Try Again".';
    retryBtn.textContent = 'Try Again';
}

// ─── Toggle buttons ───
micToggle.addEventListener('click', () => {
    const isActive = micToggle.dataset.active === 'true';
    micToggle.dataset.active = String(!isActive);
    micToggle.classList.toggle('active', !isActive);
});

sysToggle.addEventListener('click', () => {
    const isActive = sysToggle.dataset.active === 'true';
    sysToggle.dataset.active = String(!isActive);
    sysToggle.classList.toggle('active', !isActive);
});

// ─── Retry Button ───
retryBtn.addEventListener('click', async () => {
    if (reason === 'mic') {
        // Request mic permission (works in a full tab)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
            successMsg.style.display = 'block';
            successMsg.textContent = '✅ Microphone access granted! You can close this tab.';
            retryBtn.disabled = true;
        } catch (e) {
            alert('Microphone permission was denied. Check your browser settings (lock icon in address bar).');
        }
    } else {
        // Read toggle states
        const micEnabled = micToggle.dataset.active === 'true';
        const sysEnabled = sysToggle.dataset.active === 'true';

        retryBtn.disabled = true;
        retryBtn.textContent = 'Waiting for selection...';

        // Tell background to retry start-recording with selected audio options
        chrome.runtime.sendMessage(
            {
                type: 'start-recording',
                options: { micEnabled, sysEnabled }
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    retryBtn.disabled = false;
                    retryBtn.textContent = 'Try Again';
                    desc.textContent = 'Something went wrong. Please try again.';
                    return;
                }
                if (response && response.success) {
                    successMsg.style.display = 'block';
                    successMsg.textContent = '✅ Recording started! You can close this tab.';
                } else {
                    retryBtn.disabled = false;
                    retryBtn.textContent = 'Try Again';
                    desc.textContent = 'Still cancelled. Please try again and select a screen to share.';
                }
            }
        );
    }
});

// ─── Close button ───
closeBtn.addEventListener('click', () => {
    window.close();
});
