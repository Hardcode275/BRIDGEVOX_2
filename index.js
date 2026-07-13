require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const transcriptionRoutes = require('./src/routes/transcriptionRoutes');
const { registerSocketHandlers } = require('./src/sockets/socketHandler');

const app = express();
const server = http.createServer(app);

// Configuración de Socket.io con CORS permitido para todos los orígenes
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const port = process.env.PORT || 9000;

// Middleware para CORS manual
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware para parsear JSON y urlencoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas de API
app.use('/api', transcriptionRoutes);

// Servir archivos estáticos del frontend (carpeta public)
app.use(express.static(path.join(__dirname, 'public')));

// Ruta comodín para redirigir al frontend si no coincide ninguna ruta
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configurar los manejadores de WebSockets para transcripción en tiempo real
registerSocketHandlers(io);

// Iniciar el servidor
const serverInstance = server.listen(port, () => {
  console.log(`\n===============================================================`);
  console.log(`🚀 Servidor BridgeVox_2 listo y escuchando en el puerto ${port}`);
  console.log(`💻 Ctrl + Clic para abrir en Chrome: http://localhost:${port}`);
  console.log(`===============================================================\n`);
});

// Aumentar los timeouts del servidor HTTP a 15 minutos (900000 ms) para soportar subidas de archivos gigantes
serverInstance.timeout = 15 * 60 * 1000;
serverInstance.requestTimeout = 15 * 60 * 1000; // Evita que Node.js aborte subidas lentas después de 5 minutos
serverInstance.keepAliveTimeout = 15 * 60 * 1000;
serverInstance.headersTimeout = 15 * 60 * 1000 + 1000;