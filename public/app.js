/**
 * BridgeVox 2 - Frontend App Logic
 * Gestiona la carga de archivos, el dictado en tiempo real mediante WebSockets,
 * y la descarga de documentos de Word (.docx) formateados profesionalmente.
 */

// Variables de estado (Vista de Archivos)
let selectedFile = null;
let fileDuration = 0; // Duración leída en el cliente
let downloadedFilename = "";
let currentJobId = null; // ID del trabajo asíncrono actual

// Variables de estado (Vista en Vivo - Dictado)
let socket = null;
let audioContext = null;
let mediaStream = null;
let processorNode = null;
let isRecording = false;
let elapsedSeconds = 0;
let recordingStartTime = 0;
let timerInterval = null;
let liveTranscriptCompiled = "";
let liveTranslationCompiled = "";
let liveSentenceCount = 0;
let activeBubbles = new Map(); // sequenceId -> { container, originalText, translatedText }

// Elementos del DOM
const el = {
  backendStatus: document.getElementById('backend-status'),
  
  // Tabs de navegación
  tabFile: document.getElementById('tab-file'),
  tabLive: document.getElementById('tab-live'),
  contentFile: document.getElementById('content-file'),
  contentLive: document.getElementById('content-live'),
  stateFileView: document.getElementById('state-file-view'),
  stateLiveView: document.getElementById('state-live-view'),
  outputHeader: document.getElementById('output-header'),

  // Configuración de idiomas
  languageSelect: document.getElementById('language-select'),
  targetLanguageSelect: document.getElementById('target-language-select'),
  translateToggle: document.getElementById('translate-toggle'),
  translateToggleLabel: document.getElementById('translate-toggle-label'),
  
  // Sección de Archivo
  dropZone: document.getElementById('drop-zone'),
  audioFileInput: document.getElementById('audio-file-input'),
  fileInfoPanel: document.getElementById('file-info-panel'),
  selectedFileName: document.getElementById('selected-file-name'),
  selectedFileSize: document.getElementById('selected-file-size'),
  clearFileBtn: document.getElementById('clear-file-btn'),
  audioPreview: document.getElementById('audio-preview'),
  audioPreviewContainer: document.getElementById('audio-preview-container'),
  transcribeBtn: document.getElementById('transcribe-btn'),
  
  // Elementos del grabador (En vivo)
  recordBtn: document.getElementById('record-btn'),
  recorderStatus: document.getElementById('recorder-status'),
  recorderTimer: document.getElementById('recorder-timer'),
  soundWave: document.getElementById('sound-wave'),
  liveActionsGroup: document.getElementById('live-actions-group'),
  saveLiveBtn: document.getElementById('save-live-btn'),
  clearLiveBtn: document.getElementById('clear-live-btn'),
  liveChatMessages: document.getElementById('live-chat-messages'),
  liveChatEmpty: document.getElementById('live-chat-empty'),
  liveSentenceCount: document.getElementById('live-sentence-count'),

  // Vistas del resultado / Loader
  documentResultView: document.getElementById('document-result-view'),
  emptyState: document.getElementById('empty-state'),
  successDownloadState: document.getElementById('success-download-state'),
  loadingOverlay: document.getElementById('loading-overlay'),
  loaderMessage: document.getElementById('loader-message'),
  
  // Detalles del reporte Word (Vista de Archivo)
  docxFileTitle: document.getElementById('docx-file-title'),
  detailOrigName: document.getElementById('detail-orig-name'),
  detailDuration: document.getElementById('detail-duration'),
  detailLang: document.getElementById('detail-lang'),
  detailTranslated: document.getElementById('detail-translated'),
  
  // Botones de acción
  downloadDocxBtn: document.getElementById('download-docx-btn'),
  newTranscribeBtn: document.getElementById('new-transcribe-btn')
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkBackendStatus();
});

// Comprobar si el servidor está en línea
function checkBackendStatus() {
  fetch('/api/transcribe', { method: 'OPTIONS' })
    .then(() => {
      el.backendStatus.innerHTML = '<span class="dot green"></span> Servidor: Conectado';
    })
    .catch(err => {
      console.error('Error al conectar con el servidor:', err);
      el.backendStatus.innerHTML = '<span class="dot red"></span> Servidor: Sin conexión';
    });
}

// Configurar los listeners globales y del DOM
function setupEventListeners() {
  // --- NAVEGACIÓN POR PESTAÑAS (TABS) ---
  el.tabFile.addEventListener('click', () => {
    if (isRecording) {
      showNotification('Debes detener la grabación activa primero.', 'warning');
      return;
    }
    el.tabFile.classList.add('active');
    el.tabLive.classList.remove('active');
    el.contentFile.style.display = 'block';
    el.contentLive.style.display = 'none';
    el.stateFileView.style.display = 'block';
    el.stateLiveView.style.display = 'none';
    el.outputHeader.innerHTML = '<i class="fa-solid fa-file-invoice"></i> Resultado del Procesamiento';
  });

  el.tabLive.addEventListener('click', () => {
    el.tabLive.classList.add('active');
    el.tabFile.classList.remove('active');
    el.contentLive.style.display = 'block';
    el.contentFile.style.display = 'none';
    el.stateLiveView.style.display = 'flex';
    el.stateFileView.style.display = 'none';
    el.outputHeader.innerHTML = '<i class="fa-solid fa-microphone-lines"></i> Monitor de Dictado en Vivo';
  });

  // --- ARRASTRAR Y SOLTAR ARCHIVOS (DRAG & DROP) ---
  ['dragenter', 'dragover'].forEach(eventName => {
    el.dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    el.dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.dropZone.classList.remove('dragover');
    }, false);
  });

  el.dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleAudioFile(files[0]);
    }
  });

  el.dropZone.addEventListener('click', () => {
    el.audioFileInput.click();
  });

  el.audioFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleAudioFile(e.target.files[0]);
    }
  });

  // Limpiar archivo seleccionado
  el.clearFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearSelectedFile();
  });

  // Botones de acción de vista de archivos
  el.transcribeBtn.addEventListener('click', uploadAndConvert);
  el.downloadDocxBtn.addEventListener('click', triggerDownload);
  el.newTranscribeBtn.addEventListener('click', resetView);

  // --- ELEMENTOS DE GRABACIÓN EN VIVO ---
  el.recordBtn.addEventListener('click', toggleRecording);
  el.saveLiveBtn.addEventListener('click', saveLiveSessionToWord);
  el.clearLiveBtn.addEventListener('click', clearLiveSession);
}

// Activar/Desactivar traducción en la interfaz
window.toggleTranslationOption = function() {
  const isEnabled = el.translateToggle.checked;
  el.targetLanguageSelect.disabled = !isEnabled;
};

// Procesar el archivo de audio seleccionado
function handleAudioFile(file) {
  if (!file.type.startsWith('audio/')) {
    showNotification('Por favor, selecciona un archivo de audio válido.', 'danger');
    return;
  }

  const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
  if (file.size > maxSize) {
    showNotification('El archivo excede el tamaño límite de 2GB.', 'danger');
    return;
  }

  selectedFile = file;
  el.selectedFileName.innerText = file.name;
  el.selectedFileSize.innerText = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  
  const fileURL = URL.createObjectURL(file);
  el.audioPreview.src = fileURL;
  
  const dummyAudio = new Audio(fileURL);
  dummyAudio.addEventListener('loadedmetadata', () => {
    fileDuration = dummyAudio.duration;
  });

  el.dropZone.style.display = 'none';
  el.fileInfoPanel.style.display = 'flex';
  el.audioPreviewContainer.style.display = 'block';
}

// Limpiar panel de archivo seleccionado
function clearSelectedFile() {
  selectedFile = null;
  fileDuration = 0;
  el.audioFileInput.value = '';
  el.audioPreview.src = '';
  el.fileInfoPanel.style.display = 'none';
  el.audioPreviewContainer.style.display = 'none';
  el.dropZone.style.display = 'flex';
}

// Subir y Convertir a Word (Inicia el proceso asíncrono en segundo plano)
async function uploadAndConvert() {
  if (!selectedFile) return;

  showLoader(true, 'Subiendo archivo de audio al servidor...');

  const formData = new FormData();
  formData.append('audio', selectedFile);
  formData.append('language', el.languageSelect.value);
  formData.append('targetLanguage', el.targetLanguageSelect.value);
  formData.append('translate', el.translateToggle.checked);

  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData
    });

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await response.json();
      
      if (!response.ok || data.error) {
        showLoader(false);
        throw new Error(data.error || 'Error al iniciar la tarea de transcripción.');
      }
      
      currentJobId = data.jobId;
      pollJobStatus(data.jobId);
    } else {
      showLoader(false);
      throw new Error(`Respuesta inesperada del servidor: ${response.status}`);
    }

  } catch (error) {
    showLoader(false);
    console.error('Error al procesar audio:', error);
    showNotification(error.message, 'danger');
  }
}

// Polling periódico para verificar el estado de la tarea
async function pollJobStatus(jobId) {
  const pollInterval = 3000;
  
  const intervalId = setInterval(async () => {
    try {
      const response = await fetch(`/api/transcribe/status/${jobId}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        clearInterval(intervalId);
        showLoader(false);
        throw new Error(errData.error || `Error al consultar estado: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status === 'queued') {
        showLoader(true, 'En cola de espera para procesamiento...');
      } else if (data.status === 'transcribing') {
        showLoader(true, 'Transcribiendo audio con Deepgram Nova-2...');
      } else if (data.status === 'translating') {
        showLoader(true, 'Traduciendo texto con OpenAI GPT-4o-mini...');
      } else if (data.status === 'generating_report') {
        showLoader(true, 'Estructurando y maquetando archivo Word (.docx)...');
      } else if (data.status === 'completed') {
        clearInterval(intervalId);
        showLoader(false);

        downloadedFilename = data.docxFilename;

        // Guardar detalles del procesamiento en la UI
        el.docxFileTitle.innerText = downloadedFilename;
        el.detailOrigName.innerText = selectedFile.name;
        
        const minutes = Math.floor(fileDuration / 60);
        const seconds = Math.round(fileDuration % 60);
        el.detailDuration.innerText = `${minutes}:${seconds.toString().padStart(2, '0')} (${Math.round(fileDuration)}s)`;
        
        const langNames = { es: 'Español', en: 'Inglés', fr: 'Francés', de: 'Alemán', it: 'Italiano', pt: 'Portugués' };
        el.detailLang.innerText = langNames[el.languageSelect.value] || el.languageSelect.value;
        
        if (el.translateToggle.checked) {
          const targetLang = langNames[el.targetLanguageSelect.value] || el.targetLanguageSelect.value;
          el.detailTranslated.innerText = `Sí (al ${targetLang})`;
        } else {
          el.detailTranslated.innerText = 'No';
        }

        el.emptyState.style.display = 'none';
        el.successDownloadState.style.display = 'flex';

        triggerDownload();
        
        showNotification('¡Transcripción completada! Archivo Word descargado.', 'success');

      } else if (data.status === 'failed') {
        clearInterval(intervalId);
        showLoader(false);
        throw new Error(data.error || 'Ocurrió un error al procesar el audio.');
      }

    } catch (error) {
      clearInterval(intervalId);
      showLoader(false);
      console.error('Error durante el polling:', error);
      showNotification(error.message, 'danger');
    }
  }, pollInterval);
}

// Disparar descarga de archivo utilizando el endpoint de descarga directo
function triggerDownload() {
  if (!currentJobId || !downloadedFilename) return;

  const a = document.createElement('a');
  a.href = `/api/transcribe/download/${currentJobId}`;
  a.download = downloadedFilename;
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
  }, 100);
}

// Reiniciar vista
function resetView() {
  clearSelectedFile();
  downloadedFilename = "";
  currentJobId = null;
  
  el.successDownloadState.style.display = 'none';
  el.emptyState.style.display = 'flex';
}

// Mostrar/Ocultar cargador
function showLoader(show, message = 'Cargando...') {
  if (show) {
    el.loaderMessage.innerText = message;
    el.loadingOverlay.style.display = 'flex';
  } else {
    el.loadingOverlay.style.display = 'none';
  }
}

// Notificaciones flotantes tipo toast
function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast-notification ${type}`;
  
  let iconClass = 'fa-info-circle';
  if (type === 'success') iconClass = 'fa-circle-check';
  if (type === 'warning') iconClass = 'fa-triangle-exclamation';
  if (type === 'danger') iconClass = 'fa-circle-exclamation';
  
  toast.innerHTML = `
    <i class="fa-solid ${iconClass}"></i>
    <span>${message}</span>
  `;
  
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- LÓGICA DE GRABACIÓN Y DICTADO EN TIEMPO REAL (SOCKET.IO & MICROPHONE) ---

// Alternar grabación
function toggleRecording() {
  if (isRecording) {
    stopLiveRecording();
  } else {
    startLiveRecording();
  }
}

// Iniciar grabación en vivo
async function startLiveRecording() {
  try {
    // 1. Solicitar permisos de micrófono
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    // 2. Establecer conexión Socket.io
    socket = io();

    socket.on('connect', () => {
      console.log('[Socket] Conectado al backend.');
      // Enviar configuración de idioma
      socket.emit('set_language', {
        language: el.languageSelect.value,
        targetLanguage: el.targetLanguageSelect.value
      });
    });

    socket.on('translation_partial', (data) => {
      updateLiveBubble(data, false);
    });

    socket.on('translation_final', (data) => {
      updateLiveBubble(data, true);
    });

    socket.on('error', (err) => {
      console.error('[Socket] Error:', err);
      showNotification(err.message || 'Error en tiempo real.', 'danger');
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Desconectado.');
    });

    // 3. Configurar contexto de Audio a 16000Hz (downsampling automático en el navegador)
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const audioSource = audioContext.createMediaStreamSource(mediaStream);
    
    // ScriptProcessorNode para capturar buffers de audio (mono)
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    
    processorNode.onaudioprocess = (e) => {
      if (!isRecording) return;
      const float32Array = e.inputBuffer.getChannelData(0);
      const pcmBuffer = float32To16BitPCM(float32Array);
      
      // Emitir el búfer PCM crudo (16 bits) a través del socket
      if (socket && socket.connected) {
        socket.emit('audio_chunk', {
          audio: pcmBuffer,
          sampleRate: 16000
        });
      }
    };

    audioSource.connect(processorNode);
    processorNode.connect(audioContext.destination);

    // 4. Cambiar estados e iniciar animaciones en la UI
    isRecording = true;
    el.recordBtn.classList.add('recording');
    el.recordBtn.title = 'Detener Grabación';
    el.soundWave.classList.add('active');
    el.recorderStatus.innerText = 'Grabando y Transcribiendo...';
    
    // Ocultar botones de guardado antiguos si existían
    el.liveActionsGroup.style.display = 'none';

    // Iniciar temporizador
    startTimer();

    showNotification('Micrófono activo. Comienza a hablar.', 'success');

  } catch (error) {
    console.error('Error al iniciar grabación en vivo:', error);
    showNotification('No se pudo acceder al micrófono: ' + error.message, 'danger');
    stopLiveRecording();
  }
}

// Detener grabación en vivo
function stopLiveRecording() {
  isRecording = false;
  
  // 1. Parar micrófono
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  // 2. Desconectar nodos de audio
  if (processorNode) {
    processorNode.disconnect();
    processorNode = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  // 3. Desconectar socket.io
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  // 4. Parar temporizador
  stopTimer();

  // 5. Restablecer UI
  el.recordBtn.classList.remove('recording');
  el.recordBtn.title = 'Iniciar Grabación';
  el.soundWave.classList.remove('active');
  el.recorderStatus.innerText = 'Grabación Finalizada';

  // Mostrar grupo de acciones si hay transcripción acumulada
  if (liveTranscriptCompiled) {
    el.liveActionsGroup.style.display = 'flex';
  } else {
    el.recorderStatus.innerText = 'Listo para grabar';
  }

  showNotification('Grabación detenida.', 'info');
}

// Iniciar temporizador
function startTimer() {
  recordingStartTime = Date.now();
  elapsedSeconds = 0;
  el.recorderTimer.innerText = '00:00';
  
  timerInterval = setInterval(() => {
    elapsedSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    el.recorderTimer.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

// Detener temporizador
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Convertir búfer de coma flotante de 32 bits a PCM lineal de 16 bits
function float32To16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    // Convertir a int16 (rango -32768 a 32767)
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true); // Little Endian
  }
  return buffer;
}

// Renderizar las burbujas de transcripción/traducción en tiempo real en la pantalla
function updateLiveBubble(data, isFinal) {
  const { sequenceId, original, translated } = data;
  if (!sequenceId) return;

  // Quitar el empty state del monitor si sigue presente
  if (el.liveChatEmpty) {
    el.liveChatEmpty.remove();
    el.liveChatEmpty = null;
  }

  let bubbleData = activeBubbles.get(sequenceId);

  if (!bubbleData) {
    // 1. Crear burbuja contenedora
    const msgContainer = document.createElement('div');
    msgContainer.className = 'chat-message-bubble';
    
    // Burbuja de texto original
    const origDiv = document.createElement('div');
    origDiv.className = 'original-bubble';
    origDiv.innerText = original || "...";
    msgContainer.appendChild(origDiv);

    // Burbuja de traducción
    let transDiv = null;
    if (el.translateToggle.checked) {
      transDiv = document.createElement('div');
      transDiv.className = 'translated-bubble';
      transDiv.innerHTML = translated ? translated : '<i class="fa-solid fa-spinner fa-spin"></i> Traduciendo...';
      msgContainer.appendChild(transDiv);
    }

    el.liveChatMessages.appendChild(msgContainer);
    
    bubbleData = {
      container: msgContainer,
      originalText: origDiv,
      translatedText: transDiv
    };
    
    activeBubbles.set(sequenceId, bubbleData);
    
    // Actualizar el contador de oraciones procesadas
    liveSentenceCount++;
    el.liveSentenceCount.innerText = `${liveSentenceCount} oraciones`;
  } else {
    // 2. Si ya existe la burbuja, actualizar sus textos dinámicamente
    if (original) {
      bubbleData.originalText.innerText = original;
    }
    if (bubbleData.translatedText) {
      if (translated) {
        bubbleData.translatedText.innerText = translated;
      } else if (isFinal && !translated) {
        bubbleData.translatedText.innerText = "(Traducción no disponible)";
      }
    }
  }

  // 3. Al finalizar la frase, guardar en el compilado acumulativo y limpiar del Map activo
  if (isFinal) {
    if (original) {
      liveTranscriptCompiled += (liveTranscriptCompiled ? " " : "") + original;
    }
    if (translated) {
      liveTranslationCompiled += (liveTranslationCompiled ? " " : "") + translated;
    }
    activeBubbles.delete(sequenceId);
  }

  // Autoscroll hacia el mensaje más nuevo
  el.liveChatMessages.scrollTop = el.liveChatMessages.scrollHeight;
}

// Guardar grabación en vivo y descargar archivo Word (.docx)
async function saveLiveSessionToWord() {
  if (!liveTranscriptCompiled) {
    showNotification('No hay dictado registrado en esta sesión para exportar.', 'warning');
    return;
  }

  showLoader(true, 'Generando archivo de Microsoft Word...');

  try {
    const response = await fetch('/api/generate-docx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: 'Dictado_en_vivo',
        duration: elapsedSeconds,
        language: el.languageSelect.value,
        transcript: liveTranscriptCompiled,
        translation: el.translateToggle.checked ? liveTranslationCompiled : '',
        targetLanguage: el.targetLanguageSelect.value
      })
    });

    if (!response.ok) {
      showLoader(false);
      throw new Error(`Error en el servidor al generar Word: ${response.status}`);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition');
    let filename = `transcripcion_dictado_${Date.now()}.docx`;
    if (disposition && disposition.indexOf('attachment') !== -1) {
      const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
      const matches = filenameRegex.exec(disposition);
      if (matches != null && matches[1]) { 
        filename = matches[1].replace(/['"]/g, '');
      }
    }

    // Descargar automáticamente
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);

    showLoader(false);
    showNotification('¡Reporte de dictado descargado con éxito!', 'success');

  } catch (error) {
    showLoader(false);
    console.error('Error al guardar reporte de dictado:', error);
    showNotification(error.message, 'danger');
  }
}

// Limpiar monitor de grabación en vivo
function clearLiveSession() {
  if (isRecording) {
    stopLiveRecording();
  }
  
  liveTranscriptCompiled = "";
  liveTranslationCompiled = "";
  liveSentenceCount = 0;
  elapsedSeconds = 0;
  activeBubbles.clear();
  
  el.liveSentenceCount.innerText = "0 oraciones";
  el.recorderTimer.innerText = "00:00";
  el.recorderStatus.innerText = "Listo para grabar";
  
  el.liveChatMessages.innerHTML = `
    <div class="live-chat-empty" id="live-chat-empty">
      <i class="fa-solid fa-microphone-lines"></i>
      <p>Presiona el botón de micrófono a la izquierda y comienza a hablar. El texto aparecerá en tiempo real aquí...</p>
    </div>
  `;
  el.liveChatEmpty = document.getElementById('live-chat-empty');
  el.liveActionsGroup.style.display = 'none';
}

// Agregar estilos para toasters globales
const styleSheet = document.createElement('style');
styleSheet.innerText = `
  .toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .toast-notification {
    background: rgba(16, 20, 38, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(10px);
    color: white;
    padding: 12px 18px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.9rem;
    font-weight: 500;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    transform: translateX(120%);
    transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    min-width: 250px;
    max-width: 380px;
  }
  .toast-notification.show {
    transform: translateX(0);
  }
  .toast-notification.success i { color: #10b981; }
  .toast-notification.warning i { color: #f59e0b; }
  .toast-notification.danger i { color: #ef4444; }
  .toast-notification.info i { color: #3b82f6; }
  .toast-notification.success { border-left: 4px solid #10b981; }
  .toast-notification.warning { border-left: 4px solid #f59e0b; }
  .toast-notification.danger { border-left: 4px solid #ef4444; }
  .toast-notification.info { border-left: 4px solid #3b82f6; }
`;
document.head.appendChild(styleSheet);
