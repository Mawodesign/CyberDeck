/** Uruchamia tylną kamerę w elemencie video. Zwraca funkcję zatrzymującą strumień. */
export async function startCamera(video: HTMLVideoElement): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Ta przeglądarka nie udostępnia aparatu. Otwórz aplikację przez HTTPS w Safari.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  return () => {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}

/** Rysuje źródło (video lub obraz) na płótnie o podanej szerokości i zwraca piksele. */
export function grabFrame(source: HTMLVideoElement | HTMLImageElement, canvas: HTMLCanvasElement, width: number): ImageData | null {
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!sw || !sh) return null;
  canvas.width = width;
  canvas.height = Math.round((sh / sw) * width);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
