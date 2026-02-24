// ─── Globals ───
let recorder = null;
let data = [];
let activeStreams = [];
let recordingStartTime = 0;
let timerInterval = null;
let pausedDuration = 0;
let pauseStartTime = 0;
let isPaused = false;
let audioContext = null;
let audioDestination = null;

// ─── DOM refs ───
const startScreen = document.getElementById("startScreen");
const recordingScreen = document.getElementById("recordingScreen");
const savingScreen = document.getElementById("savingScreen");
const countdownOverlay = document.getElementById("countdownOverlay");
const countdownNumber = document.getElementById("countdownNumber");
const startCaptureBtn = document.getElementById("startCaptureBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const timerEl = document.getElementById("timer");
const recDot = document.getElementById("recDot");
const recLabel = document.getElementById("recLabel");
const errorMsg = document.getElementById("errorMsg");
const micToggle = document.getElementById("micToggle");
const sysToggle = document.getElementById("sysToggle");

// ─── Read audio prefs from URL (set by background.js) ───
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("mic") === "true" && micToggle) {
  micToggle.dataset.active = "true";
  micToggle.classList.add("active");
}
if (urlParams.get("sys") === "false" && sysToggle) {
  sysToggle.dataset.active = "false";
  sysToggle.classList.remove("active");
}

// ─── Toggle button handlers ───
if (micToggle) {
  micToggle.addEventListener("click", () => {
    const isActive = micToggle.dataset.active === "true";
    micToggle.dataset.active = String(!isActive);
    micToggle.classList.toggle("active", !isActive);
  });
}
if (sysToggle) {
  sysToggle.addEventListener("click", () => {
    const isActive = sysToggle.dataset.active === "true";
    sysToggle.dataset.active = String(!isActive);
    sysToggle.classList.toggle("active", !isActive);
  });
}

// ─── Audio Mixing (PRD Section 7) ───
async function mergeAudioStreams(desktopStream, micStream) {
  audioContext = new AudioContext();
  audioDestination = audioContext.createMediaStreamDestination();

  // Desktop/system audio
  if (desktopStream && desktopStream.getAudioTracks().length > 0) {
    const desktopSource = audioContext.createMediaStreamSource(desktopStream);
    const desktopGain = audioContext.createGain();
    desktopGain.gain.value = 1.0;
    desktopSource.connect(desktopGain).connect(audioDestination);
  }

  // Microphone audio
  if (micStream && micStream.getAudioTracks().length > 0) {
    const micSource = audioContext.createMediaStreamSource(micStream);
    const micGain = audioContext.createGain();
    micGain.gain.value = 1.0;
    micSource.connect(micGain).connect(audioDestination);
  }

  return audioDestination.stream.getAudioTracks();
}

// ─── Countdown (3…2…1) ───
function showCountdown() {
  return new Promise((resolve) => {
    countdownOverlay.style.display = "flex";
    startScreen.style.display = "none";
    let count = 3;
    countdownNumber.textContent = count;
    countdownNumber.classList.add("countdown-animate");

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        countdownNumber.textContent = count;
        // Re-trigger animation
        countdownNumber.classList.remove("countdown-animate");
        void countdownNumber.offsetWidth;
        countdownNumber.classList.add("countdown-animate");
      } else {
        clearInterval(interval);
        countdownOverlay.style.display = "none";
        resolve();
      }
    }, 1000);
  });
}

// ─── Start Capture button (user gesture → getDisplayMedia) ───
startCaptureBtn.addEventListener("click", async () => {
  startCaptureBtn.disabled = true;
  startCaptureBtn.textContent = "Waiting for selection...";
  errorMsg.style.display = "none";

  const wantMic = micToggle ? micToggle.dataset.active === "true" : false;
  const wantSys = sysToggle ? sysToggle.dataset.active !== "false" : true;

  try {
    // 1. Get screen stream — Chrome shows the picker
    const desktopStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: wantSys,
    });

    activeStreams.push(desktopStream);
    console.log(
      "[recorder] Display stream acquired.",
      "Video:", desktopStream.getVideoTracks().length,
      "Audio:", desktopStream.getAudioTracks().length,
    );

    // 2. Optionally get microphone stream
    let micStream = null;
    if (wantMic) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        activeStreams.push(micStream);
        console.log("[recorder] Microphone stream acquired.");
      } catch (micErr) {
        console.warn("[recorder] Mic access denied:", micErr.message);
        // Continue without mic — don't block the recording
      }
    }

    // 3. Build final stream with merged audio
    const videoTrack = desktopStream.getVideoTracks()[0];
    let audioTracks = [];

    const hasDesktopAudio = desktopStream.getAudioTracks().length > 0;
    const hasMicAudio = micStream && micStream.getAudioTracks().length > 0;

    if (hasDesktopAudio && hasMicAudio) {
      // Mix both audio streams using AudioContext
      audioTracks = await mergeAudioStreams(desktopStream, micStream);
    } else if (hasDesktopAudio) {
      audioTracks = desktopStream.getAudioTracks();
    } else if (hasMicAudio) {
      audioTracks = micStream.getAudioTracks();
    }

    const finalStream = new MediaStream([videoTrack, ...audioTracks]);

    // 4. Show countdown 3…2…1
    await showCountdown();

    // 5. Create MediaRecorder
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    recorder = new MediaRecorder(finalStream, {
      mimeType: mime,
      videoBitsPerSecond: 2500000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) data.push(e.data);
    };

    recorder.onstop = handleRecordingStop;

    // Safety net — catch MediaRecorder errors
    recorder.onerror = (event) => {
      console.error("[recorder] MediaRecorder error:", event.error);
      cleanup();
      startScreen.style.display = "block";
      recordingScreen.style.display = "none";
      startCaptureBtn.disabled = false;
      startCaptureBtn.textContent = "▶ Start Capture";
      errorMsg.textContent = `Recording error: ${event.error?.message || "Unknown error"}`;
      errorMsg.style.display = "block";
      chrome.runtime
        .sendMessage({ type: "recording-cancelled" })
        .catch(() => {});
    };

    // 6. Start!
    recorder.start(1000);
    recordingStartTime = Date.now();
    pausedDuration = 0;
    pauseStartTime = 0;
    isPaused = false;

    // Switch UI to recording screen
    startScreen.style.display = "none";
    recordingScreen.style.display = "block";

    // Notify background
    chrome.runtime.sendMessage({ type: "recording-started" }).catch(() => {});
    startTimer();

    // Auto-stop if user clicks "Stop sharing" in Chrome's toolbar
    videoTrack.onended = () => {
      console.log("[recorder] Video track ended (user stopped sharing).");
      doStop();
    };
  } catch (err) {
    console.error("[recorder] Failed to start:", err);
    startCaptureBtn.disabled = false;
    startCaptureBtn.textContent = "▶ Start Capture";
    countdownOverlay.style.display = "none";
    startScreen.style.display = "block";
    errorMsg.textContent =
      err.name === "NotAllowedError"
        ? "Screen sharing was cancelled. Click to try again."
        : `Error: ${err.message}`;
    errorMsg.style.display = "block";
    chrome.runtime.sendMessage({ type: "recording-cancelled" }).catch(() => {});
  }
});

// ─── Pause / Resume ───
pauseBtn.addEventListener("click", () => {
  if (!recorder) return;
  togglePause();
});

// ─── Stop ───
stopBtn.addEventListener("click", () => {
  doStop();
});

// ─── Listen for messages from background (popup → background → here) ───
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "stop-recording-tab") {
    doStop();
    sendResponse({ ok: true });
  } else if (message.type === "toggle-pause-tab") {
    togglePause();
    sendResponse({ isPaused });
  }
  return false;
});

// ─── Toggle pause ───
function togglePause() {
  if (!recorder) return;

  if (recorder.state === "recording") {
    recorder.pause();
    pauseStartTime = Date.now();
    isPaused = true;
    pauseBtn.textContent = "▶ Resume";
    recDot.classList.add("paused");
    recLabel.textContent = "Paused";
  } else if (recorder.state === "paused") {
    pausedDuration += Date.now() - pauseStartTime;
    pauseStartTime = 0;
    isPaused = false;
    recorder.resume();
    pauseBtn.textContent = "⏸ Pause";
    recDot.classList.remove("paused");
    recLabel.textContent = "Recording";
  }
}

// ─── Stop recording ───
function doStop() {
  stopLocalTimer();
  if (recorder && recorder.state !== "inactive") {
    if (recorder.state === "paused") {
      recorder.resume(); // some browsers require resume before stop
    }
    recorder.stop();
  }
  // Show saving screen
  recordingScreen.style.display = "none";
  savingScreen.style.display = "block";
}

// ─── Timer ───
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    let elapsed = Date.now() - recordingStartTime - pausedDuration;
    if (pauseStartTime > 0) {
      elapsed -= Date.now() - pauseStartTime;
    }
    if (elapsed < 0) elapsed = 0;

    // Update local timer display
    const totalSec = Math.floor(elapsed / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    
    if (h > 0) {
      timerEl.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    } else {
      timerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    // Send to background (keeps service worker alive + updates badge)
    chrome.runtime
      .sendMessage({
        type: "timer-update",
        duration: elapsed,
      })
      .catch(() => {});
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
  const duration = Date.now() - recordingStartTime - pausedDuration;
  cleanup();

  if (data.length === 0) {
    console.warn("[recorder] No data collected.");
    chrome.runtime.sendMessage({ type: "recording-cancelled" }).catch(() => {});
    window.close();
    return;
  }

  const blob = new Blob(data, { type: "video/webm" });
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `ScreenRec_${ts}.webm`;

  try {
    await saveRecording(blob, filename, duration);
    console.log("[recorder] Recording saved to IndexedDB.");
  } catch (dbErr) {
    console.error("[recorder] Failed to save to IndexedDB:", dbErr);
  }

  data = [];

  // Notify background: recording is saved
  chrome.runtime.sendMessage({ type: "recording-finished" }).catch(() => {});

  // Close this recorder window (background will open recordings page)
  setTimeout(() => window.close(), 300);
}

// ─── Cleanup streams ───
function cleanup() {
  stopLocalTimer();
  activeStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  activeStreams = [];
  pausedDuration = 0;
  pauseStartTime = 0;

  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
    audioDestination = null;
  }
}

// ─── Save partial data if window is being closed unexpectedly ───
window.addEventListener("beforeunload", () => {
  if (recorder && recorder.state !== "inactive") {
    // Try to stop gracefully — onstop handler will attempt to save
    recorder.stop();
  }
});
