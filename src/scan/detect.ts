// Wykrywanie kart w klatce i prostowanie ich przez OpenCV (ładowane dopiero przy pierwszym użyciu).
import { dropNested, isCardShaped, orderCorners, quadArea, type Point, type Quad } from './geometry';

export const MAX_CARDS = 6;
export const WARP_W = 120;
export const WARP_H = 168;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cv = any;
let cvPromise: Promise<Cv> | null = null;

export function loadCv(): Promise<Cv> {
  cvPromise ??= import('@techstark/opencv-js').then(async (mod) => {
    let cv: Cv = (mod as Cv).default ?? mod;
    if (cv instanceof Promise) cv = await cv;
    if (!cv.Mat) {
      await new Promise<void>((resolve) => {
        cv.onRuntimeInitialized = () => resolve();
      });
    }
    return cv;
  });
  return cvPromise;
}

/** Znajduje do 6 czworokątów o proporcjach karty. Współrzędne w pikselach klatki. */
export function detectCards(cv: Cv, frame: ImageData): Quad[] {
  const src = cv.matFromImageData(frame);
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  const found: Quad[] = [];
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, edges, 40, 120);
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const minArea = 0.02 * frame.width * frame.height;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area >= minArea) {
        let pts: Point[] | null = null;
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * cv.arcLength(cnt, true), true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          pts = [0, 1, 2, 3].map((k) => ({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] }));
        } else {
          // Zaokrąglone rogi dają więcej wierzchołków: bierzemy prostokąt opisany, jeśli kontur go wypełnia.
          const box: Point[] = cv.RotatedRect.points(cv.minAreaRect(cnt));
          if (area / Math.max(1, quadArea(box)) > 0.85) pts = box.map((p) => ({ x: p.x, y: p.y }));
        }
        approx.delete();
        if (pts) {
          const quad = orderCorners(pts);
          if (isCardShaped(quad, frame.width, frame.height)) found.push(quad);
        }
      }
      cnt.delete();
    }
  } finally {
    [src, gray, edges, contours, hierarchy, kernel].forEach((m) => m.delete());
  }
  return dropNested(found, MAX_CARDS);
}

/** Prostuje kartę do pionowego obrazka 120×168. */
export function warpCard(cv: Cv, frame: ImageData, q: Quad): ImageData {
  const src = cv.matFromImageData(frame);
  const dst = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, q.flatMap((p) => [p.x, p.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, WARP_W, 0, WARP_W, WARP_H, 0, WARP_H]);
  const m = cv.getPerspectiveTransform(from, to);
  try {
    cv.warpPerspective(src, dst, m, new cv.Size(WARP_W, WARP_H));
    return new ImageData(new Uint8ClampedArray(dst.data), WARP_W, WARP_H);
  } finally {
    [src, dst, from, to, m].forEach((x) => x.delete());
  }
}
