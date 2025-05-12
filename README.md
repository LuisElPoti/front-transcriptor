# 🗳️ Transcripción y Tabulación Electoral con Next.js

Este proyecto en Next.js permite subir y procesar archivos de audio, transcribirlos en tiempo real y extraer información relevante de carácter electoral, como resultados, nombres de candidatos, partidos y porcentajes de votos.

## 🚀 Características

- 🎙️ Captura y envío de audio desde el navegador.
- 🧠 Transcripción en tiempo real con Azure Speech to Text (u otro STT).
- 🗂️ Tabulación de datos electorales desde la transcripción.
- 💬 Visualización de texto en tiempo real (tipo teleprompter).
- 📄 Descarga de la transcripción como PDF o DOCX.

## 🛠️ Tecnologías

- [Next.js](https://nextjs.org/)
- [React](https://reactjs.org/)
- [WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [Azure Speech to Text](https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/)
- [Tailwind CSS](https://tailwindcss.com/) (opcional para estilos)
- [BlockNote](https://blocknotejs.org/) (editor en tiempo real)
- [jsPDF](https://github.com/parallax/jsPDF) (para exportar PDF)

## 🧪 Instalación

```bash
git clone https://github.com/tu-usuario/tu-repo.git
cd tu-repo
npm install
```

## 🔧 Uso

1. Ejecuta el servidor de desarrollo:npm run dev
2. Abre tu navegador en [http://localhost:3000](http://localhost:3000)
3. Usa tu micrófono o sube audios para iniciar la transcripción.

## ⚙️ Configuración

Crea un archivo `.env.local` con tus claves de Azure u otros servicios:

AZURE_SPEECH_KEY=tu_clave
AZURE_REGION=tu_region

## 📄 Licencia

MIT
