export interface ImageCompressionResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  savingsPercentage: number;
}

export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxFileSizeKB?: number;
  mimeType?: 'image/jpeg' | 'image/webp';
}

/**
 * Compress an image client-side to minimize upload size & save bandwidth before uploading to Firebase Storage.
 */
export async function compressImage(
  file: File | Blob,
  maxWidth = 1440,
  maxHeight = 1440,
  quality = 0.80,
  options?: CompressImageOptions
): Promise<ImageCompressionResult> {
  const effectiveMaxWidth = options?.maxWidth ?? maxWidth;
  const effectiveMaxHeight = options?.maxHeight ?? maxHeight;
  const initialQuality = options?.quality ?? quality;
  const maxFileSizeKB = options?.maxFileSizeKB;
  const mimeType = options?.mimeType || 'image/jpeg';
  const originalSize = file.size || 0;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect-ratio preserving dimensions
        if (width > effectiveMaxWidth || height > effectiveMaxHeight) {
          if (width / height > effectiveMaxWidth / effectiveMaxHeight) {
            height = Math.round((height * effectiveMaxWidth) / width);
            width = effectiveMaxWidth;
          } else {
            width = Math.round((width * effectiveMaxHeight) / height);
            height = effectiveMaxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        // Draw image with smooth scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        let currentQuality = initialQuality;

        // Function to create blob with current quality
        const createBlob = (q: number): Promise<Blob | null> => {
          return new Promise((res) => canvas.toBlob((b) => res(b), mimeType, q));
        };

        let blob = await createBlob(currentQuality);

        // Iteratively adjust quality if maxFileSizeKB is specified and current blob exceeds limit
        if (maxFileSizeKB && blob) {
          const maxBytes = maxFileSizeKB * 1024;
          let attempts = 0;
          while (blob && blob.size > maxBytes && currentQuality > 0.35 && attempts < 4) {
            currentQuality -= 0.12;
            attempts++;
            blob = await createBlob(currentQuality);
          }
        }

        // Generate dataUrl once at final quality
        const dataUrl = canvas.toDataURL(mimeType, currentQuality);

        if (blob) {
          const compressedSize = blob.size;
          const savedBytes = Math.max(0, originalSize - compressedSize);
          const savingsPercentage = originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;

          console.info(
            `[Image Compression] Original: ${(originalSize / 1024).toFixed(1)}KB -> Compressed: ${(compressedSize / 1024).toFixed(1)}KB (${savingsPercentage}% bandwidth saved)`
          );

          resolve({
            blob,
            dataUrl,
            width,
            height,
            originalSize,
            compressedSize,
            savedBytes,
            savingsPercentage,
          });
        } else {
          reject(new Error('Image compression failed to produce blob'));
        }
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

export async function compressAvatar(source: string | Blob): Promise<string> {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  for (const size of [400, 280, 180, 96]) {
    const { dataUrl } = await compressImage(blob, size, size, 0.7);
    if (dataUrl.length <= 60000) return dataUrl;
  }
  throw new Error('Unable to prepare profile photo. Please choose a smaller JPG or PNG image.');
}
