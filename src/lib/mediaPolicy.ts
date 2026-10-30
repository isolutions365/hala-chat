export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export const SUPPORTED_MIME_REGEX = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)|audio\/(webm|ogg|wav|mpeg|mp4|x-m4a)(;codecs=[a-zA-Z0-9.-]+)?|application\/octet-stream|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.presentationml\.presentation|zip|x-zip-compressed)|text\/(plain|csv))$/;

export function validateMediaUpload(blob: { size: number; type: string }) {
  if (!blob.size || blob.size > MAX_MEDIA_BYTES) {
    throw new Error('Choose a non-empty file up to 5 MB.');
  }
  if (!SUPPORTED_MIME_REGEX.test(blob.type)) {
    throw new Error('This file format is not supported.');
  }
}

/**
 * Format bytes into human-readable size string
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Get file category and color token based on file extension / mime type
 */
export function getDocumentMetadata(fileName: string, mimeType?: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return { ext: 'PDF', bg: 'bg-red-500', text: 'text-red-500', lightBg: 'bg-red-50', border: 'border-red-200' };
  }
  if (['doc', 'docx'].includes(ext) || mimeType?.includes('word')) {
    return { ext: 'DOC', bg: 'bg-blue-600', text: 'text-blue-600', lightBg: 'bg-blue-50', border: 'border-blue-200' };
  }
  if (['xls', 'xlsx', 'csv'].includes(ext) || mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) {
    return { ext: 'XLS', bg: 'bg-emerald-600', text: 'text-emerald-600', lightBg: 'bg-emerald-50', border: 'border-emerald-200' };
  }
  if (['ppt', 'pptx'].includes(ext) || mimeType?.includes('presentation')) {
    return { ext: 'PPT', bg: 'bg-amber-600', text: 'text-amber-600', lightBg: 'bg-amber-50', border: 'border-amber-200' };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { ext: 'ZIP', bg: 'bg-purple-600', text: 'text-purple-600', lightBg: 'bg-purple-50', border: 'border-purple-200' };
  }
  if (['txt', 'md'].includes(ext) || mimeType?.startsWith('text/')) {
    return { ext: 'TXT', bg: 'bg-slate-600', text: 'text-slate-600', lightBg: 'bg-slate-100', border: 'border-slate-200' };
  }
  return { ext: ext.toUpperCase() || 'FILE', bg: 'bg-teal-600', text: 'text-[#087F75]', lightBg: 'bg-teal-50', border: 'border-teal-200' };
}
