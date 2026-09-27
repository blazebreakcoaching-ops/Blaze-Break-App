import React from 'react';
import { motion } from 'motion/react';

export type NovaVoiceOrbPhase = 'connecting' | 'listening' | 'speaking' | 'muted' | 'error';

interface NovaVoiceOrbProps {
  phase: NovaVoiceOrbPhase;
  size?: number;
}

const FLARE_COUNT = 8;
// Deterministic per-tongue variation (not Math.random(), so every render/
// re-mount looks identical rather than jumping) - just enough offset in
// each flare's own flicker timing that all 8 don't breathe in lockstep,
// which is what actually reads as "flame" rather than "one shape
// pulsing 8 times."
const FLARE_TIMING = [0, 0.35, 0.15, 0.5, 0.25, 0.6, 0.1, 0.45];

// A calming, "living" presence for the voice call screen - replaces the
// old plain circle + single pulse ring. Reinterprets the founder's
// reference image (a dark backdrop, a sphere with a warm amber/orange
// glowing rim around a cooler violet/pink core) as a floating, gently
// bobbing orb with real flame tongues licking outward from its edge,
// like solar prominences - rather than a static image or a plain
// breathing ring.
//
// Built entirely from motion.div layers (not canvas/WebGL, not raw CSS
// @keyframes): this app already wraps everything in <MotionConfig
// reducedMotion="user"> (main.tsx) plus a global prefers-reduced-motion
// CSS rule (index.css), so building from motion.div gets accessibility
// handling for free - no separate reduced-motion branch needed here, per
// this codebase's established convention (see prefersReducedMotion()'s
// own comment in src/lib/utils.ts on why uncontrolled motion is a real
// accessibility concern for a burnout/anxiety-recovery product).
//
// `phase` only ever changes amplitude/speed/saturation, never the
// underlying structure - the orb should always read as "the same calm
// presence," just more or less awake.
export const NovaVoiceOrb = ({ phase, size = 96 }: NovaVoiceOrbProps) => {
  const isError = phase === 'error';
  const isConnecting = phase === 'connecting';
  const isSpeaking = phase === 'speaking';
  const isMuted = phase === 'muted';

  // Breathing rhythm: slow + dim while connecting (reads as "warming up,"
  // never as frozen/broken), calm and steady once listening, quicker and
  // brighter while speaking - but always smooth, never a strobe.
  const rimDuration = isConnecting ? 3.6 : isSpeaking ? 1.6 : 2.6;
  const coreDuration = isConnecting ? 4.2 : isSpeaking ? 2.1 : 3.4;
  const baseOpacity = isConnecting ? 0.35 : isMuted ? 0.65 : 1;
  const flareReach = isError ? 0 : isConnecting ? 0.12 : isSpeaking ? 0.55 : 0.32;
  const flareDuration = isConnecting ? 5 : isSpeaking ? 1.4 : 2.4;
  // The whole corona of flares drifts slowly around the rim, on top of
  // each tongue's own individual flicker - two independent rhythms
  // layered, which is what keeps it from ever looking mechanical.
  const coronaSpinDuration = isSpeaking ? 26 : 42;

  const sphere = size;
  const flareLength = sphere * 0.42;

  return (
    <motion.div
      className="relative"
      style={{ width: sphere, height: sphere }}
      aria-hidden="true"
      // Floating: a slow, soft vertical bob - the orb reads as something
      // hovering in front of the person, not a static icon pinned to the
      // page.
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* Flame corona - tongues of fire licking outward from the rim,
          like solar prominences. Lives OUTSIDE the clipped sphere body
          below so they aren't cut off at its edge. Rotates slowly as a
          whole group; each tongue also stretches/flickers on its own
          timing. */}
      {flareReach > 0 && (
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: '50% 50%' }}
          animate={{ rotate: 360 }}
          transition={{ duration: coronaSpinDuration, repeat: Infinity, ease: 'linear' }}
        >
          {FLARE_TIMING.map((offset, i) => {
            const angle = (360 / FLARE_COUNT) * i;
            return (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: '50%',
                  top: '50%',
                  width: sphere * 0.1,
                  height: flareLength,
                  marginLeft: -(sphere * 0.05),
                  background: 'linear-gradient(to top, rgba(234,88,12,0.95), rgba(245,158,11,0.55) 55%, transparent 100%)',
                  filter: 'blur(3px)',
                  transformOrigin: '50% 0%',
                  transform: `rotate(${angle}deg) translateY(-${sphere * 0.46}px)`,
                }}
                animate={{
                  scaleY: [flareReach * 0.6, flareReach * 1.15, flareReach * 0.6],
                  opacity: [0.35, 0.85, 0.35],
                }}
                transition={{
                  duration: flareDuration,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: offset * flareDuration,
                }}
              />
            );
          })}
        </motion.div>
      )}

      {/* Sphere body - the fire rim + cool core, clipped to a circle */}
      <div
        className="absolute inset-0 rounded-full overflow-hidden"
        style={{ backgroundColor: '#050505' }}
      >
        {/* Outer "fire rim" */}
        <motion.div
          className="absolute inset-[-15%] rounded-full"
          style={{
            background: isError
              ? 'radial-gradient(circle at 50% 50%, rgba(220,38,38,0.55), transparent 70%)'
              : 'conic-gradient(from 0deg, #f59e0b, #ea580c, #dc2626, #ea580c, #f59e0b)',
            filter: 'blur(14px)',
            opacity: baseOpacity,
          }}
          animate={isError ? { opacity: [0.25, 0.35, 0.25] } : {
            scale: [1, 1.08, 1],
            opacity: [baseOpacity * 0.8, baseOpacity, baseOpacity * 0.8],
          }}
          transition={{ duration: rimDuration, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Inner "cool core" - offset rhythm from the rim so it feels organic */}
        <motion.div
          className="absolute inset-[22%] rounded-full"
          style={{
            background: isError
              ? 'radial-gradient(circle at 45% 40%, rgba(127,29,29,0.6), transparent 70%)'
              : 'radial-gradient(circle at 45% 40%, #a855f7, #7c3aed 45%, #db2777 85%)',
            filter: 'blur(10px)',
            opacity: baseOpacity,
          }}
          animate={isError ? { opacity: [0.2, 0.3, 0.2] } : {
            scale: [1, 1.12, 1],
            opacity: [baseOpacity * 0.85, baseOpacity, baseOpacity * 0.85],
          }}
          transition={{ duration: coreDuration, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        />

        {/* Thin bright edge highlight - the crisp glowing rim in the reference image */}
        {!isError && (
          <motion.div
            className="absolute inset-[4%] rounded-full"
            style={{
              background: 'conic-gradient(from 90deg, transparent 0%, rgba(255,205,120,0.9) 8%, transparent 20%)',
              opacity: isConnecting ? 0.3 : 0.65,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          />
        )}

        {/* Centre mark - kept low-opacity for brand continuity with the
            Sparkles icon used everywhere else for Nova, without it
            dominating the visual the way it did before. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="rounded-full"
            style={{
              width: size * 0.12,
              height: size * 0.12,
              backgroundColor: isError ? '#fca5a5' : '#fff7ed',
              opacity: isConnecting ? 0.4 : 0.85,
              boxShadow: isError ? 'none' : '0 0 12px 4px rgba(255,247,237,0.5)',
            }}
          />
        </div>
      </div>
    </motion.div>
  );
};

export default NovaVoiceOrb;
