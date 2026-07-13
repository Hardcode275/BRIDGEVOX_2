/**
 * BridgeVox 2 - Frontend App Logic
 * Gestiona la carga de archivos de audio, envío a la API REST de transcripción,
 * y descarga directa del documento de Microsoft Word (.docx) generado.
 */

// Variables de estado
let selectedFile = null;
let fileDuration = 0; // Duración leída en el cliente
let downloadedBlob = null; // Almacena el Word descargado para redescargas
let downloadedFilename = "";

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

  const maxSize = 15 * 1024 * 1024; // 15MB
  if (file.size > maxSize) {
    showNotification('El archivo excede el tamaño límite de 15MB.', 'danger');
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

// Subir y Convertir a Word
async function uploadAndConvert() {
  if (!selectedFile) return;

  showLoader(true, 'Procesando audio e implementando transcripción...');

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

    // Si la respuesta es JSON, es un mensaje de error del backend
    if (contentType.includes('application/json')) {
      const errData = await response.json();
      showLoader(false);
      throw new Error(errData.error || errData.details || 'Error al transcribir el audio.');
    }

    if (!response.ok) {
      showLoader(false);
      throw new Error(`Error en el servidor: ${response.status} ${response.statusText}`);
    }

    // Recibir el archivo binario (.docx)
    const blob = await response.blob();
    downloadedBlob = blob;

    // Obtener el nombre del archivo del header de Content-Disposition
    const disposition = response.headers.get('Content-Disposition');
    let filename = `transcripcion_${selectedFile.name.split('.')[0]}_${Date.now()}.docx`;
    if (disposition && disposition.indexOf('attachment') !== -1) {
      const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
      const matches = filenameRegex.exec(disposition);
      if (matches != null && matches[1]) { 
        filename = matches[1].replace(/['"]/g, '');
      }
    }
    downloadedFilename = filename;

    showLoader(false);

    // Guardar detalles del procesamiento en la UI
    el.docxFileTitle.innerText = filename;
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

  } catch (error) {
    showLoader(false);
    console.error('Error al procesar audio:', error);
    showNotification(error.message, 'danger');
  }
}

// Disparar descarga de archivo
function triggerDownload() {
  if (!downloadedBlob || !downloadedFilename) return;

  const url = window.URL.createObjectURL(downloadedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadedFilename;
  document.body.appendChild(a);
  a.click();
  
  // Limpieza de memoria
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

// Reiniciar vista
function resetView() {
  clearSelectedFile();
  downloadedBlob = null;
  downloadedFilename = "";
  
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
