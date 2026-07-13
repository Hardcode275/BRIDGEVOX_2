const MAX_CHUNK_BYTES = 1_048_576; 
const DEFAULT_VAD_THRESHOLD = 0.01;
const NOISE_ADAPT_RATE = 0.05;

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload: expected object with { audio, sampleRate }');
  }

  const { audio, sampleRate } = payload;

  if (!audio) {
    throw new Error('Missing "audio" field in payload');
  }
  if (!sampleRate || typeof sampleRate !== 'number' || sampleRate < 8000 || sampleRate > 48000) {
    throw new Error('Invalid sampleRate: expected number between 8000 and 48000');
  }
  let audioBuffer;
  if (typeof audio === 'string') {
    audioBuffer = Buffer.from(audio, 'base64');
  } else if (audio instanceof ArrayBuffer) {
    audioBuffer = Buffer.from(audio);
  } else if (Buffer.isBuffer(audio)) {
    audioBuffer = audio;
  } else {
    audioBuffer = Buffer.from(audio);
  }
  

  if (audioBuffer.length > MAX_CHUNK_BYTES) {
    throw new Error(`Audio chunk too large: ${audioBuffer.length} bytes (max ${MAX_CHUNK_BYTES})`);
  }
  return { audioData: audioBuffer, sampleRate };
}


function decodeAudioChunk(audioBuffer) {
  if (audioBuffer.length % 4 === 0) {
    const float32 = new Float32Array(
      audioBuffer.buffer,
      audioBuffer.byteOffset,
      audioBuffer.length / 4
    );
    return float32;
  }

  const int16 = new Int16Array(
    audioBuffer.buffer,
    audioBuffer.byteOffset,
    audioBuffer.length / 2
  );
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}


function detectVoiceActivity(samples, vadState) {
  if (!samples || samples.length === 0) return false;

  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sumSquares / samples.length);

  
  const threshold = vadState.threshold || DEFAULT_VAD_THRESHOLD;
  const isVoice = rms > threshold;
 
  console.log({
  rms: rms.toFixed(5),
  threshold: threshold.toFixed(5),
  isVoice
}); 
  if (!isVoice) {
    vadState.noiseFloor = vadState.noiseFloor
      ? vadState.noiseFloor * (1 - NOISE_ADAPT_RATE) + rms * NOISE_ADAPT_RATE
      : rms;
    vadState.threshold = Math.max(DEFAULT_VAD_THRESHOLD, vadState.noiseFloor * 3);
  }
  return isVoice;
}


function createWavBuffer(samples, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16Val = clamped < 0 ? clamped * 32768 : clamped * 32767;
    buffer.writeInt16LE(Math.round(int16Val), headerSize + i * 2);
  }
  return buffer;
}


function samplesToInt16Buffer(samples) {
  const buffer = Buffer.alloc(samples.length * 2);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16Val = clamped < 0 ? clamped * 32768 : clamped * 32767;
    buffer.writeInt16LE(Math.round(int16Val), i * 2);
  }
  return buffer;
}

module.exports = {
  validatePayload,
  decodeAudioChunk, 
  detectVoiceActivity,
  createWavBuffer,
  samplesToInt16Buffer,
  MAX_CHUNK_BYTES,
};