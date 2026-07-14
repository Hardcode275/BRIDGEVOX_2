const { DeepgramClient } = require('@deepgram/sdk');

// Función de fetch personalizada para evitar errores de Content-Length duplicados en undici
const customFetch = (url, init) => {
  if (init && init.headers && init.body) {
    const isBufferOrString = 
      Buffer.isBuffer(init.body) || 
      typeof init.body === 'string' || 
      init.body instanceof Uint8Array || 
      init.body instanceof ArrayBuffer;

    if (isBufferOrString) {
      if (typeof init.headers.delete === 'function') {
        init.headers.delete('content-length');
      } else {
        for (const key of Object.keys(init.headers)) {
          if (key.toLowerCase() === 'content-length') {
            delete init.headers[key];
          }
        }
      }
    }
  }
  return fetch(url, init);
};

let _deepgram = null;
function getClient() {
  if (!_deepgram) {
    _deepgram = new DeepgramClient({ 
      apiKey: process.env.DEEPGRAM_API_KEY,
      timeoutInSeconds: 900, // 15 minutos global para soportar audios pesados
      fetch: customFetch
    });
  }
  return _deepgram;
}

const MAX_CONTEXT_CHARS = 300;

const FILLER_PATTERNS = [
  /\b(uh|um|uhm|umm|eh|er|hmm|hm|mmm|mm)\b/gi,
  /\b(you know|i mean|like|basically|actually|literally|right|okay so|so yeah)\b/gi,
  /\b(este|pues|o sea|bueno|entonces|digamos|verdad|sabes|mira|eh|ajá)\b/gi,
  /\s{2,}/g,
];


async function createLiveSession(
  { language = 'en', sampleRate = 16000, socketId = '' },
  { onInterim, onFinal, onError, onOpen, onClose }
) {
  const connection = await getClient().listen.v1.connect({
    model: 'nova-2',
    language,
    punctuate: true,
    interim_results: true,
    endpointing: 300,
    smart_format: true,
    encoding: 'linear16',
    sample_rate: sampleRate,
    channels: 1,
  });

  connection.on('open', () => {
    console.log(`[${socketId}] Deepgram session opened (lang=${language}, ${sampleRate}Hz)`);
    if (onOpen) onOpen(connection);
  });

  connection.on('message', (data) => {
    if (data.type !== 'Results') return;
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (!transcript || transcript.trim() === '') return;

    if (data.is_final) {
      console.log(`[${socketId}] Deepgram final: "${transcript}"`);
      onFinal(transcript);
    } else {
      onInterim(transcript);
    }
  });

  connection.on('error', (err) => {
    console.error(`[${socketId}] Deepgram error:`, err);
    if (onError) onError(err);
  });

  connection.on('close', (event) => {
    console.log(`[${socketId}] Deepgram session closed`);
    if (onClose) onClose(event);
  });

  return connection;
}


function cleanText(text) {
  if (!text) return '';
  let cleaned = text;
  for (const pattern of FILLER_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}


function updateContextBuffer(currentBuffer, newText) {
  if (!newText) return currentBuffer || '';
  const combined = currentBuffer ? `${currentBuffer} ${newText}` : newText;
  if (combined.length <= MAX_CONTEXT_CHARS) return combined;
  const trimmed = combined.slice(-MAX_CONTEXT_CHARS);
  const sentenceStart = trimmed.search(/[.!?]\s/);
  if (sentenceStart !== -1 && sentenceStart < trimmed.length / 2) {
    return trimmed.slice(sentenceStart + 2);
  }
  const wordStart = trimmed.indexOf(' ');
  return wordStart !== -1 ? trimmed.slice(wordStart + 1) : trimmed;
}

async function transcribeAudioFile(fileSource, mimeType, options = {}) {
  const deepgram = getClient();
  
  // Normalizar tipos MIME no estándar para asegurar compatibilidad con Deepgram
  let normalizedMimeType = mimeType;
  if (mimeType) {
    const mimeLower = mimeType.toLowerCase();
    if (mimeLower === 'audio/x-m4a' || mimeLower === 'audio/m4a') {
      normalizedMimeType = 'audio/x-m4a';
    } else if (mimeLower === 'audio/x-wav') {
      normalizedMimeType = 'audio/wav';
    } else if (mimeLower === 'audio/x-mp3' || mimeLower === 'audio/x-mpeg') {
      normalizedMimeType = 'audio/mpeg';
    }
  }

  // Extraer contentLength de las opciones para evitar enviarlo como parámetro de consulta a la API
  const { contentLength, ...deepgramOptions } = options;

  const response = await deepgram.listen.v1.media.transcribeFile(
    {
      data: fileSource,
      contentType: normalizedMimeType,
      contentLength: contentLength,
    },
    {
      model: 'nova-2',
      smart_format: true,
      ...deepgramOptions,
    },
    {
      timeoutInSeconds: 900 // 15 minutos límite para esta petición específica
    }
  );
  
  return response;
}

module.exports = {
  createLiveSession,
  cleanText,
  updateContextBuffer,
  transcribeAudioFile,
  MAX_CONTEXT_CHARS,
};