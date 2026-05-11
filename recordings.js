// ─── Extract audio from video blob as 16 kHz mono Float32Array ───
async function extractAudio(blob) {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const audio = audioBuffer.getChannelData(0); // mono Float32Array
    await audioContext.close();
    return audio;
}

// ─── Load & Render all recordings ───
async function loadRecordings() {
    const list = document.getElementById('recordingsList');
    const recordings = await getAllRecordings();

    // Sort newest first
    recordings.sort((a, b) => b.timestamp - a.timestamp);

    // Update stats
    document.getElementById('totalCount').textContent = recordings.length;
    const totalBytes = recordings.reduce((sum, r) => sum + r.size, 0);
    document.getElementById('totalSize').textContent = formatSize(totalBytes);

    // Toggle delete-all button visibility
    const deleteAllBtn = document.getElementById('deleteAllBtn');
    if (deleteAllBtn) {
        deleteAllBtn.style.display = recordings.length > 0 ? 'block' : 'none';
    }

    // Empty state
    if (recordings.length === 0) {
        list.innerHTML = `
      <div class="empty-state">
        <div class="icon">📭</div>
        <h2>No recordings yet</h2>
        <p>Click the ScreenRec icon and hit "Start Recording" to get started.</p>
      </div>`;
        return;
    }

    // Render cards
    list.innerHTML = '';
    recordings.forEach((rec) => {
        const card = document.createElement('div');
        card.className = 'recording-card';
        card.id = `card-${rec.id}`;

        const date = new Date(rec.timestamp);
        const dateStr = date.toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric'
        });
        const timeStr = date.toLocaleTimeString(undefined, {
            hour: '2-digit', minute: '2-digit'
        });

        const durationStr = rec.duration ? formatDuration(rec.duration) : '';

        card.innerHTML = `
      <div class="card-body">
        <div class="card-icon">🎬</div>
        <div class="card-info">
          <h3>${escapeHtml(rec.name)}</h3>
          <div class="card-meta">
            <span>📅 ${dateStr} at ${timeStr}</span>
            <span>📦 ${formatSize(rec.size)}</span>
            ${durationStr ? `<span>⏱ ${durationStr}</span>` : ''}
          </div>
        </div>
        <div class="card-actions">
          <button class="action-btn btn-play" data-id="${rec.id}">▶ Play</button>
          <button class="action-btn btn-download" data-id="${rec.id}">⬇ Download</button>
          <button class="action-btn btn-transcribe" data-id="${rec.id}">📝 Transcribe</button>
          <button class="action-btn btn-share" data-id="${rec.id}">📤 Share</button>
          <button class="action-btn btn-delete" data-id="${rec.id}">🗑 Delete</button>
        </div>
      </div>
      <div class="card-preview" id="preview-${rec.id}">
        <video controls></video>
      </div>
      <div class="card-transcription" id="transcription-${rec.id}"></div>`;

        list.appendChild(card);
    });
}

// ─── Event delegation ───
document.getElementById('recordingsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.action-btn');
    if (!btn) return;

    const id = Number(btn.dataset.id);

    if (btn.classList.contains('btn-play')) {
        togglePreview(id);
    } else if (btn.classList.contains('btn-download')) {
        downloadRecording(id);
    } else if (btn.classList.contains('btn-transcribe')) {
        transcribeRecording(id, btn);
    } else if (btn.classList.contains('btn-share')) {
        shareRecording(id);
    } else if (btn.classList.contains('btn-delete')) {
        await handleDelete(id);
    }
});

// ─── Copy button delegation ───
document.getElementById('recordingsList').addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.btn-copy-transcription');
    if (!copyBtn) return;
    const id = Number(copyBtn.dataset.id);
    copyTranscription(id);
});

// ─── Delete All button ───
const deleteAllBtn = document.getElementById('deleteAllBtn');
if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
        if (!confirm('Delete ALL recordings? This cannot be undone.')) return;
        await clearAllRecordings();
        loadRecordings();
    });
}

// ─── Play / Preview toggle ───
async function togglePreview(id) {
    const preview = document.getElementById(`preview-${id}`);
    const video = preview.querySelector('video');

    if (preview.classList.contains('open')) {
        // Close
        preview.classList.remove('open');
        video.pause();
        video.src = '';
        return;
    }

    // Open — load blob from DB
    const rec = await getRecording(id);
    if (!rec) return;

    const url = URL.createObjectURL(rec.blob);
    video.src = url;
    preview.classList.add('open');
    video.play();
}

// ─── Download (use MP4 filename) ───
async function downloadRecording(id) {
    const rec = await getRecording(id);
    if (!rec) return;

    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement('a');
    a.href = url;
    // Ensure .mp4 extension for MP4 blobs
    const name = rec.blob.type.startsWith('video/mp4')
        ? rec.name.replace(/\.webm$/, '.mp4')
        : rec.name;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ─── Share (via Web Share API) ───
async function shareRecording(id) {
    const rec = await getRecording(id);
    if (!rec) return;

    const isMP4 = rec.blob.type.startsWith('video/mp4');
    const mimeType = isMP4 ? 'video/mp4' : 'video/webm';
    const name = isMP4 ? rec.name.replace(/\.webm$/, '.mp4') : rec.name;
    const file = new File([rec.blob], name, { type: mimeType });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: name });
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Share failed:', err);
            }
        }
    } else {
        // Fallback: trigger download
        downloadRecording(id);
    }
}

// ─── Transcribe recording (Whisper primary, Speech API fallback) ───
async function transcribeRecording(id, btn) {
    const panel = document.getElementById(`transcription-${id}`);

    // Toggle off if already showing a result
    if (panel.classList.contains('open') && panel.querySelector('.transcription-text')) {
        panel.classList.remove('open');
        return;
    }

    const rec = await getRecording(id);
    if (!rec) return;

    // Show loading
    panel.classList.add('open');
    panel.innerHTML = `
        <div class="transcription-box">
            <h4>Transcription</h4>
            <div class="transcription-loading">
                <div class="spinner"></div>
                <span class="transcription-status">Extracting audio...</span>
            </div>
            <div class="transcription-progress-bar">
                <div class="transcription-progress-fill" id="progress-fill-${id}"></div>
            </div>
        </div>`;
    btn.disabled = true;

    try {
        // Try Whisper first (local, accurate)
        const text = await transcribeWithWhisper(id, rec);
        showTranscriptionResult(id, text);
    } catch (whisperErr) {
        console.warn('Whisper failed, trying Speech API fallback:', whisperErr.message);
        // Fallback to Web Speech API
        try {
            panel.querySelector('.transcription-status').textContent =
                'Whisper unavailable. Using browser speech recognition (plays audio)...';
            const progressBar = panel.querySelector('.transcription-progress-bar');
            if (progressBar) progressBar.style.display = 'none';
            const text = await transcribeWithSpeechAPI(rec);
            showTranscriptionResult(id, text || 'No speech detected.');
        } catch (speechErr) {
            panel.innerHTML = `
                <div class="transcription-box">
                    <h4>Transcription</h4>
                    <div class="transcription-error">
                        Transcription failed: ${escapeHtml(whisperErr.message)}<br>
                        Speech API fallback also failed: ${escapeHtml(speechErr.message)}
                    </div>
                </div>`;
        }
    } finally {
        btn.disabled = false;
    }
}

function showTranscriptionResult(id, text) {
    const panel = document.getElementById(`transcription-${id}`);
    panel.innerHTML = `
        <div class="transcription-box">
            <h4>Transcription</h4>
            <div class="transcription-text">${escapeHtml(text)}</div>
            <div class="transcription-actions">
                <button class="btn-copy-transcription" data-id="${id}">Copy to clipboard</button>
            </div>
        </div>`;
}

// ─── Whisper transcription (runs on main thread via whisper.js module) ───
async function transcribeWithWhisper(id, rec) {
    // The whisper.js module is loaded as <script type="module"> and may not
    // be ready at the moment the user clicks Transcribe (especially on first
    // page load). Wait briefly for it instead of failing immediately.
    if (typeof window.whisperTranscribe !== 'function') {
        const statusEl = document.querySelector(`#transcription-${id} .transcription-status`);
        if (statusEl) statusEl.textContent = 'Loading Whisper engine...';
        const ok = await waitFor(() => typeof window.whisperTranscribe === 'function', 15000);
        if (!ok) {
            const loadErr = window.whisperLoadError;
            throw new Error(
                loadErr
                    ? `Whisper engine failed to load: ${loadErr}`
                    : 'Whisper engine is still loading. Please try again in a moment.'
            );
        }
    }

    // Extract audio from video (16 kHz mono)
    const audioData = await extractAudio(rec.blob);

    const text = await window.whisperTranscribe(audioData, {
        onStatus(msg) {
            const statusEl = document.querySelector(`#transcription-${id} .transcription-status`);
            if (statusEl) statusEl.textContent = msg;
        },
        onProgress(progress) {
            if (progress.status === 'progress' && progress.progress != null) {
                const fill = document.getElementById(`progress-fill-${id}`);
                if (fill) fill.style.width = `${Math.round(progress.progress)}%`;
                const statusEl = document.querySelector(`#transcription-${id} .transcription-status`);
                if (statusEl) {
                    const pct = Math.round(progress.progress);
                    statusEl.textContent = `Downloading model... ${pct}%`;
                }
            }
        }
    });

    return text;
}

// ─── Poll a predicate until it's true or we time out ───
function waitFor(predicate, timeoutMs) {
    return new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
            if (predicate()) return resolve(true);
            if (Date.now() - start >= timeoutMs) return resolve(false);
            setTimeout(tick, 100);
        };
        tick();
    });
}

// ─── Web Speech API fallback (plays audio, captures via browser recognition) ───
function transcribeWithSpeechAPI(rec) {
    return new Promise((resolve, reject) => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            reject(new Error('Speech Recognition API not supported in this browser.'));
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        let fullText = '';

        // Play the recording audio so the mic can pick it up
        const audioUrl = URL.createObjectURL(rec.blob);
        const audio = new Audio(audioUrl);
        audio.volume = 1.0;

        recognition.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    fullText += event.results[i][0].transcript + ' ';
                }
            }
        };

        recognition.onerror = (event) => {
            audio.pause();
            URL.revokeObjectURL(audioUrl);
            if (event.error === 'no-speech') {
                resolve(fullText.trim() || 'No speech detected.');
            } else {
                reject(new Error(`Speech recognition error: ${event.error}`));
            }
        };

        recognition.onend = () => {
            resolve(fullText.trim() || 'No speech detected.');
        };

        audio.onended = () => {
            // Wait a moment for final results, then stop recognition
            setTimeout(() => {
                recognition.stop();
                URL.revokeObjectURL(audioUrl);
            }, 1500);
        };

        audio.onerror = () => {
            recognition.stop();
            URL.revokeObjectURL(audioUrl);
            reject(new Error('Failed to play audio for speech recognition.'));
        };

        recognition.start();
        audio.play().catch((err) => {
            recognition.stop();
            URL.revokeObjectURL(audioUrl);
            reject(new Error(`Audio playback failed: ${err.message}`));
        });
    });
}

// ─── Copy transcription to clipboard ───
async function copyTranscription(id) {
    const panel = document.getElementById(`transcription-${id}`);
    const textEl = panel.querySelector('.transcription-text');
    if (!textEl) return;

    try {
        await navigator.clipboard.writeText(textEl.textContent);
        const btn = panel.querySelector('.btn-copy-transcription');
        if (btn) {
            const original = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = original; }, 1500);
        }
    } catch (err) {
        console.error('Copy failed:', err);
    }
}

// ─── Delete ───
async function handleDelete(id) {
    if (!confirm('Delete this recording? This cannot be undone.')) return;

    await deleteRecording(id);
    const card = document.getElementById(`card-${id}`);
    if (card) {
        card.style.transition = 'opacity 0.3s, transform 0.3s';
        card.style.opacity = '0';
        card.style.transform = 'translateX(40px)';
        setTimeout(() => {
            card.remove();
            // Refresh stats
            loadRecordings();
        }, 300);
    }
}

// ─── Helpers ───
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatDuration(ms) {
    if (ms <= 0) return '';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    if (h > 0) {
        return `${h}h ${m}m ${s}s`;
    }
    if (m > 0) {
        return `${m}m ${s}s`;
    }
    return `${s}s`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Init ───
loadRecordings();
