import { expect, test } from 'vitest';
import type { MatchResult } from '../domain/match';
import type { Quad } from './geometry';
import { resolvePrinting, STABLE_FRAMES, TRACK_TTL_MS, UNSURE_FRAMES, updateTracks, type Track } from './tracker';

const quad = (x: number): Quad => [{ x, y: 0 }, { x: x + 60, y: 0 }, { x: x + 60, y: 84 }, { x, y: 84 }];
const sure = (artKey: string): MatchResult => ({ confident: true, candidates: [{ artKey, printingIds: [artKey], score: 0.9 }] });
const unsure: MatchResult = { confident: false, candidates: [{ artKey: 'a', printingIds: ['a'], score: 0.5 }] };

function run(frames: MatchResult[], instant = false): Track {
  let tracks: Track[] = [];
  frames.forEach((m, i) => {
    tracks = updateTracks(tracks, [{ quad: quad(100 + i), match: m }], i * 300, 640, instant);
  });
  expect(tracks).toHaveLength(1);
  return tracks[0];
}

test('karta staje się pewna dopiero po 3 zgodnych rozpoznaniach z rzędu', () => {
  expect(run([sure('a'), sure('a')]).state).toBe('pending');
  expect(run(Array(STABLE_FRAMES).fill(sure('a'))).state).toBe('sure');
  expect(run([sure('a'), sure('b'), sure('a'), sure('a')]).state).toBe('pending');
});

test('raz rozpoznana karta nie zmienia się od pojedynczych błędnych klatek', () => {
  const t = run([sure('a'), sure('a'), sure('a'), sure('b'), unsure]);
  expect(t.state).toBe('sure');
  expect(t.artKey).toBe('a');
});

test('brak pewnego rozpoznania przez 5 klatek daje status do wyboru', () => {
  expect(run(Array(UNSURE_FRAMES - 1).fill(unsure)).state).toBe('pending');
  expect(run(Array(UNSURE_FRAMES).fill(unsure)).state).toBe('unsure');
});

test('tryb zdjęcia rozstrzyga od razu', () => {
  expect(run([sure('a')], true).state).toBe('sure');
  expect(run([unsure], true).state).toBe('unsure');
});

test('dwie karty są śledzone osobno, a znikająca wygasa po czasie', () => {
  let tracks = updateTracks([], [{ quad: quad(0), match: sure('a') }, { quad: quad(400), match: sure('b') }], 0, 640);
  expect(tracks).toHaveLength(2);
  tracks = updateTracks(tracks, [{ quad: quad(5), match: sure('a') }], 300, 640);
  expect(tracks).toHaveLength(2);
  tracks = updateTracks(tracks, [{ quad: quad(5), match: sure('a') }], TRACK_TTL_MS + 100, 640);
  expect(tracks.map((t) => t.artKey)).toEqual(['a']);
});

test('ręcznie wybrane wydanie nie jest nadpisywane', () => {
  let tracks = updateTracks([], [{ quad: quad(0), match: unsure }], 0, 640);
  tracks = tracks.map((t) => ({ ...t, chosenPrintingId: 'x', state: 'sure' as const }));
  tracks = updateTracks(tracks, [{ quad: quad(2), match: sure('b') }], 300, 640);
  expect(tracks[0].chosenPrintingId).toBe('x');
});

test('resolvePrinting: jedyne wydanie, zapamiętany zestaw albo brak rozstrzygnięcia', () => {
  const setOf = (id: string) => ({ r1: 'retail', b1: 'beta', r2: 'retail' })[id];
  expect(resolvePrinting(['r1'], setOf, null)).toBe('r1');
  expect(resolvePrinting(['r1', 'b1'], setOf, null)).toBeNull();
  expect(resolvePrinting(['r1', 'b1'], setOf, 'beta')).toBe('b1');
  expect(resolvePrinting(['r1', 'r2', 'b1'], setOf, 'retail')).toBeNull();
});
