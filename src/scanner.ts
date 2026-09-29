/**
 * Skanowanie kodów aparatem.
 * - Chrome/Android: natywny BarcodeDetector (jeśli obsługuje EAN).
 * - Safari/iOS: brak BarcodeDetector → biblioteka ZXing dołączona do aplikacji (ładowana leniwie,
 *   z własnego serwera – bez CDN, działa offline po pierwszym uruchomieniu).
 */
import { isValidGtin } from './lib/barcode';

export interface ScannerHandle {
  stop: () => void;
  engine: 'native' | 'zxing';
  torch?: (on: boolean) => Promise<void>;
}

export class CameraError extends Error {
  constructor(
    message: string,
    public readonly kind: 'denied' | 'notfound' | 'insecure' | 'unsupported' | 'other',
  ) {
    super(message);
  }
}

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string; format: string }[]>;
}
type NativeDetectorCtor = {
  new (opts: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
};

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('Aparat działa tylko przez HTTPS.', 'insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('Ta przeglądarka nie udostępnia aparatu.', 'unsupported');
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === 'NotAllowedError' || name === 'SecurityError')
      throw new CameraError('Brak zgody na aparat. Włącz dostęp w Ustawieniach iPhone’a (Safari → Aparat) albo wpisz kod ręcznie.', 'denied');
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CameraError('Nie znaleziono aparatu.', 'notfound');
    throw new CameraError(`Nie udało się uruchomić aparatu (${name}).`, 'other');
  }
}

/** Akceptuje kod dopiero po dwóch zgodnych odczytach (albo jednym z poprawną sumą kontrolną). */
function makeConfirmer(onCode: (code: string) => void) {
  let last = '';
  let done = false;
  return (raw: string) => {
    if (done) return;
    const code = raw.trim();
    if (!/^\d{6,14}$/.test(code)) return;
    if (isValidGtin(code) || code === last) {
      done = true;
      onCode(code);
    }
    last = code;
  };
}

export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<ScannerHandle> {
  const stream = await openCamera();
  video.setAttribute('playsinline', 'true');
  video.setAttribute('muted', 'true');
  video.muted = true;
  video.srcObject = stream;
  await video.play().catch(() => undefined);
  const confirm = makeConfirmer(onCode);
  const track = stream.getVideoTracks()[0];
  const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
  const torch = caps.torch
    ? async (on: boolean) => {
        await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      }
    : undefined;
  const stopStream = () => {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  const Native = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      const formats = FORMATS.filter((f) => supported.includes(f));
      if (formats.includes('ean_13')) {
        const detector = new Native({ formats });
        let stopped = false;
        const loop = async () => {
          if (stopped) return;
          if (video.readyState >= 2) {
            try {
              const r = await detector.detect(video);
              if (r[0]) confirm(r[0].rawValue);
            } catch {
              /* klatka niegotowa */
            }
          }
          setTimeout(loop, 120);
        };
        void loop();
        return {
          engine: 'native',
          torch,
          stop: () => {
            stopped = true;
            stopStream();
          },
        };
      }
    } catch {
      /* spadamy na ZXing */
    }
  }

  const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('@zxing/library');
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new BrowserMultiFormatReader(hints, 150);
  await reader.decodeFromStream(stream, video, (result) => {
    if (result) confirm(result.getText());
  });
  return {
    engine: 'zxing',
    torch,
    stop: () => {
      reader.reset();
      stopStream();
    },
  };
}
