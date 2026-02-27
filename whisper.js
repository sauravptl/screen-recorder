// ─── Whisper Transcription (runs on main thread of extension page) ───
// Loaded as <script type="module"> so CSP wasm-unsafe-eval is respected.

import { pipeline, env } from './lib/transformers.min.js';

// Fetch models from Hugging Face Hub
env.allowLocalModels = false;

// Point ONNX runtime to local WASM files (avoids CSP script-src violation)
const wasmBase = new URL('./lib/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = wasmBase;

// Single-threaded — no pthread sub-workers in extension context
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

let transcriber = null;

/**
 * Called from recordings.js via the global scope.
 * @param {Float32Array} audioData - 16 kHz mono PCM
 * @param {object} callbacks - { onStatus(msg), onProgress(p) }
 * @returns {Promise<string>} transcription text
 */
window.whisperTranscribe = async function (audioData, callbacks) {
    if (!transcriber) {
        callbacks.onStatus?.('Downloading Whisper model (one-time ~150 MB)...');
        transcriber = await pipeline(
            'automatic-speech-recognition',
            'Xenova/whisper-base',
            {
                progress_callback: (progress) => callbacks.onProgress?.(progress),
            }
        );
    }

    callbacks.onStatus?.('Transcribing...');

    const result = await transcriber(audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
    });

    return result.text;
};

// Signal that the module has loaded
window.whisperReady = true;
