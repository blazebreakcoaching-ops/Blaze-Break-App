// AudioWorklet processor for microphone capture. Runs on the audio render
// thread (not the main thread), which is the whole point: the deprecated
// ScriptProcessorNode it replaces ran capture on the main thread, so any UI
// jank produced audible glitches and dropouts in the captured stream. A
// worklet keeps capture smooth regardless of what the page is doing.
//
// It receives Float32 audio frames at the context's sample rate (the hook
// creates that context at 16 kHz, which is what the Gemini Live API expects),
// converts them to 16-bit little-endian PCM, and hands the raw bytes back to
// the main thread as a transferable ArrayBuffer (zero-copy). The main thread
// base64-encodes and sends them over the WebSocket.
//
// Plain JS on purpose: AudioWorklet modules run in a separate global scope
// (`AudioWorkletProcessor`, `registerProcessor`, and `sampleRate` are globals
// there) and are loaded by URL via addModule(), so this file is not part of
// the normal TypeScript module graph.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    // No input connected yet (or a silent render quantum) - keep the
    // processor alive by returning true, just produce nothing.
    if (!input || !input[0]) return true;

    const channel = input[0]; // Float32Array, one render quantum (128 frames)
    const buffer = new ArrayBuffer(channel.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    this.port.postMessage(buffer, [buffer]);
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
