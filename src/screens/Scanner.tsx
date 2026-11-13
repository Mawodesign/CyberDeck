import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '../data/catalog';
import { useActions, useCatalog } from '../data/hooks';
import { inventory } from '../data/inventory';
import { fingerprint, loadFingerprintIndex, matchCard, type FingerprintIndex } from '../domain/match';
import { cardsAcc, cardsWord } from '../domain/plural';
import { formatEur, isFoilOnly, priceOf } from '../domain/pricing';
import type { Printing } from '../domain/types';
import { grabFrame, startCamera } from '../scan/camera';
import { detectCards, loadCv, warpCard } from '../scan/detect';
import { quadCenter } from '../scan/geometry';
import { resolvePrinting, updateTracks, type Detection, type Track } from '../scan/tracker';
import { CardRow, Price, RarityChip } from '../ui/parts';

const FRAME_W = 640;
const TICK_MS = 300;
const PREF_KEY = 'knc-preferred-set';

type Status = 'loading' | 'live' | 'still' | 'denied' | 'error';

export function ScannerScreen() {
  const catalog = useCatalog();
  const { toast } = useActions();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stillRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tracksRef = useRef<Track[]>([]);
  const engineRef = useRef<{ cv: unknown; index: FingerprintIndex } | null>(null);

  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [frame, setFrame] = useState({ w: FRAME_W, h: 480 });
  const [stillUrl, setStillUrl] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [preferredSet, setPreferredSet] = useState<string | null>(() => localStorage.getItem(PREF_KEY));
  const [attempt, setAttempt] = useState(0);

  const setOf = useCallback((id: string) => catalog.byId.get(id)?.setCode, [catalog]);

  /** Wydanie, które zostanie dodane dla danej karty w kadrze, albo null, gdy trzeba wybrać. */
  const printingFor = useCallback((t: Track): Printing | null => {
    if (t.chosenPrintingId) return catalog.byId.get(t.chosenPrintingId) ?? null;
    if (t.state !== 'sure') return null;
    const id = resolvePrinting(t.match.candidates[0].printingIds, setOf, preferredSet);
    return id ? catalog.byId.get(id) ?? null : null;
  }, [catalog, preferredSet, setOf]);

  const processFrame = useCallback((source: HTMLVideoElement | HTMLImageElement, instant: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    canvasRef.current ??= document.createElement('canvas');
    const data = grabFrame(source, canvasRef.current, FRAME_W);
    if (!data) return;
    const detections: Detection[] = detectCards(engine.cv, data).map((quad) => {
      const card = warpCard(engine.cv, data, quad);
      return { quad, match: matchCard(fingerprint(card.data, card.width, card.height), engine.index) };
    });
    const prev = instant ? [] : tracksRef.current;
    tracksRef.current = updateTracks(prev, detections, performance.now(), data.width, instant);
    setFrame({ w: data.width, h: data.height });
    setTracks(tracksRef.current);
  }, []);

  // Silnik rozpoznawania i aparat.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let timer = 0;
    let alive = true;
    (async () => {
      try {
        setStatus('loading');
        setMessage('Ładowanie skanera…');
        const [{ cv }, index] = await Promise.all([loadCv(), loadFingerprintIndex(assetUrl('data/fingerprints.bin'))]);
        engineRef.current = { cv, index };
      } catch (e) {
        if (alive) {
          setStatus('error');
          setMessage(`Nie udało się załadować skanera: ${(e as Error).message}`);
        }
        return;
      }
      try {
        stop = await startCamera(videoRef.current!);
        if (!alive) return stop();
        setStatus('live');
        const tick = () => {
          if (!alive) return;
          if (!document.hidden && videoRef.current) processFrame(videoRef.current, false);
          timer = window.setTimeout(tick, TICK_MS);
        };
        tick();
      } catch (e) {
        if (!alive) return;
        const denied = (e as Error).name === 'NotAllowedError';
        setStatus(denied ? 'denied' : 'error');
        setMessage(denied ? 'Włącz dostęp do aparatu w Ustawieniach Safari, a potem spróbuj ponownie.' : (e as Error).message);
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      stop?.();
    };
  }, [processFrame, attempt]);

  const scanPhoto = (file: File | undefined) => {
    if (!file) return;
    if (stillUrl) URL.revokeObjectURL(stillUrl);
    tracksRef.current = [];
    setTracks([]);
    setStillUrl(URL.createObjectURL(file));
  };
  const onStillLoad = () => {
    if (!engineRef.current) {
      toast('Skaner jeszcze się ładuje, spróbuj za chwilę', true);
      return;
    }
    processFrame(stillRef.current!, true);
    if (tracksRef.current.length === 0) toast('Na zdjęciu nie znaleziono kart', true);
  };
  const backToCamera = () => {
    if (stillUrl) URL.revokeObjectURL(stillUrl);
    setStillUrl(null);
    tracksRef.current = [];
    setTracks([]);
  };

  const updateTrack = (id: number, patch: Partial<Track>) => {
    tracksRef.current = tracksRef.current.map((t) => (t.id === id ? { ...t, ...patch } : t));
    setTracks(tracksRef.current);
  };

  const choose = (trackId: number, printing: Printing) => {
    updateTrack(trackId, { chosenPrintingId: printing.id, state: 'sure' });
    localStorage.setItem(PREF_KEY, printing.setCode);
    setPreferredSet(printing.setCode);
    setChoosing(null);
  };

  const ready = useMemo(
    () => tracks.filter((t) => !t.added).map((t) => ({ track: t, printing: printingFor(t) })).filter((x) => x.printing !== null) as Array<{ track: Track; printing: Printing }>,
    [tracks, printingFor],
  );
  const visible = tracks.filter((t) => t.state !== 'pending' || t.chosenPrintingId);
  const sum = ready.reduce((s, { printing }) => s + (priceOf(printing, isFoilOnly(printing, catalog.prices), catalog.prices) ?? 0), 0);

  const addAll = async () => {
    for (const { track, printing } of ready) {
      await inventory.add(printing.id, isFoilOnly(printing, catalog.prices));
      updateTrack(track.id, { added: true });
    }
    toast(`Dodano ${ready.length} ${cardsAcc(ready.length)} do inwentarza`);
  };

  const choosingTrack = tracks.find((t) => t.id === choosing) ?? null;
  const showStill = stillUrl !== null;

  return (
    <div className="screen fixed">
      <div className="top">
        <h1>Skaner</h1>
        <span className="sub">
          {tracks.length === 0 ? 'Skieruj aparat na karty' : `${tracks.length} ${cardsWord(tracks.length)} w kadrze`}
        </span>
      </div>

      <div className="cam">
        <video ref={videoRef} playsInline muted style={{ visibility: showStill || status !== 'live' ? 'hidden' : 'visible' }} />
        {showStill && <img ref={stillRef} className="still" src={stillUrl} alt="Skanowane zdjęcie" onLoad={onStillLoad} />}
        {(status === 'live' || showStill) && (
          <svg viewBox={`0 0 ${frame.w} ${frame.h}`} preserveAspectRatio={showStill ? 'xMidYMid meet' : 'xMidYMid slice'}>
            {visible.map((t) => {
              const printing = printingFor(t);
              const color = t.added ? 'var(--green)' : printing ? 'var(--cyan)' : 'var(--amber)';
              const c = quadCenter(t.quad);
              const bottom = Math.max(...t.quad.map((p) => p.y));
              // Rozpoznana ilustracja w kilku wydaniach: znamy nazwę, brakuje tylko wyboru wydania.
              const known = printing ?? (t.state === 'sure' ? catalog.byId.get(t.match.candidates[0].printingIds[0]) : undefined);
              const name = known ? known.name.split(' — ')[0] : 'Nie rozpoznano';
              const line2 = t.added ? 'dodano'
                : printing ? formatEur(priceOf(printing, isFoilOnly(printing, catalog.prices), catalog.prices))
                  : known ? 'wybierz wydanie' : 'wybierz kartę';
              const w = Math.max(96, name.length * 8.2 + 16);
              return (
                <g key={t.id} onClick={() => setChoosing(t.id)} style={{ cursor: 'pointer' }}>
                  <polygon points={t.quad.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(45,226,230,0.06)" stroke={color} strokeWidth="3" />
                  <rect x={c.x - w / 2} y={bottom - 44} width={w} height={40} fill="rgba(10,6,18,0.92)" stroke={color} strokeWidth="1" />
                  <text x={c.x} y={bottom - 27} textAnchor="middle" fill="var(--text)" fontSize="14" fontFamily="var(--body)">{name}</text>
                  <text x={c.x} y={bottom - 10} textAnchor="middle" fill={t.added ? 'var(--green)' : printing ? 'var(--amber)' : 'var(--amber)'} fontSize="14" fontWeight="800" fontFamily="var(--display)">{line2}</text>
                </g>
              );
            })}
          </svg>
        )}
        {status === 'live' && !showStill && <div className="scanline" />}
        {status !== 'live' && !showStill && (
          <div className="cam-msg">
            <p>{message}</p>
            {(status === 'denied' || status === 'error') && (
              <button type="button" className="btn alt" onClick={() => setAttempt((n) => n + 1)}>Spróbuj ponownie</button>
            )}
          </div>
        )}
      </div>

      <div className="tray">
        <p>
          <span>{tracks.length === 0 ? 'Brak kart w kadrze' : `Rozpoznano ${ready.length + tracks.filter((t) => t.added).length} z ${tracks.length}`}</span>
          {ready.length > 0 && <Price value={Math.round(sum * 100) / 100} />}
        </p>
        <div className="actions">
          <button type="button" className="btn" disabled={ready.length === 0} onClick={addAll}>
            {ready.length <= 1 ? 'Dodaj kartę do inwentarza' : `Dodaj ${ready.length} ${cardsAcc(ready.length)} do inwentarza`}
          </button>
          {showStill
            ? <button type="button" className="btn ghost" onClick={backToCamera}>Aparat</button>
            : <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>Ze zdjęcia</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { scanPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {choosingTrack && (
        <div className="backdrop" onClick={() => setChoosing(null)}>
          <div className="chooser" onClick={(e) => e.stopPropagation()}>
            <h2>{choosingTrack.state === 'sure' && !choosingTrack.chosenPrintingId ? 'Które to wydanie?' : 'Która to karta?'}</h2>
            {(choosingTrack.state === 'sure' ? choosingTrack.match.candidates.slice(0, 1) : choosingTrack.match.candidates)
              .flatMap((c) => c.printingIds)
              .map((id) => catalog.byId.get(id))
              .filter((p): p is Printing => !!p)
              .map((p) => (
                <CardRow
                  key={p.id}
                  printing={p}
                  onClick={() => choose(choosingTrack.id, p)}
                  detail={<><RarityChip rarity={p.rarity} plain />, {p.set} {p.collectorNumber}</>}
                  right={<Price value={priceOf(p, isFoilOnly(p, catalog.prices), catalog.prices)} />}
                />
              ))}
            <p className="pad small dim" style={{ marginTop: 10 }}>Nie ma jej na liście? Znajdź kartę po nazwie w zakładce Ceny.</p>
          </div>
        </div>
      )}
    </div>
  );
}
