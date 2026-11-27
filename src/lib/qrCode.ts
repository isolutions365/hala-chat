import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { ContactItem, UserProfile } from '../types';

export interface HalaContactPayload {
  v: 1;
  type: 'hala_contact';
  id: string;
  name: string;
  phone: string;
  avatarUrl?: string | null;
  status?: string;
}

/**
 * Creates a JSON encoded string payload for personal QR code
 */
export function generateContactQrPayload(profile: {
  id?: string;
  name: string;
  phoneNumber: string;
  avatarUrl?: string | null;
  status?: string;
}): string {
  const userId = profile.id || `user_${profile.phoneNumber.replace(/\D/g, '')}`;
  const payload: HalaContactPayload = {
    v: 1,
    type: 'hala_contact',
    id: userId,
    name: profile.name.trim(),
    phone: profile.phoneNumber.trim(),
    avatarUrl: profile.avatarUrl || null,
    status: profile.status?.trim() || "Hey there, I'm using Hala",
  };
  return JSON.stringify(payload);
}

/**
 * Generates a high-quality styled QR Code data URL with Hala branding colors
 */
export async function generateContactQrDataUrl(
  profile: {
    id?: string;
    name: string;
    phoneNumber: string;
    avatarUrl?: string | null;
    status?: string;
  },
  options?: {
    size?: number;
    darkColor?: string;
    lightColor?: string;
  }
): Promise<string> {
  const payload = generateContactQrPayload(profile);
  const size = options?.size || 512;
  const darkColor = options?.darkColor || '#1e293b'; // slate-800
  const lightColor = options?.lightColor || '#ffffff';

  try {
    const dataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H', // High error correction for robust camera scanning
      margin: 2,
      width: size,
      color: {
        dark: darkColor,
        light: lightColor,
      },
    });
    return dataUrl;
  } catch (error) {
    console.error('Error generating QR code data URL:', error);
    throw error;
  }
}

/**
 * Parses decoded text from QR scanner.
 * Supports:
 * 1. Hala JSON payload `{ type: 'hala_contact', ... }`
 * 2. Hala deep link URL `hala://contact?...` or `https://hala.app/c/...`
 * 3. Standard vCard `BEGIN:VCARD...`
 * 4. Plain phone number or contact string
 */
export function parseContactQrPayload(rawText: string): ContactItem | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const trimmed = rawText.trim();

  // 1. Try Hala JSON format
  try {
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const data = JSON.parse(trimmed);
      if (data.type === 'hala_contact' || data.phone || data.id) {
        const phone = data.phone || data.phoneNumber || '';
        const id = data.id || `user_${phone.replace(/\D/g, '') || Date.now()}`;
        return {
          id,
          name: data.name || (phone ? `User ${phone}` : 'Hala Contact'),
          phone,
          avatar_url: data.avatarUrl || data.avatar_url || null,
          status: data.status || "Hey there, I'm using Hala",
        };
      }
    }
  } catch {
    // Continue to next format
  }

  // 2. Try URL format (e.g. hala://contact?id=...&name=... or https://...)
  try {
    if (trimmed.startsWith('hala://contact') || trimmed.includes('/contact?') || trimmed.includes('hala_id=')) {
      const queryString = trimmed.includes('?') ? trimmed.split('?')[1] : trimmed;
      const params = new URLSearchParams(queryString);
      const id = params.get('id') || params.get('hala_id');
      const name = params.get('name') || params.get('n');
      const phone = params.get('phone') || params.get('p') || '';
      const avatarUrl = params.get('avatar') || params.get('a') || null;
      const status = params.get('status') || params.get('s') || undefined;

      if (id || phone || name) {
        const safeId = id || `user_${phone.replace(/\D/g, '') || Date.now()}`;
        return {
          id: safeId,
          name: name ? decodeURIComponent(name) : phone ? `User ${phone}` : 'Hala Contact',
          phone,
          avatar_url: avatarUrl ? decodeURIComponent(avatarUrl) : null,
          status: status ? decodeURIComponent(status) : "Hey there, I'm using Hala",
        };
      }
    }
  } catch {
    // Continue
  }

  // 3. Try vCard format
  if (trimmed.toUpperCase().includes('BEGIN:VCARD')) {
    const lines = trimmed.split(/\r?\n/);
    let name = '';
    let phone = '';
    let status = '';

    for (const line of lines) {
      if (line.toUpperCase().startsWith('FN:') || line.toUpperCase().startsWith('N:')) {
        name = line.substring(line.indexOf(':') + 1).replace(/;/g, ' ').trim();
      } else if (line.toUpperCase().startsWith('TEL') && line.includes(':')) {
        phone = line.substring(line.indexOf(':') + 1).trim();
      } else if (line.toUpperCase().startsWith('NOTE:') || line.toUpperCase().startsWith('TITLE:')) {
        status = line.substring(line.indexOf(':') + 1).trim();
      }
    }

    if (name || phone) {
      const id = `user_${phone ? phone.replace(/\D/g, '') : Date.now()}`;
      return {
        id,
        name: name || phone,
        phone,
        status: status || "Hey there, I'm using Hala",
      };
    }
  }

  // 4. Try plain telephone link (tel:+123456)
  if (trimmed.toLowerCase().startsWith('tel:')) {
    const phone = trimmed.substring(4).trim();
    return {
      id: `user_${phone.replace(/\D/g, '')}`,
      name: phone,
      phone,
      status: "Hey there, I'm using Hala",
    };
  }

  // 5. Plain phone number string (e.g. +971501234567)
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 7 && (trimmed.startsWith('+') || /^[0-9\s\-()+]+$/.test(trimmed))) {
    return {
      id: `user_${digitsOnly}`,
      name: trimmed,
      phone: trimmed,
      status: "Hey there, I'm using Hala",
    };
  }

  // If text is meaningful, return as raw contact
  if (trimmed.length > 2 && trimmed.length < 100) {
    return {
      id: `user_${trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name: trimmed,
      phone: '',
      status: "Added via QR code scan",
    };
  }

  return null;
}

/**
 * Scans a video element frame for QR code using jsQR
 */
export function scanQrFromVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): { data: string; location?: any } | null {
  if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
    return null;
  }

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);

  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert',
  });

  if (code && code.data) {
    return { data: code.data, location: code.location };
  }

  return null;
}

/**
 * Scans an uploaded image file for QR code
 */
export async function scanQrFromImageFile(file: File): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (code && code.data) {
          resolve(code.data);
        } else {
          resolve(null);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image file'));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
