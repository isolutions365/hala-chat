/**
 * Audio Compression Utility using the native Web Audio API.
 * Decodes the recorded audio, mixes it down to mono, downsamples it to 16,000 Hz (Optimal for human speech),
 * and encodes it into a standard highly compressed 16-bit PCM Mono WAV container.
 */

export async function compressAudio(audioBlob: Blob): Promise<Blob> {
  const originalSize = audioBlob.size;
  const originalType = audioBlob.type || '';
  
  // Optimization: Bypass compression if already in a modern compressed format (Opus/AAC/WebM)
  // and is smaller than 2MB (prevents over-processing efficient streams)
  const isCompressed = 
    originalType.includes('opus') || 
    originalType.includes('mp4') || 
    originalType.includes('m4a') || 
    originalType.includes('ogg') || 
    (originalType.includes('webm') && originalSize < 2 * 1024 * 1024);

  if (isCompressed) {
    console.log(`[Audio Compression] Bypassing compression for already-compressed format: ${originalType} (${originalSize} bytes)`);
    return audioBlob;
  }

  console.log(`[Audio Compression] Starting audio compression for blob size: ${originalSize} bytes (${originalType})`);
  const startTime = performance.now();

  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn('[Audio Compression] AudioContext is not supported. Uploading original blob.');
      return audioBlob;
    }

    const audioCtx = new AudioContextClass();
    const arrayBuffer = await audioBlob.arrayBuffer();

    // Decode any incoming audio format (webm, mp4, etc.) to PCM audio buffer
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (decodeError) {
      console.warn('[Audio Compression] Native decodeAudioData failed, returning original blob:', decodeError);
      return audioBlob;
    }

    // Optimal voice configurations: Mono channel (1) & 16kHz sample rate
    const targetSampleRate = 16000;
    const targetChannels = 1;

    // Fast offline downsampling via OfflineAudioContext
    const totalFrames = Math.ceil(audioBuffer.duration * targetSampleRate);
    const offlineCtx = new OfflineAudioContext(targetChannels, totalFrames, targetSampleRate);

    // Setup source buffer
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    // Fast CPU-side rendering of the audio graph
    const renderedBuffer = await offlineCtx.startRendering();

    // Encode to a lightweight 16-bit Mono WAV Blob
    const compressedBlob = audioBufferToWavBlob(renderedBuffer);
    const compressedSize = compressedBlob.size;
    const elapsed = (performance.now() - startTime).toFixed(1);
    const reductionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    console.log(
      `[Audio Compression] Success! Compression took ${elapsed}ms. Original: ${originalSize} bytes, Compressed: ${compressedSize} bytes. Reduced file size by ${reductionRatio}%!`
    );

    return compressedBlob;
  } catch (error) {
    console.warn('[Audio Compression] Unexpected compression error, falling back to original blob:', error);
    return audioBlob;
  }
}

/**
 * Encodes an AudioBuffer into a lightweight, standard 16-bit PCM Mono WAV Blob.
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const channelData = buffer.getChannelData(0); // Select mono channel
  const sampleRate = buffer.sampleRate;
  const numSamples = channelData.length;

  // Header is 44 bytes, each 16-bit sample takes 2 bytes
  const bufferLength = 44 + numSamples * 2;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // RIFF container
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(view, 8, 'WAVE');

  // Format chunk (fmt)
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);          // Subchunk1Size
  view.setUint16(20, 1, true);           // AudioFormat (1 is PCM)
  view.setUint16(22, 1, true);           // NumChannels (1 for Mono)
  view.setUint32(24, sampleRate, true);  // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true);           // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true);          // BitsPerSample (16 bits)

  // Data chunk (data)
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Write PCM audio samples scaled to 16-bit signed integers
  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
