import QRCode from 'qrcode';

export async function generateQRCode(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    width: 256,
    margin: 2,
    color: { dark: '#0F62FE', light: '#FFFFFF' },
  });
}

export async function generateQRCodeSVG(data: string): Promise<string> {
  return QRCode.toString(data, { type: 'svg', margin: 2 });
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
  
  // Try JSON first
  try {
    const parsed = JSON.parse(raw);
    if (parsed.type === 'inventory_component' || parsed.type === 'student') return parsed;
  } catch {
    // Not JSON
  }

  // Handle INV:CENTER_ID:SKU format
  if (raw.startsWith('INV:')) {
    const parts = raw.split(':');
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
  if (uuidRegex.test(raw)) {
    // If it's just a UUID, we don't know if it's a student or component yet.
    // Return a generic 'unknown' type or both, let the caller decide based on their data.
    return {
      type: 'inventory_component', // Keeping existing behavior but adding the ID
      componentId: raw,
      studentId: raw, // Also include as studentId so caller can check both
    };
  }

  // Handle plain roll numbers (alphanumeric, hyphens)
  if (/^[a-zA-Z0-9-]+$/.test(raw) && raw.length >= 3) {
    return {
      type: 'student',
      rollNumber: raw,
    };
  }

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
