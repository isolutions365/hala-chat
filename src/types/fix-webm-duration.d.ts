declare module 'fix-webm-duration' {
  function fixWebmDuration(
    blob: Blob,
    duration: number,
    callback: (fixedBlob: Blob) => void,
    options?: { logger?: boolean }
  ): void;

  export default fixWebmDuration;
}
