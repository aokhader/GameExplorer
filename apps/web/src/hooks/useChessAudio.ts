import { useRef, useCallback } from 'react';

function playTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  gain = 0.25,
) {
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.connect(vol);
  vol.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = freq;
  vol.gain.setValueAtTime(gain, startTime);
  vol.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function useChessAudio() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = () => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  };

  const playCheck = useCallback(async () => {
    try {
      const ctx = getCtx();
      await ctx.resume();
      const t = ctx.currentTime;
      playTone(ctx, 880, t, 0.12);
      playTone(ctx, 1100, t + 0.1, 0.18);
    } catch { /* audio not available */ }
  }, []);

  const playCheckmate = useCallback(async () => {
    try {
      const ctx = getCtx();
      await ctx.resume();
      const t = ctx.currentTime;
      playTone(ctx, 440, t, 0.22, 0.3);
      playTone(ctx, 330, t + 0.2, 0.28, 0.3);
      playTone(ctx, 220, t + 0.44, 0.75, 0.4);
    } catch { /* audio not available */ }
  }, []);

  return { playCheck, playCheckmate };
}
