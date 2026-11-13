// Osobny moduł ze statycznym importem OpenCV. Ładowany leniwie przez detect.ts.
// Nie importować '@techstark/opencv-js' przez import() wprost: paczka eksportuje obiekt
// z metodą `then`, więc po zbudowaniu aplikacji dynamiczny import kończy się błędem
// „Promise.prototype.then called on incompatible receiver”.
import cvModule from '@techstark/opencv-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Cv = any;

export async function initCv(): Promise<{ cv: Cv }> {
  let cv: Cv = cvModule;
  if (cv instanceof Promise) cv = await cv;
  if (!cv.Mat) {
    await new Promise<void>((resolve) => {
      cv.onRuntimeInitialized = () => resolve();
    });
  }
  // Zwracamy w opakowaniu, żeby `await` nie próbował traktować modułu OpenCV jak obietnicy.
  return { cv };
}
