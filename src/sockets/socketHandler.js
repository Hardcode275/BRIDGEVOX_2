const {
  validatePayload,
  decodeAudioChunk,
  detectVoiceActivity,
  samplesToInt16Buffer,
} = require('../services/procesadorAudio');

const {
  createLiveSession,
  cleanText,
  updateContextBuffer,
} = require('../services/transcripcionServicio');

const {
  translate,
  shouldTranslate,
} = require('../services/translationService');


function createSocketState() {
  return {
    language: 'en',
    targetLanguage: 'es',
    contextBuffer: '',
    vadState: { noiseFloor: null, threshold: 0.01 },
    deepgramSession: null,
    detectedSampleRate: null,
    isSessionReady: false,
    pendingAudio: [],
  };
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    const sid = socket.id;
    console.log(`[${sid}] Client connected`);

    const state = createSocketState();


    function openDeepgramSession(sampleRate) {
      if (state.deepgramSession) {
        try { state.deepgramSession.close(); } catch (_) {}
        state.deepgramSession = null;
      }
      state.isSessionReady = false;
      state.pendingAudio = [];

      createLiveSession(
        { language: state.language, sampleRate, socketId: sid },
        {
          onOpen: (connection) => {
            state.deepgramSession = connection;
            state.isSessionReady = true;
            for (const buf of state.pendingAudio) {
              try { state.deepgramSession.sendMedia(buf); } catch (_) {}
            }
            state.pendingAudio = [];
          },

          onClose: () => {
            state.deepgramSession = null;
            state.isSessionReady = false;
            state.pendingAudio = [];
          },

          onInterim: (transcript) => {
            socket.emit('translation_partial', {
              sequenceId: Date.now(),
              original: transcript,
              translated: null,
              from: state.language,
              to: state.targetLanguage,
            });
          },

          onFinal: async (transcript) => {
            const cleaned = cleanText(transcript);
            if (!cleaned) return;

            socket.emit('translation_partial', {
              sequenceId: Date.now(),
              original: cleaned,
              translated: null,
              from: state.language,
              to: state.targetLanguage,
            });

            if (!shouldTranslate(cleaned)) return;

            try {
              const translated = await translate(
                cleaned,
                state.language,
                state.targetLanguage,
                state.contextBuffer,
                sid
              );
              state.contextBuffer = updateContextBuffer(state.contextBuffer, cleaned);

              socket.emit('translation_final', {
                sequenceId: Date.now(),
                original: cleaned,
                translated,
                from: state.language,
                to: state.targetLanguage,
                context: state.contextBuffer,
              });
            } catch (err) {
              console.error(`[${sid}] Translation error:`, err.message);
              socket.emit('error', { message: `Translation failed: ${err.message}` });
            }
          },

          onError: (err) => {
            socket.emit('error', { message: `Deepgram error: ${err.message || err}` });
          },
        }
      ).then(connection => {
        state.deepgramSession = connection;
      }).catch(err => {
        console.error(`[${sid}] Error opening Deepgram session:`, err.message || err);
        socket.emit('error', { message: `Deepgram session creation failed: ${err.message || err}` });
      });
    }

    socket.on('set_language', (data) => {
      const languageChanged =
        (data?.language && data.language !== state.language) ||
        (data?.targetLanguage && data.targetLanguage !== state.targetLanguage);

      if (data?.language) state.language = data.language;
      if (data?.targetLanguage) state.targetLanguage = data.targetLanguage;

      console.log(`[${sid}] Language set: ${state.language} → ${state.targetLanguage}`);

      if (languageChanged && state.deepgramSession && state.detectedSampleRate) {
        openDeepgramSession(state.detectedSampleRate);
      }
    });

    socket.on('audio_chunk', (payload) => {
      try {
        const { audioData, sampleRate } = validatePayload(payload);

        if (payload.language) state.language = payload.language;
        if (payload.targetLanguage) state.targetLanguage = payload.targetLanguage;

        
        if (!state.deepgramSession) {
          state.detectedSampleRate = sampleRate;
          openDeepgramSession(sampleRate);
        }

        const samples = decodeAudioChunk(audioData);

        const hasVoice = detectVoiceActivity(samples, state.vadState);
        if (!hasVoice) return;

        const pcmBuffer = samplesToInt16Buffer(samples);
        if (state.isSessionReady && state.deepgramSession) {
          state.deepgramSession.sendMedia(pcmBuffer);
        } else {
          state.pendingAudio.push(pcmBuffer);
        }

      } catch (error) {
        console.error(`[${sid}] Pipeline error:`, error.message);
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('text_input', async (data) => {
      const sequenceId = data?.sequenceId ?? Date.now();

      try {
        const text = data?.text;
        if (!text || typeof text !== 'string') {
          socket.emit('error', { message: 'Missing "text" field', sequenceId });
          return;
        }

        const lang = data.language || state.language;
        const targetLang = data.targetLanguage || state.targetLanguage;

        console.log(`[${sid}] Text input (simulation): "${text}"`);

        const cleanedText = cleanText(text);

        socket.emit('translation_partial', {
          sequenceId,
          original: cleanedText,
          translated: null,
          from: lang,
          to: targetLang,
        });

        if (shouldTranslate(cleanedText)) {
          const translated = await translate(
            cleanedText,
            lang,
            targetLang,
            state.contextBuffer,
            sid
          );
          state.contextBuffer = updateContextBuffer(state.contextBuffer, cleanedText);

          socket.emit('translation_final', {
            sequenceId,
            original: cleanedText,
            translated,
            from: lang,
            to: targetLang,
            context: state.contextBuffer,
          });
        }
      } catch (error) {
        console.error(`[${sid}] Text input error:`, error.message);
        socket.emit('error', { message: error.message, sequenceId });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[${sid}] Client disconnected: ${reason}`);
      if (state.deepgramSession) {
        const session = state.deepgramSession;
        state.deepgramSession = null;
        state.isSessionReady = false;
        state.pendingAudio = [];
        try { session.close(); } catch (_) {}
      }
    });
  });
}

module.exports = { registerSocketHandlers };