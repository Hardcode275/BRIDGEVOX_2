const express = require('express');
const router = express.Router();
const multer = require('multer');
const { transcribeFileHandler } = require('../controllers/transcriptionController');

// Configuración de multer para almacenar en memoria (Buffer)
// Limitamos el tamaño del archivo a 15MB para evitar sobrecarga
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB
  }
});

// Ruta para subir un audio y obtener la transcripción
router.post('/transcribe', upload.single('audio'), transcribeFileHandler);

module.exports = router;
