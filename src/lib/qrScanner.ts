import { Html5Qrcode, Html5QrcodeSupportedFormats, type CameraDevice } from 'html5-qrcode';

export type QrCameraDevice = { id: string; label: string };

export function isSecureCameraContext(): boolean {
  return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

/** Request camera permission so enumerateDevices returns labels and scanners can start. */
export async function requestCameraPermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  }
}

export async function listCameras(): Promise<QrCameraDevice[]> {
  const devices = await Html5Qrcode.getCameras();
  return (devices || []).map((c: CameraDevice) => ({
    id: c.id,
    label: c.label || `Camera ${c.id.slice(0, 8)}`,
  }));
}

export function pickPreferredCameraId(cameras: QrCameraDevice[]): string | null {
  if (!cameras.length) return null;
  const back = cameras.find((c) => /back|rear|environment|world/i.test(c.label));
  if (back) return back.id;
  const external = cameras.find((c) => /usb|external|hd/i.test(c.label));
  if (external) return external.id;
  return cameras[cameras.length - 1]?.id ?? cameras[0].id;
}

export function buildLiveScanConfig() {
  return {
    fps: 20, // Increased FPS for faster detection
    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
      const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
      if (!Number.isFinite(minEdge) || minEdge < 50) {
        return { width: 280, height: 280 };
      }
      // Slightly larger box for easier alignment
      const size = Math.max(250, Math.min(400, Math.floor(minEdge * 0.8)));
      return { width: size, height: size };
    },
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true,
    },
    aspectRatio: 1.777778, // 16:9 aspect ratio
    disableFlip: false,
  };
}

export function mapCameraError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  if (e?.name === 'NotAllowedError' || e?.message?.toLowerCase().includes('permission')) {
    return 'Camera access denied. Allow camera in your browser site settings, then refresh.';
  }
  if (e?.name === 'NotFoundError' || e?.message?.toLowerCase().includes('no camera')) {
    return 'No camera found on this device.';
  }
  if (e?.name === 'NotReadableError' || e?.message?.toLowerCase().includes('in use')) {
    return 'Camera is in use by another app. Close it and try again.';
  }
  return e?.message || 'Could not start the camera scanner.';
}

export async function waitForElementReady(elementId: string, attempts = 12): Promise<HTMLElement> {
  for (let i = 0; i < attempts; i++) {
    const el = document.getElementById(elementId);
    if (el && el.clientWidth > 0 && el.clientHeight > 0) return el;
    await new Promise((r) => requestAnimationFrame(r));
  }
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`Scanner element #${elementId} not found`);
  return el;
}

export async function stopLiveQrScanner(scanner: Html5Qrcode | null): Promise<void> {
  if (!scanner) return;
  try {
    if (scanner.isScanning) await scanner.stop();
  } catch {
    /* ignore */
  }
  try {
    scanner.clear();
  } catch {
    /* ignore */
  }
}

export async function startLiveQrScanner(options: {
  elementId: string;
  onScan: (decodedText: string) => void | Promise<void>;
  cameraId?: string;
  scanner?: Html5Qrcode | null;
}): Promise<Html5Qrcode> {
  if (!isSecureCameraContext()) {
    throw new Error('Camera requires HTTPS or localhost.');
  }

  await requestCameraPermission();
  await waitForElementReady(options.elementId);

  const cameras = await listCameras();
  if (!cameras.length) throw new Error('No cameras found');

  const cameraId = options.cameraId || pickPreferredCameraId(cameras) || cameras[0].id;
  let scanner = options.scanner;

  if (scanner) {
    await stopLiveQrScanner(scanner);
  } else {
    scanner = new Html5Qrcode(options.elementId, { verbose: false });
  }

  await scanner.start(
    cameraId,
    buildLiveScanConfig(),
    async (decodedText) => {
      try {
        await options.onScan(decodedText);
      } catch (err) {
        console.error('QR scan handler error:', err);
      }
    },
    () => {
      /* per-frame decode miss — expected while aiming */
    }
  );

  return scanner;
}

export async function scanQrFromFile(file: File, elementId: string): Promise<string> {
  const scanner = new Html5Qrcode(elementId, { verbose: false });
  try {
    return await scanner.scanFile(file, false);
  } finally {
    try {
      scanner.clear();
    } catch {
      /* ignore */
    }
  }
}
