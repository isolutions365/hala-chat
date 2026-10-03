export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export function validateMediaUpload(blob: { size: number; type: string }) {
  if (!blob.size || blob.size > MAX_MEDIA_BYTES) throw new Error('Choose a non-empty file up to 5 MB.');
  if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)|audio\/(webm|ogg|wav|mpeg|mp4|x-m4a)(;codecs=[a-zA-Z0-9.-]+)?|application\/octet-stream)$/.test(blob.type)) {
    throw new Error('This file format is not supported.');
  }
}
