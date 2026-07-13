# BridgeVox 2 🚀

**BridgeVox 2** es una moderna plataforma web para la transcripción y traducción de audio en tiempo real y a través de archivos cargados. Utiliza el poder de **Deepgram (SDK v5)** para el procesamiento de voz a texto y genera de manera automatizada reportes formateados en documentos de Microsoft Word (.docx).

---

## 🌟 Características Principales

*   🎙️ **Transcripción en Tiempo Real:** Transmite audio en vivo mediante WebSockets (`Socket.io`) con latencia ultra baja gracias al modelo `nova-2` de Deepgram.
*   📁 **Procesamiento de Archivos:** Sube archivos de audio (como `.m4a`, `.mp3`, `.wav`) de hasta 15MB para transcribirlos en segundos.
*   🗣️ **Detección y Traducción Multilingüe:** Soporta múltiples idiomas (Español, Inglés, Francés, Alemán, Portugués, Italiano) con traducción en vivo y en diferido.
*   📄 **Generación de Reportes Word (.docx):** Descarga automáticamente un documento estructurado en Word que incluye metadatos de la sesión, duración del audio, transcripción limpia y traducción de manera formal.
*   🎨 **Interfaz de Usuario Premium:** Diseño moderno con tema oscuro, soporte de Drag & Drop para subir archivos, previsualización de reproductor de audio nativo y notificaciones dinámicas.

---

## 🛠️ Tecnologías Utilizadas

### **Backend (Node.js)**
*   **Express:** Framework web para servir la API REST y los archivos estáticos.
*   **Socket.io:** Protocolo de comunicación bidireccional en tiempo real para streaming de audio.
*   **@deepgram/sdk (v5):** Integración oficial de voz a texto de última generación.
*   **Multer:** Middleware para el manejo y subida de archivos multipart/form-data en memoria.
*   **docx:** Librería para la estructuración y generación dinámica del archivo Word (.docx).
*   **dotenv:** Gestión de variables de entorno seguras.

### **Frontend**
*   HTML5 (Estructura semántica).
*   CSS3 (Estilos personalizados avanzados, variables CSS, diseño responsivo y efectos modernos).
*   JavaScript (Lógica nativa/vanilla para WebSockets, grabador Web Audio API y subidas fetch).

---

## 📋 Requisitos Previos

Asegúrate de tener instalado:
*   [Node.js](https://nodejs.org/) (Versión 18 o superior recomendada).
*   Una cuenta activa de **Deepgram** (para obtener tu API Key).
*   Una API Key de **OpenAI** (para el servicio de traducción).

---

## 🚀 Instalación y Configuración

1.  **Clona o descarga este repositorio** en tu máquina local.
2.  **Instala las dependencias del proyecto:**
    ```bash
    npm install
    ```
3.  **Configura las variables de entorno:**
    Crea o edita el archivo `.env` en la raíz del proyecto y agrega tus llaves de API:
    ```env
    PORT=9000
    DEEPGRAM_API_KEY=tu_api_key_de_deepgram
    OPENAI_API_KEY=tu_api_key_de_openai
    ELEVENLABS_API_KEY=tu_api_key_de_elevenlabs
    ```

---

## 🏃‍♂️ Ejecución del Proyecto

El proyecto incluye dos scripts configurados en el `package.json`:

*   **Modo Desarrollo (con reinicio automático usando nodemon):**
    ```bash
    npm run dev
    ```
*   **Modo Producción:**
    ```bash
    npm start
    ```

Una vez en ejecución, abre tu navegador e ingresa a:  
👉 **[http://localhost:9000](http://localhost:9000)** *(o el puerto configurado en tu `.env`)*

> [!NOTE]
> Para abrir los enlaces locales de la terminal directamente en tu navegador por defecto (como Chrome) en lugar del visualizador interno de VS Code, el proyecto ya viene configurado localmente en `.vscode/settings.json`.

---

## 📂 Estructura de Directorios

```text
BRIDGEVOX_2/
├── .vscode/               # Ajustes locales del IDE
│   └── settings.json      # Configuración del navegador externo
├── public/                # Archivos estáticos del frontend
│   ├── app.js             # Lógica e interacciones del cliente
│   ├── index.html         # Interfaz web principal
│   └── styles.css         # Diseño visual de la aplicación
├── src/                   # Código de la aplicación en el backend
│   ├── config/            # Configuraciones adicionales
│   ├── controllers/       # Controladores de las rutas REST (transcripción)
│   ├── routes/            # Rutas de la API de Express
│   ├── services/          # Conectores a APIs externas (Deepgram, OpenAI, Word)
│   ├── sockets/           # Manejadores de WebSockets para tiempo real
│   └── utils/             # Funciones utilitarias
├── index.js               # Punto de entrada de la aplicación
├── .env                   # Variables de entorno (API Keys - ignorado en git)
├── .gitignore             # Exclusiones de archivos para Git
└── README.md              # Documentación del proyecto
```
