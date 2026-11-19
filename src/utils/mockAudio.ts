/**
 * Generates a gentle, valid WAV audio Blob URL for mock mode playback so the
 * HTML5 audio player, play/pause, speed control, and timeline scrubber work
 * smoothly without external audio dependencies.
 */
let cachedMockAudioUrl: string | null = null;

export function getMockAudioUrl(): string {
  if (cachedMockAudioUrl) return cachedMockAudioUrl;

  const sampleRate = 8000;
  const durationSec = 45;
  const numSamples = sampleRate * durationSec;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Synthesize soft conversational-cadence ambient tones
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const phraseEnvelope = Math.max(0, Math.sin(t * 1.4) * 0.5 + 0.35);
    const freq = Math.floor(t / 4) % 2 === 0 ? 196 : 246.94;
    const sample =
      Math.sin(2 * Math.PI * freq * t) *
      0.04 *
      phraseEnvelope *
      (0.7 + 0.3 * Math.sin(2 * Math.PI * 3.2 * t));
    const int16 = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    view.setInt16(44 + i * 2, int16, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  cachedMockAudioUrl = URL.createObjectURL(blob);
  return cachedMockAudioUrl;
}
