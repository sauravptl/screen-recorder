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

        card.innerHTML = `
      <div class="card-body">
        <div class="card-icon">🎬</div>
        <div class="card-info">
          <h3>${escapeHtml(rec.name)}</h3>
          <div class="card-meta">
            <span>📅 ${dateStr} at ${timeStr}</span>
            <span>📦 ${formatSize(rec.size)}</span>
          </div>
        </div>
        <div class="card-actions">
          <button class="action-btn btn-play" data-id="${rec.id}">▶ Play</button>
          <button class="action-btn btn-download" data-id="${rec.id}">⬇ Download</button>
          <button class="action-btn btn-delete" data-id="${rec.id}">🗑 Delete</button>
        </div>
      </div>
      <div class="card-preview" id="preview-${rec.id}">
        <video controls></video>
      </div>`;

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
    } else if (btn.classList.contains('btn-delete')) {
        await handleDelete(id);
    }
});

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

// ─── Download ───
async function downloadRecording(id) {
    const rec = await getRecording(id);
    if (!rec) return;

    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = rec.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Init ───
loadRecordings();
