/**
 * Lecture d'une vidéo, commandée par le MJ et reproduite par chaque fenêtre.
 *
 * La vidéo n'est pas diffusée vers la TV : chaque fenêtre la lit elle-même.
 * Seul cet état circule. La position est calée sur `Date.now()`, horloge
 * commune à la vue MJ et au plateau (même PC) : les deux restent alignés.
 */
export interface VideoPlayback {
  playing: boolean;
  loop: boolean;
  /** Son coupé sur la TV (l'aperçu du MJ est toujours muet). */
  muted: boolean;
  /** Volume sur la TV, de 0 à 1, indépendant de `muted`. */
  volume: number;
  /** Position en secondes à l'instant `at`. */
  position: number;
  /** `Date.now()` du dernier changement : en lecture, la position avance depuis. */
  at: number;
}

/** Une vidéo importée démarre en boucle, en lecture, sans le son (volume au maximum). */
export function createPlayback(now: number): VideoPlayback {
  return { playing: true, loop: true, muted: true, volume: 1, position: 0, at: now };
}

/**
 * Position courante, en secondes. En boucle, elle repart de 0 à la fin ;
 * sinon elle s'arrête à la fin. Durée inconnue : la position avance sans borne.
 */
export function videoPosition(playback: VideoPlayback, now: number, duration: number | null): number {
  const elapsed = playback.playing ? Math.max(0, (now - playback.at) / 1000) : 0;
  const position = playback.position + elapsed;
  if (!isKnownDuration(duration)) return position;
  return playback.loop ? position % duration : Math.min(position, duration);
}

/** Lue jusqu'au bout, sans boucle. */
export function hasEnded(playback: VideoPlayback, now: number, duration: number | null): boolean {
  if (playback.loop || !isKnownDuration(duration)) return false;
  return videoPosition(playback, now, duration) >= duration - END_TOLERANCE;
}

export function pausePlayback(playback: VideoPlayback, now: number, duration: number | null): VideoPlayback {
  return { ...playback, playing: false, position: videoPosition(playback, now, duration), at: now };
}

/** Reprend la lecture ; une vidéo arrivée au bout repart du début. */
export function resumePlayback(playback: VideoPlayback, now: number, duration: number | null): VideoPlayback {
  const position = hasEnded(playback, now, duration) ? 0 : videoPosition(playback, now, duration);
  return { ...playback, playing: true, position, at: now };
}

export function seekPlayback(playback: VideoPlayback, position: number, now: number): VideoPlayback {
  return { ...playback, position: Math.max(0, position), at: now };
}

/** Change la boucle sans faire sauter la position courante. */
export function loopPlayback(
  playback: VideoPlayback,
  loop: boolean,
  now: number,
  duration: number | null,
): VideoPlayback {
  return { ...playback, loop, position: videoPosition(playback, now, duration), at: now };
}

/** Écart entre deux positions ; en boucle, la fin et le début sont voisins. */
export function positionGap(a: number, b: number, duration: number | null, loop: boolean): number {
  const gap = Math.abs(a - b);
  return loop && isKnownDuration(duration) ? Math.min(gap, duration - gap) : gap;
}

/** Durée ou position lisible : « 2:05 », « 1:02:05 » au-delà d'une heure. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Certaines vidéos (WebM sans index…) n'annoncent pas leur durée. */
export function isKnownDuration(duration: number | null): duration is number {
  return duration !== null && Number.isFinite(duration) && duration > 0;
}

/** Marge pour considérer une vidéo arrivée au bout (s). */
const END_TOLERANCE = 0.05;
