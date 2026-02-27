// ─── Transcription Web Worker ───
// Uses Transformers.js with Whisper model for local speech-to-text

import { pipeline, env } from './lib/transformers.min.js';

// Always fetch models from Hugging Face Hub (not local filesystem)
env.allowLocalModels = false;

// Point ONNX runtime to local WASM files (avoids CSP violation in extensions)
const wasmBase = new URL('./lib/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = wasmBase;

// Use single-threaded mode (pthread sub-workers have CSP issues in extensions)
env.backends.onnx.wasm.numThreads = 1;

let transcriber = null;

self.addEventListener('message', async (e) => {
    const { type, audio } = e.data;

    if (type === 'transcribe') {
        try {
            // Load model on first use (downloads ~150MB, cached after)
            if (!transcriber) {
                self.postMessage({ type: 'status', message: 'Downloading Whisper model (one-time ~150 MB)...' });
                transcriber = await pipeline(
                    'automatic-speech-recognition',
                    'Xenova/whisper-base',
                    {
                        progress_callback: (progress) => {
                            self.postMessage({ type: 'progress', progress });
                        }
                    }
                );
            }

            self.postMessage({ type: 'status', message: 'Transcribing...' });

            // audio is a Float32Array at 16 kHz, mono
            const result = await transcriber(audio, {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: false,
            });

            self.postMessage({ type: 'result', text: result.text });
        } catch (err) {
            self.postMessage({ type: 'error', message: err.message });
        }
    }
});
