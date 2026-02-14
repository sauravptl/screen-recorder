# Task: Personal Screen Recorder Chrome Extension

## Project Setup
- [x] Initialize project structure (manifest.json, background.js, popup.html, popup.js, style.css) <!-- id: 0 -->
- [x] Create basic Manifest V3 configuration <!-- id: 1 -->
- [x] Create placeholder icons <!-- id: 2 -->
- [x] Start background service worker <!-- id: 3 -->

## Phase 1: MVP (Minimum Viable Product)
- [x] Implement popup UI (Start/Stop buttons, Source Selector) <!-- id: 4 -->
- [x] Implement `getDisplayMedia` for screen capture in background/popup <!-- id: 5 -->
- [x] Implement `MediaRecorder` to handle recording logic <!-- id: 6 -->
- [x] Implement functionality to save recorded chunks to Blob <!-- id: 7 -->
- [x] Add download functionality for the recorded file (.webm) <!-- id: 8 -->

## Phase 2: Audio Mastery
- [x] Add microphone permission handling to manifest <!-- id: 9 -->
- [x] Implement `getUserMedia` for microphone audio capture <!-- id: 10 -->
- [x] Implement audio mixing logic (merge System & Mic audio) using AudioContext <!-- id: 11 -->
- [x] Add UI controls for toggling Microphone and System Audio <!-- id: 12 -->

## Phase 3: Polish & Optimization
- [x] Add countdown timer logic (background timer) <!-- id: 13 -->
- [x] Add timer overlay/badge to show recording duration <!-- id: 14 -->
- [x] Implement Pause/Resume functionality <!-- id: 15 -->
- [x] Style the popup with a premium/modern aesthetic <!-- id: 16 -->
- [x] Enhance error handling and user feedback <!-- id: 17 -->
- [x] Final testing and debugging <!-- id: 18 -->
- [x] Open recording in new tab after download <!-- id: 19 -->
