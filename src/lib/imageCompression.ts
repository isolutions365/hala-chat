/**
 * Compress an image client-side to minimize upload size & save bandwidth
 */
export async function compressImage(
  file: File | Blob,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.75
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect-ratio preserving dimensions
        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
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

        // Draw image
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to dataUrl for immediate local preview
        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        // Convert to blob for upload
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, dataUrl, width, height });
            } else {
              reject(new Error('Image compression failed to produce blob'));
            }
          },
          'image/jpeg',
          quality
        );
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
