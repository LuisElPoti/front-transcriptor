// app/components/Editor.tsx
"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { webSocketManager } from "../utils/websocket";
import { AudioManager } from "../utils/audioManager";
import "../styles/editor.css";
import { Block, InlineContent, BlockNoteEditor, defaultStyleSchema } from "@blocknote/core";
import { BlockNoteSchema, defaultStyleSpecs } from "@blocknote/core";
import { color } from "html2canvas/dist/types/css/types/color";
import { text } from "stream/consumers";



export default function Editor() {

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  const [modo, setModo] = useState<"transcripcion" | "eleccion">("transcripcion");
  // --- Configuración ---
  const WEBSOCKET_URL = `wss:${apiUrl}/ws/stt?modo=${modo}`; // Cambia 'modo' según el modo seleccionado
  // Asegúrate que esta ruta sea accesible públicamente desde el navegador
  const AUDIO_WORKLET_URL = "/audio-processor.js";

  type TextInlineContent = { type: "text"; text: string; styles: Record<string, string> };

  const schema = BlockNoteSchema.create({
    styleSpecs: {
      ...defaultStyleSpecs, // Incluye todos los estilos predeterminados, como 'color'
      // Puedes agregar estilos personalizados aquí si lo deseas
    },
  });

  const editor = useCreateBlockNote({schema});
  const webSocketRef = useRef<WebSocket | null>(null);
  // const audioManagerRef = useRef<AudioManager | null>(null); // No necesitamos la ref si usamos useMemo
  const editorRef = useRef<HTMLDivElement>(null);
  const lastInsertedBlockIdRef = useRef<string | null>(null);
  const partialBlockIdRef = useRef<string | null>(null); 
  const isConnectingRef = useRef<boolean>(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const partialTextRef = useRef<string>("");
  const [status, setStatus] = useState<string>("Idle");
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [resultados, setResultados] = useState<Array<{ partido: string; votos: number; porcentaje: number }>>([]);
  const [totales, setTotales] = useState<{ validos: number; blanco: number; nulos: number; participacion: number } | null>(null);


  const handleModoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setModo(e.target.value as "transcripcion" | "eleccion");
  };

  useEffect(() => {
    console.log("Estado 'resultados' ha cambiado:", resultados);
  }, [resultados]);

  useEffect(() => {
    console.log("Estado 'totales' ha cambiado:", totales);
  }, [totales]);

  // --- Callbacks (estables gracias a useCallback) ---
  const handleStatusUpdate = useCallback((newStatus: string) => {
    console.log("Status Update Received:", newStatus);
    setStatus(newStatus);
    // Usar functional updates para estabilidad y evitar dependencia [isRecording]
    if (newStatus.startsWith("Recording")) {
      // Solo cambia a true si el estado anterior era false
      setIsRecording((prevState) => (!prevState ? true : prevState));
    } else if (newStatus === "Recording stopped") {
      // Solo cambia a false si el estado anterior era true
      setIsRecording((prevState) => (prevState ? false : prevState));
    }
  }, []); // Depende de isRecording para la lógica de actualización

  const handleAudioData = useCallback((data: ArrayBuffer) => {
    // Enviar datos usando el WebSocketManager y la instancia guardada en webSocketRef
    webSocketManager.sendMessage(webSocketRef.current, data);
  }, []); // Sin dependencias externas, solo usa refs/managers

  // --- Inicializar AudioManager (solo una vez usando useMemo) ---
  const audioManagerRef = useRef<AudioManager | null>(null);
  if (audioManagerRef.current === null) {
    console.log(
      ">>> Creating AudioManager instance ONCE and storing in ref <<<"
    );
    audioManagerRef.current = new AudioManager({
      onStatusUpdate: handleStatusUpdate, // Callback ahora estable
      onDataAvailable: handleAudioData, // Callback estable
      workletUrl: AUDIO_WORKLET_URL,
      sampleRate: 16000,
    });
  }
  // Usar siempre la instancia guardada en el ref en el resto del código
  const audioManager = audioManagerRef.current;

  const getTextFromBlockContent = (content: unknown): string => {
    // Verificar si es un array antes de intentar procesarlo
    if (!Array.isArray(content)) {
        return "";
    }
    // Filtrar solo los elementos de tipo 'text' y mapear a su propiedad 'text'
    return content
        .filter((item): item is TextInlineContent => // Type guard
            typeof item === 'object' && item !== null && item.type === 'text' && typeof item.text === 'string'
        )
        .map(inlineContent => inlineContent.text)
        .join(''); // Unir todos los textos
  };

  const handleWebSocketMessage = useCallback((data: any) => {
    if (!editor) {
      console.error("Editor instance is not available in handleWebSocketMessage");
      return;
    }
    console.log("WebSocket message received in Editor:", data);
    
    const isEleccion = modo === "eleccion";
    const textContent = typeof data?.text === 'string' ? data.text : '';
    const isFinal = data?.isFinal === true;
    const speakerPrefix = isEleccion ? "" : (data?.speakerId ? `[Speaker ${data.speakerId}]: ` : "");
    const fullText = speakerPrefix + textContent;
    const trimmedContent = textContent.trim();
    console.log("Texto trimmedcontent:", trimmedContent, "modo:", modo);

    if (!isEleccion) {
      if (!trimmedContent) return;
    }
    
  
    const createTextInlineContent = (
      text: string,
      isPartial = false
    ): TextInlineContent[] => {
      const styles: Record<string, string> = isPartial ? { textColor: "yellow" } : {};
  
      return [{
        type: "text",
        text,
        styles
      }];
    };
  
    const docLength = editor.document.length;
    const lastBlock = docLength > 0 ? editor.document[docLength - 1] : undefined;
  
    if (isFinal) {
      console.log("Texto Final establecido");
      if (isEleccion) {
        console.log("[ELECCION] Entrando a la funcion. Data del manager:", data); // Log para ver qué llega
        try {
          console.log("[ELECCION] Mensaje final recibido. Data del manager:", data); // Log para ver qué llega

          let electionPayload;

          // CASO 1: El manager parseó el JSON, 'data' ES el objeto de elección.
          if (typeof data === 'object' && data !== null && data.text) {
            console.log("[ELECCION] 'data' es un objeto y parece ser el payload de elección:", data);
            electionPayload = data.text;
          }
          // CASO 2: El manager NO parseó el JSON (quizás falló o no era string),
          // y 'data' es un string que PODRÍA ser el JSON de elección.
          // (El manager ya intenta esto, pero por si acaso o si la lógica del manager cambia)
          else if (typeof data === 'string') {
            console.warn("[ELECCION] 'data' es un string. Intentando parsear en Editor:", data);
            try {
              electionPayload = JSON.parse(data);
            } catch (e) {
              console.error("[ELECCION] Falló el parseo del string JSON en Editor:", e);
              return; // No se puede procesar
            }
          }
          // CASO 3: Formato inesperado
          else {
            console.error("[ELECCION] Formato de datos de elección inesperado:", data);
            return; // No se puede procesar
          }

          // Validar el payload determinado
          if (!electionPayload || !Array.isArray(electionPayload.resultados_por_partido) || typeof electionPayload.resumen_general !== 'object') {
            return;
          }

          // Ahora usa electionPayload
          console.log("[ELECCION] Actualizando estados con electionPayload:", electionPayload);
          setResultados(electionPayload.resultados_por_partido);
          setTotales({
            validos: electionPayload.resumen_general?.total_votos_validos || 0,
            blanco: electionPayload.resumen_general?.total_votos_blanco || 0,
            nulos: electionPayload.resumen_general?.total_votos_nulos || 0,
            participacion: electionPayload.resumen_general?.participacion || 0,
          });
          console.log("[ELECCION] Estados de elección actualizados.");

          // (Tu lógica existente para actualizar BlockNoteView con el resumen)
          // const resumenTexto = electionPayload.resultados_por_partido
          //   .map((p: any) => `${p.partido}: ${p.votos} votos (${(typeof p.porcentaje === 'number' ? p.porcentaje?.toFixed(2) : p.porcentaje)}%)`)
          //   .join("\n");

          // const newBlockContent = createTextInlineContent(resumenTexto, false);
          // const newBlock = { type: "paragraph" as const, content: newBlockContent };

          // if (partialBlockIdRef.current) {
          //   editor.updateBlock(partialBlockIdRef.current, { content: newBlockContent });
          // } else {
          //   const inserted = lastBlock
          //     ? editor.insertBlocks([newBlock], lastBlock.id, "after")
          //     : editor.insertBlocks([newBlock], "0");
          //   if (inserted && inserted.length > 0) {
          //       partialBlockIdRef.current = inserted[0].id;
          //   }
          // }

        } catch (err) {
          console.error("Error procesando resultados de elección en Editor.tsx:", err);
        }
        return; // Importante para que no siga a la lógica de transcripción si es elección
      }
        // // Modo elección: reemplazar el último bloque siempre
        // const partialText = fullText;

        // if (partialBlockIdRef.current) {
        //   editor.updateBlock(partialBlockIdRef.current, {
        //     content: createTextInlineContent(partialText, false),
        //   });
        // } else {
        //   const newBlock = {
        //     type: "paragraph" as const,
        //     content: createTextInlineContent(partialText, false),
        //   };

        //   let inserted;
        //   if (lastBlock) {
        //     inserted = editor.insertBlocks([newBlock], lastBlock.id, "after");
        //   } else {
        //     inserted = editor.insertBlocks([newBlock], "0");
        //   }
        //   partialBlockIdRef.current = inserted[0].id;
        // }

        // partialTextRef.current = partialText;

      else {
        // Modo transcripción normal
        console.log("Texto final recibido:", fullText);
        if (partialBlockIdRef.current) {
          editor.updateBlock(partialBlockIdRef.current, {
            content: createTextInlineContent(fullText, false),
          });
        } else {
          const finalBlock = {
            type: "paragraph" as const,
            content: createTextInlineContent(fullText, false),
          };
  
          if (lastBlock) {
            editor.insertBlocks([finalBlock], lastBlock.id, "after");
          } else {
            editor.insertBlocks([finalBlock], "0");
          }
        }
  
        partialTextRef.current = "";
        partialBlockIdRef.current = null;
      }
  
    } else {
      // Texto parcial
      if (isEleccion) return; // En modo elección ignoramos parciales
  
      const partialText = fullText;
  
      if (partialBlockIdRef.current) {
        editor.updateBlock(partialBlockIdRef.current, {
          content: createTextInlineContent(partialText, true),
        });
      } else {
        const newBlock = {
          type: "paragraph" as const,
          content: createTextInlineContent(partialText, true),
        };
  
        let inserted;
        if (lastBlock) {
          inserted = editor.insertBlocks([newBlock], lastBlock.id, "after");
        } else {
          inserted = editor.insertBlocks([newBlock], "0");
        }
  
        partialBlockIdRef.current = inserted[0].id;
      }
  
      partialTextRef.current = partialText;
    }
  }, [editor, modo]);
// Dependencia del editor

  // --- Lógica de Conexión WebSocket ---
  const connect = useCallback(() => {
    if (
      isConnectingRef.current ||
      (webSocketRef.current &&
        webSocketRef.current.readyState === WebSocket.OPEN)
    ) {
      console.log(
        "WebSocket connect cancelled: Already connecting or connected."
      );
      return;
    }
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

    console.log("Attempting WebSocket connection...");
    isConnectingRef.current = true;
    handleStatusUpdate("WebSocket Connecting...");

    const socket = webSocketManager.connect(
      WEBSOCKET_URL,
      () => {
        // onOpen
        handleStatusUpdate("WebSocket Connected");
        isConnectingRef.current = false;
        if (reconnectTimeoutRef.current)
          clearTimeout(reconnectTimeoutRef.current); // Limpiar timeout si conecta
        reconnectTimeoutRef.current = null;
      },
      handleWebSocketMessage, // onMessage
      (error) => {
        // onError
        console.error("WebSocket connection error callback in Editor:", error);
        handleStatusUpdate("WebSocket Error");
        webSocketRef.current = null;
        isConnectingRef.current = false;
        if (!reconnectTimeoutRef.current) {
          console.log("Scheduling WebSocket reconnect...");
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
      },
      (event) => {
        // onClose
        console.log(
          `WebSocket close callback in Editor: Code=${event.code}, Reason=${event.reason}, Clean=${event.wasClean}`
        );
        handleStatusUpdate(`WebSocket Closed: ${event.reason || "Normal"}`);
        webSocketRef.current = null;
        isConnectingRef.current = false;
        // Solo intentar reconectar si no fue un cierre limpio y no hay ya un timeout pendiente
        if (!event.wasClean && !reconnectTimeoutRef.current) {
          console.log("Scheduling WebSocket reconnect due to unclean close...");
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
      }
    );
    // Guardar la instancia (puede ser null si new WebSocket falla)
    if (socket) {
      webSocketRef.current = socket;
    } else {
      // Si la creación falló inmediatamente, el onError debería haberse disparado,
      // pero por si acaso, reseteamos el estado de conexión.
      isConnectingRef.current = false;
      handleStatusUpdate("WebSocket Creation Failed");
      if (!reconnectTimeoutRef.current) {
        console.log(
          "Scheduling WebSocket reconnect due to creation failure..."
        );
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      }
    }
  }, [handleStatusUpdate, handleWebSocketMessage]); // Dependencias

  // --- Efecto para manejar la conexión/desconexión WebSocket ---
  useEffect(() => {
    connect(); // Intentar conectar al montar

    // Función de limpieza al desmontar
    return () => {
      console.log("Editor Component unmounting: Cleaning up...");
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
        console.log("Cleared reconnect timeout.");
      }
      webSocketManager.disconnect(webSocketRef.current);
      webSocketRef.current = null;
      console.log("Disconnected WebSocket.");

      const currentAudioManager = audioManagerRef.current; // Captura la instancia actual
      if (currentAudioManager?.getIsRecording()) {
        console.log("Stopping audio recording due to component unmount.");
        currentAudioManager.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]); // 'connect' es estable por useCallback, se ejecuta una vez al montar

  // --- Acciones de UI ---
  const handleStartRecording = useCallback(async () => {
    console.log("handleStartRecording called. isRecording:", isRecording);
    if (isRecording) return;

    if (
      !webSocketRef.current ||
      webSocketRef.current.readyState !== WebSocket.OPEN
    ) {
      handleStatusUpdate("WebSocket not ready. Trying to connect...");
      connect(); // Intentar (re)conectar
      return;
    }
    // Usar la instancia de AudioManager creada con useMemo
    if (audioManager) {
      await audioManager.start();
    } else {
      console.error("AudioManager instance not available!");
    }
    // El estado local isRecording se actualizará a través de handleStatusUpdate
  }, [isRecording, audioManager, connect, handleStatusUpdate]);

  const handleStopRecording = useCallback(async () => {
    console.log("handleStopRecording called. isRecording:", isRecording);
    if (!isRecording) return;
    // Usar la instancia de AudioManager creada con useMemo
    if (audioManager && isRecording) {
      // Añadir chequeo para audioManager
      await audioManager.stop();
    }
    // El estado local isRecording se actualizará a través de handleStatusUpdate
  }, [isRecording, audioManager]);

  // --- Descarga PDF (sin cambios respecto a la versión anterior) ---
  const handleDownload = useCallback(async () => {
    console.log("handleDownload: Iniciada."); // <-- Log 1: Inicio

    const editorElement = editorRef.current?.querySelector(".bn-editor");
    console.log("handleDownload: Elemento '.bn-editor' encontrado:", editorElement); // <-- Log 2: ¿Elemento existe?

    // Chequeo del editor (useCreateBlockNote puede devolver null inicialmente)
    if (!editor) {
        console.error("handleDownload: Abortado - Instancia del editor es null.");
        handleStatusUpdate("Error: Instancia del editor no disponible.");
        return;
    }
    // Chequeo del elemento HTML
    if (!editorElement) {
        console.error("handleDownload: Abortado - No se encontró el elemento '.bn-editor'.");
        handleStatusUpdate("Error: No se encontró el contenido del editor para PDF.");
        return;
    }

    console.log("handleDownload: Chequeos iniciales de editor y elemento pasados."); // <-- Log 3: Pasó chequeos

    // --- Chequear si el editor está vacío ---
    let isEmpty = editor.document.length === 0;
    let firstBlockText = "[No verificado]"; // Para el log
    if (!isEmpty && editor.document.length === 1) {
        const firstBlock = editor.document[0];
        firstBlockText = getTextFromBlockContent(firstBlock.content); // Usar helper
        if (firstBlockText.trim() === "") {
            isEmpty = true;
        }
    }
    console.log(`handleDownload: Chequeo de vacío: length=${editor.document.length}, firstBlockText='${firstBlockText}', isEmpty=${isEmpty}`); // <-- Log 4: Resultado del chequeo

    if (isEmpty) {
        console.warn("handleDownload: Abortado - El editor está vacío.");
        handleStatusUpdate("Editor is empty, nothing to download.");
        return;
    }
    // --- Fin Chequeo ---

    console.log("handleDownload: Chequeo de vacío pasado. Iniciando generación de PDF..."); // <-- Log 5: Antes de generar PDF
    handleStatusUpdate("Generating PDF...");
    await new Promise((resolve) => setTimeout(resolve, 100)); // Pequeña pausa

    try {
        console.log("handleDownload: Llamando a html2canvas..."); // <-- Log 6: Antes de html2canvas
        const canvas = await html2canvas(editorElement as HTMLElement, {
            scale: 2,
            useCORS: true,
            logging: true, // Habilitar logs de html2canvas para más info
        });
        console.log("handleDownload: html2canvas completado. Canvas obtenido:", canvas); // <-- Log 7: Después de html2canvas

        const imgData = canvas.toDataURL('image/png');
        console.log("handleDownload: imgData generado (longitud):", imgData.length); // <-- Log 8: ¿Datos de imagen OK?

        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = Math.min((pdfWidth - 20) / imgWidth, (pdfHeight - 20) / imgHeight);
        const imgX = (pdfWidth - imgWidth * ratio) / 2;
        const imgY = 10;

        console.log("handleDownload: Añadiendo imagen al PDF..."); // <-- Log 9: Antes de addImage
        pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);

        console.log("handleDownload: Guardando PDF..."); // <-- Log 10: Antes de save
        pdf.save('documento_transcrito.pdf');

        console.log("handleDownload: Generación de PDF exitosa."); // <-- Log 11: Éxito
        handleStatusUpdate("PDF Generated.");

    } catch (error) {
        console.error("handleDownload: Error durante la generación de PDF:", error); // <-- Log 12: Captura de error
        handleStatusUpdate("Error generating PDF.");
    }

}, [editor, handleStatusUpdate]); // Mantener dependencias

  // --- Renderizado ---
  if (!editor) {
    return <p>Initializing BlockNote editor...</p>;
  }

  const renderTablasEleccion = () => {
    if (modo !== "eleccion") return null;
    console.log('resultados', resultados)
    return (
      <div className="tabla-eleccion">
        <h2 style={{
          fontSize: "20px",
          fontWeight: "bold",
          marginBottom: "10px",
          color: "#333",
        }}>Resultados por Partido</h2>
        <table>
          <thead>
            <tr>
              <th>Partido</th>
              <th>Votos</th>
              <th>Porcentaje</th>
            </tr>
          </thead>
          <tbody>
            {resultados.map((r, i) => (
              <tr key={i}>
                <td>{r?.partido}</td>
                <td>
                  {typeof r?.votos === "number"
                    ? r.votos.toLocaleString()
                    : typeof r?.votos === "string" && !isNaN(Number(r.votos))
                    ? Number(r.votos).toLocaleString()
                    : "-"}
                </td>
                <td>
                  {typeof r?.porcentaje === "number"
                    ? r.porcentaje.toFixed(2) + "%"
                    : typeof r?.porcentaje === "string" && !isNaN(Number(r.porcentaje))
                    ? Number(r.porcentaje).toFixed(2) + "%"
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{
          fontSize: "20px",
          fontWeight: "bold",
          marginBottom: "10px",
          color: "#333",
        }}>Totales</h2>
        <table>
          <tbody>
            <tr>
              <td>Votos válidos</td>
              <td>
                {totales?.validos != null && !isNaN(Number(totales.validos))
                  ? Number(totales.validos).toLocaleString()
                  : "-"}
              </td>
            </tr>
            <tr>
              <td>Votos en blanco</td>
              <td>
                {totales?.blanco != null && !isNaN(Number(totales.blanco))
                  ? Number(totales.blanco).toLocaleString()
                  : "-"}
              </td>
            </tr>
            <tr>
              <td>Votos nulos</td>
              <td>
                {totales?.nulos != null && !isNaN(Number(totales.nulos))
                  ? Number(totales.nulos).toLocaleString()
                  : "-"}
              </td>
            </tr>
            <tr>
              <td>Participación</td>
              <td>
                {totales?.participacion != null && !isNaN(Number(totales.participacion))
                  ? `${Number(totales.participacion).toFixed(2)}%`
                  : "-"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="editor-container">
      <div className="status-bar">
        <p>Status: {status}</p>
        {/* Selector de modo */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "15px" }}>
          <label
            htmlFor="modo-select"
            style={{
              marginRight: "10px",
              fontWeight: "bold",
              color: "#333",
              fontSize: "16px",
            }}
          >
            Modo:
          </label>

          <select
            id="modo-select"
            value={modo}
            onChange={handleModoChange}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              backgroundColor: "#f9f9f9",
              color: "#333",
              fontSize: "15px",
              cursor: "pointer",
              outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#007BFF")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#ccc")}
          >
            <option value="transcripcion">Transcripción</option>
            <option value="eleccion">Elección</option>
          </select>
        </div>
        {/* Habilitar/deshabilitar botones según estado */}
        <button
          style={{
            backgroundColor: isRecording ? "black" : "green",
            color: isRecording ? "white" : "black",
            cursor: isRecording ? "not-allowed" : "pointer",
            marginRight: "10px",
          }}
          onClick={handleStartRecording}
          disabled={
            isRecording ||
            status.includes("Initializing") ||
            status.includes("Connecting")
          }
          aria-label="Start Recording"
        >
          Start Recording
        </button>
        <button
          style={{
            backgroundColor: isRecording ? "red" : "gray",
            color: isRecording ? "white" : "black",
            cursor: isRecording ? "pointer" : "not-allowed",
            marginRight: "10px",
          }}
          onClick={handleStopRecording}
          disabled={!isRecording}
          aria-label="Stop Recording"
        >
          Stop Recording
        </button>
        <button
          style={{
            backgroundColor: "blue",
            color: "white",
            cursor: "pointer",

          }}
          onClick={handleDownload}
          disabled={status === "Generating PDF..."} // Deshabilitar también mientras genera PDF
        >
          Descargar como PDF
        </button>
      </div>

      <div ref={editorRef}>
        <div className="word-style-editor">
          {renderTablasEleccion()}
          <BlockNoteView editor={editor} theme={"light"} />
        </div>
      </div>

      <button
        className="download-button"
        onClick={handleDownload}
        disabled={isRecording || status === "Generating PDF..."} // Deshabilitar también mientras genera PDF
      >
        Descargar como PDF
      </button>
    </div>
  );
}
