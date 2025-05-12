// app/utils/audioManager.ts

interface AudioManagerOptions {
    sampleRate?: number;
    onStatusUpdate: (status: string) => void;
    onDataAvailable: (data: ArrayBuffer) => void; // Callback para enviar datos procesados (ArrayBuffer)
    workletUrl?: string; // URL del archivo del worklet
  }
  
  interface AudioResources {
    audioContext: AudioContext;
    mediaStream: MediaStream;
    audioInput: MediaStreamAudioSourceNode;
    workletNode: AudioWorkletNode; // Solo necesitamos el nodo Worklet
  }
  
  export class AudioManager {
    private resources: AudioResources | null = null;
    private options: Required<Omit<AudioManagerOptions, 'workletUrl'>> & { workletUrl: string }; // Opciones internas
    private isRecording = false;
  
    constructor(options: AudioManagerOptions) {
      // Establecer valores por defecto y asegurar que todas las opciones están presentes
      this.options = {
        sampleRate: options.sampleRate ?? 16000,
        workletUrl: options.workletUrl ?? '/public/audio-processor.js', // Asegúrate que esta ruta es correcta
        onStatusUpdate: options.onStatusUpdate,
        onDataAvailable: options.onDataAvailable,
      };
       console.log("AudioManager initialized with options:", this.options);
    }
  
    async start(): Promise<boolean> {
      if (this.isRecording) {
        this.options.onStatusUpdate('Already recording');
        console.warn("AudioManager: Start called while already recording.");
        return true;
      }
  
      this.options.onStatusUpdate('Initializing audio...');
      console.log("AudioManager: Starting...");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("AudioManager: Microphone access granted.");
  
        const audioContext = new AudioContext({ sampleRate: this.options.sampleRate });
        // Reanudar contexto si está suspendido (importante después de interacción del usuario)
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        console.log(`AudioManager: AudioContext created (State: ${audioContext.state}, SampleRate: ${audioContext.sampleRate})`);
  
  
        const audioInput = audioContext.createMediaStreamSource(stream);
        console.log("AudioManager: MediaStreamSource created.");
  
  
        // --- Configuración de AudioWorklet ---
        try {
          this.options.onStatusUpdate('Loading AudioWorklet...');
          console.log(`AudioManager: Attempting to load worklet module from ${this.options.workletUrl}`);
          await audioContext.audioWorklet.addModule(this.options.workletUrl);
          console.log("AudioManager: AudioWorklet module added successfully.");
  
          const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
           console.log("AudioManager: AudioWorkletNode created.");
  
          // Escuchar mensajes (datos procesados) desde el worklet
          workletNode.port.onmessage = (event) => {
            if (this.isRecording && event.data instanceof ArrayBuffer) {
              // Recibir ArrayBuffer del worklet y enviarlo a través del callback
              this.options.onDataAvailable(event.data);
            } else {
                // console.log("AudioManager: Received message from worklet while not recording or invalid data:", event.data);
            }
          };
  
          // Manejar errores del worklet (opcional pero recomendado)
          workletNode.onprocessorerror = (event) => {
             console.error("AudioWorkletNode processor error:", event);
             this.options.onStatusUpdate(`Error: AudioWorklet processor failed - ${event}`);
              // Podrías intentar parar aquí si ocurre un error irrecuperable
              // this.stop();
           };
  
  
          // Conectar la fuente de audio al worklet y este al destino (altavoces/salida)
          audioInput.connect(workletNode);
          workletNode.connect(audioContext.destination);
          console.log("AudioManager: Audio nodes connected (Input -> Worklet -> Destination).");
  
  
          // Guardar todos los recursos
          this.resources = { audioContext, mediaStream: stream, audioInput, workletNode };
          this.isRecording = true;
          this.options.onStatusUpdate('Recording');
          console.log("AudioManager: Recording started successfully.");
          return true;
  
        } catch (workletError) {
          console.error('AudioManager: Failed to load or setup AudioWorklet:', workletError);
          this.options.onStatusUpdate(`Error: AudioWorklet setup failed - ${workletError}`);
          // Limpiar recursos parcialmente creados si falla el worklet
          stream?.getTracks().forEach((track) => track.stop());
          if (audioContext && audioContext.state !== 'closed') {
             await audioContext.close().catch(e => console.error("Error closing AudioContext after worklet failure:", e));
          }
          this.resources = null; // Asegurarse que no queden recursos colgados
          return false;
        }
  
      } catch (error: any) {
        console.error('AudioManager: Error accessing microphone or setting up audio context:', error);
        this.options.onStatusUpdate(`Error accessing microphone: ${error.message}`);
        await this.stop(); // Intentar limpiar si falla
        return false;
      }
    }
  
    async stop(): Promise<void> {
      if (!this.isRecording && !this.resources) {
        console.warn('AudioManager: Stop called but not recording or already stopped.');
        return;
      }
      console.log('AudioManager: Stopping recording and cleaning up resources...');
  
      this.isRecording = false; // Marcar como no grabando inmediatamente
  
      if (this.resources) {
        const { audioContext, mediaStream, audioInput, workletNode } = this.resources;
  
        try {
          // 1. Desconectar nodos en orden inverso
           if (workletNode) {
              // workletNode.port.postMessage('stop'); // Enviar mensaje al worklet si lo necesita
              workletNode.disconnect();
              console.log("AudioManager: WorkletNode disconnected.");
           }
           if(audioInput) {
              audioInput.disconnect();
              console.log("AudioManager: AudioInput disconnected.");
           }
  
  
          // 2. Parar las pistas del stream del micrófono
           if(mediaStream){
               mediaStream.getTracks().forEach((track) => {
                 track.stop();
                 console.log(`AudioManager: MediaStream track stopped (ID: ${track.id})`);
               });
           }
  
  
          // 3. Cerrar el AudioContext (manejar posible estado 'closed')
           if (audioContext && audioContext.state !== 'closed') {
             await audioContext.close();
             console.log(`AudioManager: AudioContext closed (Previous state: ${audioContext.state})`);
           } else {
               console.log("AudioManager: AudioContext already closed or not initialized.");
           }
  
        } catch (error) {
            console.error("AudioManager: Error during cleanup:", error);
            // Aún así, intentar limpiar la referencia
        } finally {
             // 4. Limpiar la referencia a los recursos
             this.resources = null;
             console.log("AudioManager: Resources nulled.");
             this.options.onStatusUpdate('Recording stopped');
        }
  
      } else {
         console.log("AudioManager: No resources found to clean up.");
         this.options.onStatusUpdate('Recording stopped'); // Asegurarse que el estado se actualiza
      }
    }
  
    getIsRecording(): boolean {
      return this.isRecording;
    }
  }