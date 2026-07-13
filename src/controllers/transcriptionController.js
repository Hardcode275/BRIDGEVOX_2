const { transcribeAudioFile } = require('../services/transcripcionServicio');
const { translate, shouldTranslate } = require('../services/translationService');
const { generateDocxBuffer } = require('../services/docxService');

async function transcribeFileHandler(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo de audio.' });
    }

    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;
    const originalName = req.file.originalname;
    
    // Obtener parámetros de idioma si se envían
    const language = req.body.language || 'es'; // Por defecto español
    const targetLanguage = req.body.targetLanguage || 'en'; // Traducir al inglés por defecto si se solicita
    const translateEnabled = req.body.translate === 'true';

    console.log(`[Backend] Transcribiendo archivo: ${originalName} (${mimeType}), tamaño: ${fileBuffer ? fileBuffer.length : 0} bytes, idioma: ${language}`);

    // Llamar al servicio de transcripción de Deepgram
    const result = await transcribeAudioFile(fileBuffer, mimeType, { language });
    
    // Extraer el texto transcrito (soporta SDK v5 y anteriores)
    const dataObj = result?.data || result;
    const transcript = dataObj?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const duration = dataObj?.metadata?.duration || 0;

    if (!transcript) {
      return res.status(422).json({
        error: 'No se detectó voz o contenido legible en el audio para transcribir.'
      });
    }

    let translation = '';
    if (translateEnabled && shouldTranslate(transcript)) {
      try {
        translation = await translate(transcript, language, targetLanguage, '', 'HTTP_REQ');
      } catch (err) {
        console.error('[Backend] Error al traducir:', err.message);
        // Continuamos incluso si falla la traducción, el reporte tendrá la transcripción original
      }
    }

    // Generar el archivo Word (.docx)
    console.log('[Backend] Generando archivo Word (.docx)...');
    const docxBuffer = await generateDocxBuffer({
      filename: originalName,
      duration,
      language,
      transcript,
      translation,
      targetLanguage
    });

    // Enviar el archivo Word de vuelta
    const safeName = originalName.replace(/[^a-zA-Z0-9]/g, '_');
    const docxFilename = `transcripcion_${safeName}_${Date.now()}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${docxFilename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    return res.send(docxBuffer);

  } catch (error) {
    console.error('[Backend] Error en el controlador de transcripción:', error);
    if (res.headersSent) {
      return;
    }
    return res.status(500).json({
      error: 'Error al procesar la transcripción del audio y generar el archivo Word.',
      details: error.message
    });
  }
}

module.exports = {
  transcribeFileHandler
};
