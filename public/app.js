/**
 * BridgeVox 2 - Frontend App Logic
 * Gestiona la carga de archivos de audio, envío a la API REST de transcripción,
 * y descarga directa del documento de Microsoft Word (.docx) generado.
 */

// Variables de estado
let selectedFile = null;
let fileDuration = 0; // Duración leída en el cliente
let downloadedFilename = "";
let currentJobId = null; // ID del trabajo asíncrono actual

// Elementos del DOM
const el = {
  backendStatus: document.getElementById('backend-status'),
  
  // Configuración
  languageSelect: document.getElementById('language-select'),
  targetLanguageSelect: document.getElementById('target-language-select'),
  translateToggle: document.getElementById('translate-toggle'),
  
  // Carga de archivos
  dropZone: document.getElementById('drop-zone'),
  audioFileInput: document.getElementById('audio-file-input'),
  fileInfoPanel: document.getElementById('file-info-panel'),
  selectedFileName: document.getElementById('selected-file-name'),
  selectedFileSize: document.getElementById('selected-file-size'),
  clearFileBtn: document.getElementById('clear-file-btn'),
  audioPreview: document.getElementById('audio-preview'),
  audioPreviewContainer: document.getElementById('audio-preview-container'),
  transcribeBtn: document.getElementById('transcribe-btn'),
  
  // Vistas del resultado
  documentResultView: document.getElementById('document-result-view'),
  emptyState: document.getElementById('empty-state'),
  successDownloadState: document.getElementById('success-download-state'),
  loadingOverlay: document.getElementById('loading-overlay'),
  loaderMessage: document.getElementById('loader-message'),
  
  // Detalles del reporte Word
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

// Configurar los listeners
function setupEventListeners() {
  // Drag & Drop
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

  // Botón para procesar y transcribir
  el.transcribeBtn.addEventListener('click', uploadAndConvert);

  // Botón de redescarga
  el.downloadDocxBtn.addEventListener('click', triggerDownload);

  // Botón para nueva transcripción
  el.newTranscribeBtn.addEventListener('click', resetView);
}

// Activar/Desactivar traducción en la interfaz
window.toggleTranslationOption = function() {
  const isEnabled = el.translateToggle.checked;
  el.targetLanguageSelect.disabled = !isEnabled;
};

// Procesar el archivo seleccionado
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
  
  // Cargar audio en preview y leer duración en segundos
  const fileURL = URL.createObjectURL(file);
  el.audioPreview.src = fileURL;
  
  // Obtener duración metadatos
  const dummyAudio = new Audio(fileURL);
  dummyAudio.addEventListener('loadedmetadata', () => {
    fileDuration = dummyAudio.duration;
  });

  el.dropZone.style.display = 'none';
  el.fileInfoPanel.style.display = 'flex';
  el.audioPreviewContainer.style.display = 'block';
}

// Limpiar panel de archivo
function clearSelectedFile() {
  selectedFile = null;
  fileDuration = 0;
  el.audioFileInput.value = '';
  el.audioPreview.src = '';
  el.fileInfoPanel.style.display = 'none';
  el.audioPreviewContainer.style.display = 'none';
  el.dropZone.style.display = 'flex';
}

// Subir y Convertir a Word (Inicia el proceso asíncrono)
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

// Polling para verificar el estado de la tarea en segundo plano
async function pollJobStatus(jobId) {
  const pollInterval = 3000; // Consultar cada 3 segundos
  
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
        showLoader(true, 'Estructurando y generando archivo Word (.docx)...');
      } else if (data.status === 'completed') {
        clearInterval(intervalId);
        showLoader(false);

        downloadedFilename = data.docxFilename;

        // Guardar detalles del procesamiento en la UI
        el.docxFileTitle.innerText = downloadedFilename;
        el.detailOrigName.innerText = selectedFile.name;
        
        // Formatear duración
        const minutes = Math.floor(fileDuration / 60);
        const seconds = Math.round(fileDuration % 60);
        el.detailDuration.innerText = `${minutes}:${seconds.toString().padStart(2, '0')} (${Math.round(fileDuration)}s)`;
        
        // Mostrar idioma legible
        const langNames = { es: 'Español', en: 'Inglés', fr: 'Francés', de: 'Alemán', it: 'Italiano', pt: 'Portugués' };
        el.detailLang.innerText = langNames[el.languageSelect.value] || el.languageSelect.value;
        
        // Traducción
        if (el.translateToggle.checked) {
          const targetLang = langNames[el.targetLanguageSelect.value] || el.targetLanguageSelect.value;
          el.detailTranslated.innerText = `Sí (al ${targetLang})`;
        } else {
          el.detailTranslated.innerText = 'No';
        }

        // Mostrar el panel de éxito y descarga
        el.emptyState.style.display = 'none';
        el.successDownloadState.style.display = 'flex';

        // Disparar descarga automática del Word de inmediato
        triggerDownload();
        
        showNotification('¡Transcripción completada! Archivo Word descargado.', 'success');

      } else if (data.status === 'failed') {
        clearInterval(intervalId);
        showLoader(false);
        throw new Error(data.error || 'Ocurrió un error desconocido al procesar el audio en segundo plano.');
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

// Agregar estilos para los toasters
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
