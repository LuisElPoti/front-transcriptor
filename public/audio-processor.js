// public/audio-processor.js

/**
 * Un AudioWorkletProcessor que recibe audio, lo convierte a PCM16 (Int16Array),
 * y envía el buffer resultante de vuelta al hilo principal.
 */
class AudioProcessor extends AudioWorkletProcessor {
  // Definir parámetros personalizados si es necesario (ej. tamaño de buffer)
  // static get parameterDescriptors() {
  //   return [{ name: 'bufferSize', defaultValue: 4096 }];
  // }

  constructor(options) {
    super(options);
    this._bufferSize = 1024; // Tamaño fijo o configurable vía options.processorOptions
    this._buffer = new Int16Array(this._bufferSize);
    this._bufferPos = 0;

    // Escuchar mensajes del hilo principal (si es necesario)
    this.port.onmessage = (event) => {
      // console.log('[AudioProcessor] Received message:', event.data);
      // Podrías recibir comandos como 'stop', 'config', etc.
    };
    console.log('[AudioProcessor] Initialized');
  }

  process(inputs, outputs, parameters) {
    // Usamos solo la primera entrada y el primer canal
    const inputChannel = inputs[0]?.[0];

    // Si no hay entrada o el canal está vacío, no hacer nada
    if (!inputChannel || inputChannel.length === 0) {
      return true; // Mantener vivo el procesador
    }

    // Procesar los datos de entrada y enviarlos cuando el buffer esté lleno
    for (let i = 0; i < inputChannel.length; i++) {
      // Convertir Float32 [-1.0, 1.0] a Int16 [-32768, 32767]
      this._buffer[this._bufferPos++] = Math.max(
        -32768,
        Math.min(32767, Math.floor(inputChannel[i] * 32768))
      );

      // Si el buffer está lleno, enviarlo al hilo principal
      if (this._bufferPos >= this._bufferSize) {
        try {
          // Enviar una copia del buffer (el ArrayBuffer subyacente)
          // El segundo argumento [this._buffer.buffer.slice(0)] transfiere propiedad si es soportado,
          // pero slice(0) crea una copia segura.
          this.port.postMessage(this._buffer.buffer.slice(0));
        } catch (error) {
            console.error("[AudioProcessor] Error sending message:", error);
             // Podrías intentar enviar sin slice si hay problemas de transferencia,
             // aunque es menos seguro si el buffer se modifica rápido:
             // this.port.postMessage(this._buffer.buffer);
        }
        this._bufferPos = 0; // Resetear posición
      }
    }

    // Devolver true para mantener el procesador vivo
    // Devolver false lo detendría después de un período de inactividad.
    return true;
  }
}

// Registrar el procesador
try {
  registerProcessor('audio-processor', AudioProcessor);
} catch (e) {
  console.error('Failed to register AudioProcessor:', e);
}