// The single place "Soft Wind", "Ocean Drift" and "Night Air" are
// actually synthesized. Both the Breathing & Guided Reset experience
// (NervousSystemReset.tsx) and Anxiety Reset use these exact same pure
// node-factory functions, so the two tools never drift into two
// different-sounding versions of the same named sound (DO NOT INTRODUCE
// COMPETING SOUND SYSTEMS). Stateful orchestration (which one is active,
// volume, muting, lifecycle) stays local to each component - this file
// only builds and tears down the audio graph for one sound at a time.

export type AmbientSoundscapeId = 'wind' | 'waves' | 'cosmic';

export const AMBIENT_SOUNDSCAPE_ORDER: AmbientSoundscapeId[] = ['wind', 'waves', 'cosmic'];

export const AMBIENT_SOUNDSCAPE_LABELS: Record<AmbientSoundscapeId, string> = {
  wind: 'Soft Wind',
  waves: 'Ocean Drift',
  cosmic: 'Night Air',
};

// Exposed so a breath-synced caller (the breathing pacer) can swell and
// recede the ambient bed itself in time with inhale/exhale, same as
// NervousSystemReset's applyPhaseAudio already does. Only wind and waves
// are meant to breathe this way; cosmic stays a steady atmospheric bed by
// design, so its handle's breathNodes is always null.
export interface AmbientBreathNodes {
  filter: BiquadFilterNode;
  gain: GainNode;
  baseFreq: number;
  peakFreq: number;
  baseGain: number;
  peakGain: number;
}

export interface AmbientSoundscapeHandle {
  oscillators: OscillatorNode[];
  noiseSources: AudioBufferSourceNode[];
  breathNodes: AmbientBreathNodes | null;
}

const createNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
  const bufferSize = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

// Starts exactly one soundscape and connects it to `destination` (the
// caller's own ambient gain node). Returns the handle so the caller can
// stop it later with stopAmbientSoundscape - mirrors NervousSystemReset's
// existing oscillators/noiseSources bookkeeping exactly.
export const startAmbientSoundscape = (
  ctx: AudioContext,
  destination: AudioNode,
  id: AmbientSoundscapeId
): AmbientSoundscapeHandle => {
  const now = ctx.currentTime;
  const handle: AmbientSoundscapeHandle = { oscillators: [], noiseSources: [], breathNodes: null };

  if (id === 'wind') {
    // Filtered noise with a bandpass sweep - a whoosh character.
    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(0.8, now);
    filter.frequency.setValueAtTime(500, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    source.start(now);
    handle.noiseSources.push(source);
    handle.breathNodes = { filter, gain, baseFreq: 500, peakFreq: 1400, baseGain: 0.1, peakGain: 0.32 };
  } else if (id === 'waves') {
    // Programmatic ocean tide synthesis (pink-filtered surf noise).
    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(2.0, now);
    filter.frequency.setValueAtTime(220, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    source.start(now);
    handle.noiseSources.push(source);
    handle.breathNodes = { filter, gain, baseFreq: 160, peakFreq: 520, baseGain: 0.16, peakGain: 0.4 };
  } else if (id === 'cosmic') {
    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(5.5, now);
    filter.frequency.setValueAtTime(140, now);

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.04, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(90, now);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const subHarmonic = ctx.createOscillator();
    subHarmonic.type = 'triangle';
    subHarmonic.frequency.setValueAtTime(63.2, now);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.05, now);

    source.connect(filter);
    filter.connect(destination);
    subHarmonic.connect(subGain);
    subGain.connect(destination);

    source.start(now);
    lfo.start(now);
    subHarmonic.start(now);

    handle.noiseSources.push(source);
    handle.oscillators.push(lfo, subHarmonic);
  }

  return handle;
};

// Non-fatal by design - .stop() throws if called on an already-stopped
// node, which can legitimately happen depending on playback state.
export const stopAmbientSoundscape = (handle: AmbientSoundscapeHandle | null): void => {
  if (!handle) return;
  handle.oscillators.forEach((osc) => { try { osc.stop(); } catch (e) { /* already stopped */ } });
  handle.noiseSources.forEach((src) => { try { src.stop(); } catch (e) { /* already stopped */ } });
};
