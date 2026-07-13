const express = require('express');
const router = express.Router();
const multer = require('multer');
const { transcribeFileHandler } = require('../controllers/transcriptionController');
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

// Ruta para subir un audio y obtener la transcripción
router.post('/transcribe', upload.single('audio'), transcribeFileHandler);

module.exports = router;
