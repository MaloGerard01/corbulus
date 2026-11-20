import {
  createPlayback,
  formatDuration,
  hasEnded,
  loopPlayback,
  pausePlayback,
  positionGap,
  resumePlayback,
  seekPlayback,
  videoPosition,
  type VideoPlayback,
} from './video-playback';

/** Vidéo de 60 s, lancée à t = 0 (horloge en ms). */
const DURATION = 60;
const playing: VideoPlayback = { ...createPlayback(0), loop: false };

describe('videoPosition', () => {
  it('avance avec l’horloge pendant la lecture', () => {
    expect(videoPosition(playing, 12_500, DURATION)).toBeCloseTo(12.5);
  });

  it('reste figée en pause', () => {
    const paused = { ...playing, playing: false, position: 20 };
    expect(videoPosition(paused, 99_000, DURATION)).toBe(20);
  });

  it('repart de 0 en boucle, et s’arrête à la fin sinon', () => {
    expect(videoPosition({ ...playing, loop: true }, 70_000, DURATION)).toBeCloseTo(10);
    expect(videoPosition(playing, 70_000, DURATION)).toBe(DURATION);
    expect(hasEnded(playing, 70_000, DURATION)).toBe(true);
  });

  it('avance sans borne si la durée est inconnue', () => {
    expect(videoPosition(playing, 70_000, null)).toBeCloseTo(70);
    expect(hasEnded(playing, 70_000, null)).toBe(false);
  });
});

describe('commandes', () => {
  it('pause : fige la position courante', () => {
    const paused = pausePlayback(playing, 15_000, DURATION);
    expect(paused).toMatchObject({ playing: false, position: 15, at: 15_000 });
  });

  it('lecture : reprend où on s’était arrêté', () => {
    const paused = { ...playing, playing: false, position: 15, at: 15_000 };
    const resumed = resumePlayback(paused, 40_000, DURATION);
    expect(resumed).toMatchObject({ playing: true, position: 15, at: 40_000 });
    expect(videoPosition(resumed, 45_000, DURATION)).toBeCloseTo(20);
  });

  it('lecture après la fin : repart du début', () => {
    expect(resumePlayback(playing, 90_000, DURATION)).toMatchObject({ playing: true, position: 0 });
  });

  it('avance à un moment donné', () => {
    const sought = seekPlayback(playing, 42, 10_000);
    expect(videoPosition(sought, 11_000, DURATION)).toBeCloseTo(43);
  });

  it('change la boucle sans faire sauter la position', () => {
    const looped = loopPlayback(playing, true, 30_000, DURATION);
    expect(looped).toMatchObject({ loop: true, position: 30, at: 30_000 });
  });
});

describe('positionGap', () => {
  it('en boucle, la fin et le début sont voisins', () => {
    expect(positionGap(59.9, 0.1, DURATION, true)).toBeCloseTo(0.2);
    expect(positionGap(59.9, 0.1, DURATION, false)).toBeCloseTo(59.8);
  });
});

describe('formatDuration', () => {
  it('affiche minutes et secondes, puis les heures', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(125.7)).toBe('2:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
