// app/page.tsx
// No necesitas 'use client' aquí si el resto de la página no lo requiere

import EditorClientWrapper from './components/EditorClientWrapper'; // Importa el nuevo wrapper

export default function MiPagina() {
  return (
    <div>
      <h1>Mi Documento Colaborativo</h1>

      {/* Renderiza el componente wrapper */}
      <EditorClientWrapper />

    </div>
  );
}