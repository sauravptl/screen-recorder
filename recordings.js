// ─── Gemini API Key management ───
async function getApiKey() {
    const result = await chrome.storage.local.get('geminiApiKey');
    return result.geminiApiKey || '';
}

async function saveApiKey(key) {
    await chrome.storage.local.set({ geminiApiKey: key });
}

// Init API key input
(async () => {
    const input = document.getElementById('geminiKeyInput');
    const saveBtn = document.getElementById('saveKeyBtn');
    const status = document.getElementById('apiKeyStatus');

    const existing = await getApiKey();
    if (existing) {
        input.value = existing;
        status.textContent = 'Key saved';
        status.className = 'api-key-status saved';
    }

    saveBtn.addEventListener('click', async () => {
        const key = input.value.trim();
        if (!key) {
            status.textContent = 'Key is empty';
            status.className = 'api-key-status';
            return;
        }
        await saveApiKey(key);
        status.textContent = 'Key saved';
        status.className = 'api-key-status saved';
    });
})();

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

// ─── Transcribe via Gemini API ───
async function transcribeRecording(id, btn) {
    const apiKey = await getApiKey();
    if (!apiKey) {
        alert('Please enter and save your Gemini API key first.');
        document.getElementById('geminiKeyInput').focus();
        return;
    }

    const panel = document.getElementById(`transcription-${id}`);

    // Toggle off if already open
    if (panel.classList.contains('open')) {
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
                <span>Uploading and transcribing with Gemini...</span>
            </div>
        </div>`;
    btn.disabled = true;

    try {
        const mimeType = rec.blob.type || 'video/webm';
        let transcription;

        if (rec.blob.size < 15 * 1024 * 1024) {
            // Small file: use inline base64
            transcription = await transcribeInline(rec.blob, mimeType, apiKey);
        } else {
            // Large file: use Gemini File API
            transcription = await transcribeViaFileAPI(rec.blob, mimeType, apiKey);
        }

        panel.innerHTML = `
            <div class="transcription-box">
                <h4>Transcription</h4>
                <div class="transcription-text">${escapeHtml(transcription)}</div>
                <div class="transcription-actions">
                    <button onclick="copyTranscription(${id})">Copy to clipboard</button>
                </div>
            </div>`;
    } catch (err) {
        panel.innerHTML = `
            <div class="transcription-box">
                <h4>Transcription</h4>
                <div class="transcription-error">${escapeHtml(err.message)}</div>
            </div>`;
    } finally {
        btn.disabled = false;
    }
}

// ─── Inline transcription (< 15 MB) ───
async function transcribeInline(blob, mimeType, apiKey) {
    const base64 = await blobToBase64(blob);

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { inline_data: { mime_type: mimeType, data: base64 } },
                        { text: "Transcribe all spoken audio from this video. Provide only the transcription text." }
                    ]
                }]
            })
        }
    );

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API error (${response.status})`);
    }

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || 'No speech detected in this recording.';
}

// ─── File API transcription (>= 15 MB) ───
async function transcribeViaFileAPI(blob, mimeType, apiKey) {
    // Step 1: Start resumable upload
    const startRes = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': blob.size,
                'X-Goog-Upload-Header-Content-Type': mimeType,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ file: { display_name: 'screenrec_transcribe' } }),
        }
    );

    if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err.error?.message || `Upload init failed (${startRes.status})`);
    }

    const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) throw new Error('Failed to get upload URL from Gemini.');

    // Step 2: Upload video bytes
    const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Length': blob.size,
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize',
        },
        body: blob,
    });

    if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);

    const fileInfo = await uploadRes.json();
    let file = fileInfo.file;

    // Step 3: Poll until processing is done
    while (file.state === 'PROCESSING') {
        await new Promise(r => setTimeout(r, 3000));
        const checkRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${apiKey}`
        );
        if (!checkRes.ok) throw new Error(`File status check failed (${checkRes.status})`);
        file = await checkRes.json();
    }

    if (file.state !== 'ACTIVE') throw new Error(`File processing failed: ${file.state}`);

    // Step 4: Generate transcription
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { file_data: { mime_type: file.mimeType, file_uri: file.uri } },
                        { text: "Transcribe all spoken audio from this video. Provide only the transcription text." }
                    ]
                }]
            })
        }
    );

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API error (${response.status})`);
    }

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || 'No speech detected in this recording.';
}

// ─── Blob → base64 ───
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Strip the data URL prefix (e.g. "data:video/mp4;base64,")
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ─── Copy transcription to clipboard ───
async function copyTranscription(id) {
    const panel = document.getElementById(`transcription-${id}`);
    const textEl = panel.querySelector('.transcription-text');
    if (!textEl) return;

    try {
        await navigator.clipboard.writeText(textEl.textContent);
        const btn = panel.querySelector('.transcription-actions button');
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
