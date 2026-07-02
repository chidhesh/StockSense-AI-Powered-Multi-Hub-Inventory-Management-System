import QRCode from 'qrcode';

export async function generateQRCode(data: string): Promise<string> {
  // Generate higher quality QR code
  return QRCode.toDataURL(data, {
    width: 512, // Larger size for better scanning
    margin: 4,   // Larger quiet zone
    errorCorrectionLevel: 'H', // High error correction
    color: { dark: '#000000', light: '#FFFFFF' }, // High contrast black/white
  });
}

export async function generateQRCodeSVG(data: string): Promise<string> {
  // Generate high-quality SVG
  return QRCode.toString(data, { 
    type: 'svg', 
    margin: 4,
    errorCorrectionLevel: 'H',
    width: 512
  });
}

export function generateComponentQRData(componentId: string, componentName: string, centerId: string): string {
  return JSON.stringify({ type: 'inventory_component', componentId, componentName, centerId });
}

export interface ParsedQR {
  type: 'inventory_component' | 'student';
  componentId?: string;
  componentName?: string;
  centerId?: string;
  sku?: string;
  studentId?: string;
  fullName?: string;
  rollNumber?: string;
  history?: {
    borrowed: string[];
    returned: string[];
    defected: string[];
  };
}

export function parseQRData(raw: string): ParsedQR | null {
  if (!raw) return null;
  
  const trimmedRaw = raw.trim();
  
  // Try JSON first
  try {
    const parsed = JSON.parse(trimmedRaw);
    if (parsed.type === 'inventory_component' || parsed.type === 'student') {
      return {
        ...parsed,
        type: parsed.type, // Ensure it's the right type
      };
    }
  } catch {
    // Not JSON
  }

  // Handle INV:CENTER_ID:SKU format
  if (trimmedRaw.toUpperCase().startsWith('INV:')) {
    const parts = trimmedRaw.split(':');
    if (parts.length >= 3) {
      return {
        type: 'inventory_component',
        centerId: parts[1],
        sku: parts[2],
      };
    }
  }

  // Handle plain ID format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(trimmedRaw)) {
    return {
      type: 'inventory_component',
      componentId: trimmedRaw,
      studentId: trimmedRaw,
    };
  }

  // Handle plain roll numbers (alphanumeric, hyphens, underscores)
  if (/^[a-zA-Z0-9-_]+$/.test(trimmedRaw) && trimmedRaw.length >= 3) {
    return {
      type: 'student',
      rollNumber: trimmedRaw,
    };
  }

  // Last resort: if it looks like a component or student in some other format
  return null;
}

export function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.2);
  } catch (e) {
    console.warn('Audio feedback failed:', e);
  }
}

export function generateSKU(category: string, name: string, index: number): string {
  const cat = category.substring(0, 3).toUpperCase();
  const nm = name.substring(0, 3).toUpperCase().replace(/\s/g, '');
  const num = String(index).padStart(4, '0');
  return `${cat}-${nm}-${num}`;
}
