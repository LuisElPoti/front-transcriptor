// app/utils/websocket.ts

export interface WebSocketManager {
    connect: (
      url: string,
      onOpen: () => void,
      onMessage: (data: any) => void,
      onError: (event: Event) => void,
      onClose: (event: CloseEvent) => void
    ) => WebSocket | null;
    sendMessage: (socket: WebSocket | null, data: string | ArrayBuffer) => boolean;
    disconnect: (socket: WebSocket | null) => void;
  }
  
  export const webSocketManager: WebSocketManager = {
    connect: (url, onOpen, onMessage, onError, onClose) => {
      try {
        console.log(`Attempting to connect WebSocket to ${url}`);
        const socket = new WebSocket(url);
  
        socket.onopen = () => {
          console.log('WebSocket connected via manager');
          onOpen();
        };
  
        socket.onmessage = (event) => {
          console.log('WebSocket message received via manager', event.data);
          try {
            // Intentar parsear como JSON, si falla, enviar el dato crudo
            let parsedData;
            if (typeof event.data === 'string') {
              try {
                 parsedData = JSON.parse(event.data);
                 console.log('Parsed WebSocket message:', parsedData);
              } catch(e){
                 console.warn("WebSocket message is not valid JSON:", event.data);
                 parsedData = event.data; // Enviar como string si no es JSON
              }
            } else {
               parsedData = event.data; // Podría ser Blob o ArrayBuffer
              console.log('WebSocket message is not a string:', event.data);
            }
            onMessage(parsedData);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error, event.data);
            // Podrías querer llamar a onError aquí también o enviar el dato crudo
             onMessage(event.data); // Enviar dato crudo si falla el parseo
          }
        };
  
        socket.onerror = (event) => {
          console.error('WebSocket error via manager', event);
          onError(event);
        };
  
        socket.onclose = (event) => {
          console.log('WebSocket closed via manager', event.code, event.reason);
          onClose(event);
        };
  
        return socket;
  
      } catch (error) {
          console.error("Failed to create WebSocket:", error);
          onError(new Event('creation-failed')); // Simular un evento de error
          return null;
      }
    },
  
    sendMessage: (socket, data) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
        return true;
      } else {
        console.warn('Cannot send message, WebSocket is not open.', socket?.readyState);
        return false;
      }
    },
  
    disconnect: (socket) => {
      if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
        console.log('Disconnecting WebSocket via manager...');
        socket.close();
      } else {
         console.log('WebSocket already closed or closing.');
      }
    },
  };