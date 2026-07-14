const express = require('express');
const router = express.Router();
const multer = require('multer');
const { 
  transcribeFileHandler,
  getJobStatusHandler,
  downloadJobDocxHandler
} = require('../controllers/transcriptionController');
const path = require('path');
const fs = require('fs');

// Crear la carpeta uploads si no existe
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de multer para almacenar temporalmente en disco
// Aumentamos el límite a 2GB para archivos de audio gigantes
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024 // 2GB
  }
});

// Ruta para subir un audio e iniciar el trabajo de transcripción en segundo plano
router.post('/transcribe', upload.single('audio'), transcribeFileHandler);

// Ruta para obtener el progreso y estado actual de la tarea
router.get('/transcribe/status/:jobId', getJobStatusHandler);

// Ruta para descargar el Word generado de forma directa
router.get('/transcribe/download/:jobId', downloadJobDocxHandler);

module.exports = router;
