# Product Requirement Document (PRD): Personal Screen Recorder Extension

## **1. Product Overview**

* **Product Name:** ScreenRec (Provisional)
* **Platform:** Google Chrome Extension (Manifest V3)
* **Purpose:** To provide a simple, lightweight tool for recording the current tab, full desktop, or a specific window with the ability to capture system audio and microphone input simultaneously.
* **Target User:** Personal use (You).

### **2. Core Features**

#### **2.1 Recording Modes**

* **Tab Recording:** Records only the content of the active Chrome tab.
* **Window Recording:** Records a specific application window.
* **Desktop/Full Screen:** Records the entire monitor view.

#### **2.2 Audio Capture**

* **System Audio:** Captures internal sounds (videos, music, system alerts) directly from the tab or system. *Note: System audio capture on Chrome Extensions often requires the "tab" capture API or specific "system audio" checkboxes in the browser's sharing dialog.*
* **Microphone Audio:** Captures voiceover input from the default or selected microphone.
* **Mute/Unmute:** Option to toggle microphone recording on/off.

#### **2.3 User Interface (Popup)**

* **Start/Stop Control:** A clear button to initiate and terminate recording.
* **Source Selector:** Dropdown or buttons to choose between Tab, Window, or Screen.
* **Audio Toggles:** Checkboxes to enable/disable Microphone and System Audio.
* **Timer:** A visible timer overlay (optional) or badge icon showing recording duration.

#### **2.4 Output & Saving**

* **Format:** Exports video in `.webm` (standard for web recording) or `.mp4` (requires conversion logic).
* **Download:** Automatic prompt to download the file locally to the computer upon stopping the recording.
* **No Cloud Storage:** Files are processed locally in the browser memory (Blob) and saved directly to disk to ensure privacy and zero server cost.

---

### **3. Technical Architecture**

#### **3.1 Tech Stack**

* **HTML/CSS/JavaScript:** Core extension languages.
* **Chrome Extension APIs:**
* `chrome.tabCapture`: For recording tab video and audio (highest quality for tab-specific audio).
* `navigator.mediaDevices.getDisplayMedia()`: The modern standard for screen/window capture (includes system audio option).
* `MediaRecorder API`: To handle the stream encoding.



#### **3.2 Key Flows**

**A. The Recording Flow**

1. **User opens popup:** Selects "Full Screen" + "System Audio".
2. **User clicks "Start":**
* Extension calls `getDisplayMedia({ video: true, audio: true })`.
* Chrome prompts the user to select the screen and tick "Share system audio".


3. **Recording Active:** The extension icon changes to indicate recording status.
4. **User clicks "Stop":**
* `MediaRecorder` stops.
* Data chunks are assembled into a Blob.
* A URL is created for the Blob.


5. **Export:** The extension triggers a download of the video file.

---

### **4. Detailed Functional Requirements**

| Feature | Description | Technical Note |
| --- | --- | --- |
| **Manifest Version** | Must use Manifest V3. | Requires service workers instead of background pages. |
| **System Audio** | Ability to record sound coming from the computer. | `getDisplayMedia` audio constraint. **Important:** User *must* manually check "Share system audio" in the Chrome dialog popup. |
| **Mic Audio Mixing** | Merging Mic + System audio. | Requires creating an `AudioContext` to mix two streams (Mic stream + System stream) into a single destination for the recorder. |
| **Video Quality** | High definition recording. | Set `videoBitsPerSecond` to at least 2.5Mbps or higher in MediaRecorder options. |

### **5. Constraints & Limitations**

* **Browser Sandbox:** The extension cannot record outside the browser environment if the browser is closed.
* **System Audio on macOS:** macOS has historically strict permissions for system audio capture via browser APIs; it usually works best for "Tab" audio. "Entire Screen" audio often requires virtual audio cable drivers on Mac, whereas it works natively on Windows.
* **Memory:** Long recordings store data in RAM (Blob) until saved. Extremely long recordings (hours) might crash the browser if RAM runs out.

---

### **6. Development Roadmap**

#### **Phase 1: MVP (Minimum Viable Product)**

* Basic UI popup.
* Implement `getDisplayMedia` for screen capture.
* Implement `MediaRecorder` to save chunks.
* Basic download of `.webm` file.

#### **Phase 2: Audio Mastery**

* Add Microphone stream capture (`getUserMedia`).
* Implement logic to combine System Audio and Mic Audio tracks.

#### **Phase 3: Polish**

* Add a countdown before recording starts (3...2...1).
* Add a "Pause/Resume" feature.

---

### **7. Code Snippet for Mixing Audio (Crucial Step)**

Since you want system audio *and* mic, you cannot just pass streams blindly. You often need to mix them.

```javascript
// Example logic to combine streams
async function mergeAudioStreams(desktopStream, voiceStream) {
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  
  if (desktopStream && desktopStream.getAudioTracks().length > 0) {
    const source1 = context.createMediaStreamSource(desktopStream);
    const desktopGain = context.createGain();
    desktopGain.gain.value = 1.0;
    source1.connect(desktopGain).connect(destination);
  }
  
  if (voiceStream && voiceStream.getAudioTracks().length > 0) {
    const source2 = context.createMediaStreamSource(voiceStream);
    const voiceGain = context.createGain();
    voiceGain.gain.value = 1.0;
    source2.connect(voiceGain).connect(destination);
  }
  
  return destination.stream.getAudioTracks();
}
```
