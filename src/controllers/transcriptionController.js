const fs = require('fs');
const { transcribeAudioFile } = require('../services/transcripcionServicio');
const { translate, shouldTranslate } = require('../services/translationService');
const { generateDocxBuffer } = require('../services/docxService');

// Almacén de trabajos en memoria
const jobs = new Map();

// Ejecutar limpieza periódica cada 10 minutos para liberar memoria de archivos/trabajos antiguos (más de 1 hora)
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if (now - job.createdAt > 60 * 60 * 1000) { // 1 hora de antigüedad
      if (job.tempFilePath && fs.existsSync(job.tempFilePath)) {
        try {
          fs.unlinkSync(job.tempFilePath);
          console.log(`[Backend] Archivo temporal eliminado para trabajo antiguo: ${job.tempFilePath}`);
        } catch (err) {
          console.error(`[Backend] Error al eliminar archivo temporal de trabajo antiguo: ${err.message}`);
        }
      }
      jobs.delete(jobId);
      console.log(`[Backend] Trabajo ${jobId} eliminado de la memoria por antigüedad.`);
    }
  }
}, 10 * 60 * 1000);

/**
 * Inicia la tarea de transcripción en segundo plano y actualiza el estado del trabajo
 */
async function processJobInBackground(jobId, mimeType) {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    // 1. Transcripción con Deepgram
    job.status = 'transcribing';
    job.progress = 20;
    console.log(`[Backend] [Trabajo ${jobId}] Iniciando transcripción de Deepgram...`);

    const fileBuffer = fs.readFileSync(job.tempFilePath);
    const result = await transcribeAudioFile(fileBuffer, mimeType, { 
      language: job.language,
      contentLength: job.fileSize 
    });

    const dataObj = result?.data || result;
    const transcript = dataObj?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const duration = dataObj?.metadata?.duration || 0;

    if (!transcript) {
      throw new Error('No se detectó voz o contenido legible en el audio para transcribir.');
    }

    // 2. Traducción si está activada
    let translation = '';
    if (job.translateEnabled && shouldTranslate(transcript)) {
      job.status = 'translating';
      job.progress = 60;
      console.log(`[Backend] [Trabajo ${jobId}] Transcripción lista. Traduciendo transcripción con OpenAI...`);
      try {
        translation = await translate(transcript, job.language, job.targetLanguage, '', 'HTTP_REQ');
      } catch (err) {
        console.error(`[Backend] [Trabajo ${jobId}] Error al traducir:`, err.message);
        // Continuamos incluso si falla la traducción
      }
    }

    // 3. Generación del reporte Word
    job.status = 'generating_report';
    job.progress = 85;
    console.log(`[Backend] [Trabajo ${jobId}] Generando archivo Word (.docx)...`);

    const docxBuffer = await generateDocxBuffer({
      filename: job.originalName,
      duration,
      language: job.language,
      transcript,
      translation,
      targetLanguage: job.targetLanguage
    });

    const safeName = job.originalName.replace(/[^a-zA-Z0-9]/g, '_');
    const docxFilename = `transcripcion_${safeName}_${Date.now()}.docx`;

    // 4. Trabajo finalizado con éxito
    job.status = 'completed';
    job.progress = 100;
    job.docxBuffer = docxBuffer;
    job.docxFilename = docxFilename;
    console.log(`[Backend] [Trabajo ${jobId}] Procesamiento de audio y Word completado con éxito.`);

  } catch (error) {
    console.error(`[Backend] [Trabajo ${jobId}] Error en procesamiento en segundo plano:`, error);
    job.status = 'failed';
    job.error = error.message || 'Error desconocido al procesar el audio.';
  } finally {
    // Eliminar el archivo temporal del disco
    if (job.tempFilePath && fs.existsSync(job.tempFilePath)) {
      fs.unlink(job.tempFilePath, (err) => {
        if (err) {
          console.error(`[Backend] [Trabajo ${jobId}] Error al eliminar archivo temporal:`, err.message);
        } else {
          console.log(`[Backend] [Trabajo ${jobId}] Archivo temporal eliminado.`);
        }
      });
    }
  }
}

/**
 * Endpoint de subida de archivo que responde de inmediato con el jobId
 */
async function transcribeFileHandler(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo de audio.' });
    }

    const tempFilePath = req.file.path;
    const mimeType = req.file.mimetype;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;
    
    const language = req.body.language || 'es';
    const targetLanguage = req.body.targetLanguage || 'en';
    const translateEnabled = req.body.translate === 'true';

    console.log(`[Backend] Archivo recibido para cola de procesamiento: ${originalName} (${mimeType}), tamaño: ${fileSize} bytes`);

    // Crear un ID único para la tarea
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Registrar el estado inicial del trabajo
    jobs.set(jobId, {
      id: jobId,
      status: 'queued',
      progress: 0,
      originalName,
      fileSize,
      language,
      targetLanguage,
      translateEnabled,
      tempFilePath,
      createdAt: Date.now(),
      error: null,
      docxBuffer: null,
      docxFilename: null
    });

    // Lanzar el procesamiento en segundo plano sin esperar (fire-and-forget)
    processJobInBackground(jobId, mimeType);

    // Responder de inmediato con el identificador del trabajo para que el cliente comience el polling
    return res.status(202).json({
      jobId,
      status: 'queued',
      message: 'Archivo recibido e ingresado a la cola de procesamiento en segundo plano.'
    });

  } catch (error) {
    console.error('[Backend] Error en el controlador de transcripción al iniciar trabajo:', error);
    return res.status(500).json({
      error: 'Error al iniciar el procesamiento del archivo de audio.',
      details: error.message
    });
  }
}

/**
 * Consulta el estado y progreso actual de una tarea de transcripción
 */
function getJobStatusHandler(req, res) {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'El trabajo especificado no existe o expiró.' });
  }

  // Devolver solo los metadatos relevantes de progreso
  return res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    originalName: job.originalName,
    error: job.error,
    docxFilename: job.docxFilename
  });
}

/**
 * Permite la descarga directa del archivo Word generado si la tarea finalizó con éxito
 */
function downloadJobDocxHandler(req, res) {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'El trabajo especificado no existe o expiró.' });
  }

  if (job.status !== 'completed' || !job.docxBuffer) {
    return res.status(400).json({ error: 'El archivo Word solicitado aún no está listo o falló su generación.' });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${job.docxFilename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  
  return res.send(job.docxBuffer);
}

module.exports = {
  transcribeFileHandler,
  getJobStatusHandler,
  downloadJobDocxHandler
};
