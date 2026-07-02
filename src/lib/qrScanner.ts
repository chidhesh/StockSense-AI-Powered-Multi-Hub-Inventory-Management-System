import { Html5Qrcode, Html5QrcodeSupportedFormats, type CameraDevice } from 'html5-qrcode';
import { BrowserMultiFormatReader } from '@zxing/library';

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
  try {
    const devices = await Html5Qrcode.getCameras();
    return (devices || []).map((c: CameraDevice) => ({
      id: c.id,
      label: c.label || `Camera ${c.id.slice(0, 8)}`,
    }));
  } catch {
    return [];
  }
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
    fps: 20, // Higher FPS for better real-time scanning
    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
      const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
      if (!Number.isFinite(minEdge) || minEdge < 50) {
        return { width: 280, height: 280 };
      }
      const size = Math.max(300, Math.min(800, Math.floor(minEdge * 0.85)));
      return { width: size, height: size };
    },
    formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.DATA_MATRIX,
      Html5QrcodeSupportedFormats.PDF_417,
      Html5QrcodeSupportedFormats.AZTEC
    ],
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: false, // Disable for more consistent scanning
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

export async function waitForElementReady(elementId: string, attempts = 30): Promise<HTMLElement> {
  for (let i = 0; i < attempts; i++) {
    const el = document.getElementById(elementId);
    if (el && el.clientWidth > 0 && el.clientHeight > 0) return el;
    await new Promise((r) => setTimeout(r, 100));
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
    scanner = new Html5Qrcode(options.elementId, { verbose: true });
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
    (errorMessage) => {
      console.debug('QR scan decode miss:', errorMessage);
    }
  );

  return scanner;
}

// Advanced image preprocessing with multiple variations
type ProcessedImage = {
  file: File;
  description: string;
};

async function preprocessImageVariations(file: File): Promise<ProcessedImage[]> {
  // First load the image
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const tempImg = new Image();
    tempImg.onload = () => resolve(tempImg);
    tempImg.onerror = reject;
    tempImg.src = URL.createObjectURL(file);
  });
  
  const variations: ProcessedImage[] = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    return [{ file, description: 'original' }];
  }

  // Scale to reasonable sizes
  const sizes = [1024, 1536, 2048];
  
  for (const maxSize of sizes) {
    let { width, height } = img;
    
    // Scale image
    if (width > maxSize || height > maxSize) {
      const ratio = Math.min(maxSize / width, maxSize / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    }
    
    canvas.width = width;
    canvas.height = height;

    // 1. Original scaled
    ctx.drawImage(img, 0, 0, width, height);
    let blob = await new Promise<Blob | null>((res) => 
      canvas.toBlob(res, 'image/png', 0.98)
    );
    if (blob) {
      variations.push({
        file: new File([blob], `${file.name}_scaled_${maxSize}.png`, { type: 'image/png' }),
        description: `scaled to ${maxSize}px`
      });
    }

    // 2. High contrast and brightness
    ctx.drawImage(img, 0, 0, width, height);
    ctx.filter = 'contrast(1.5) brightness(1.2)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    blob = await new Promise<Blob | null>((res) => 
      canvas.toBlob(res, 'image/png', 0.98)
    );
    if (blob) {
      variations.push({
        file: new File([blob], `${file.name}_enhanced_${maxSize}.png`, { type: 'image/png' }),
        description: `enhanced (high contrast) at ${maxSize}px`
      });
    }

    // 3. Grayscale
    ctx.drawImage(img, 0, 0, width, height);
    ctx.filter = 'grayscale(100%) contrast(1.4) brightness(1.1)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    blob = await new Promise<Blob | null>((res) => 
      canvas.toBlob(res, 'image/png', 0.98)
    );
    if (blob) {
      variations.push({
        file: new File([blob], `${file.name}_grayscale_${maxSize}.png`, { type: 'image/png' }),
        description: `grayscale at ${maxSize}px`
      });
    }

    // 4. Very high contrast (aggressive)
    ctx.drawImage(img, 0, 0, width, height);
    ctx.filter = 'contrast(2) brightness(1.3) saturate(0)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    blob = await new Promise<Blob | null>((res) => 
      canvas.toBlob(res, 'image/png', 0.98)
    );
    if (blob) {
      variations.push({
        file: new File([blob], `${file.name}_aggressive_${maxSize}.png`, { type: 'image/png' }),
        description: `aggressive enhancement at ${maxSize}px`
      });
    }
  }

  // Add original as fallback
  variations.push({ file, description: 'original file' });
  
  return variations;
}

export async function scanQrFromFile(file: File, elementId: string): Promise<string> {
  // Generate multiple preprocessed variations
  console.log('Generating preprocessed image variations');
  const variations = await preprocessImageVariations(file);
  console.log(`Generated ${variations.length} image variations`);
  
  const zxingReader = new BrowserMultiFormatReader();
  
  // First, try ZXING on all variations (often more reliable)
  console.log('First trying ZXING library with all variations');
  for (const variation of variations) {
    try {
      console.log(`Trying ZXING with ${variation.description}`);
      const imgEl = await createImageElement(variation.file);
      const result = await zxingReader.decodeFromImageElement(imgEl);
      console.log(`SUCCESS with ZXING - ${variation.description}`);
      return result.text;
    } catch (err) {
      console.warn(`ZXING failed with ${variation.description}:`, err);
    }
  }

  // Then try html5-qrcode
  console.log('Trying html5-qrcode');
  const html5Scanner = new Html5Qrcode(elementId, { verbose: true });
  
  try {
    for (const variation of variations) {
      for (const showImage of [true, false]) {
        try {
          console.log(`Trying html5-qrcode with ${variation.description} (showImage=${showImage})`);
          const result = await html5Scanner.scanFile(variation.file, showImage);
          console.log(`SUCCESS with html5-qrcode - ${variation.description}`);
          return result;
        } catch (err) {
          console.warn(`html5-qrcode failed:`, err);
        }
      }
    }
  } finally {
    try {
      html5Scanner.clear();
    } catch {
      /* ignore */
    }
  }

  console.error('All scan methods failed for all variations');
  throw new Error('QR recognition failed. Try using a clearer, well-lit image and ensure the QR code is fully visible and flat.');
}

// Helper to create an image element from a file
async function createImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
