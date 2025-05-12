// app/components/EditorClientWrapper.tsx
'use client'; // ¡Importante! Marca este como Client Component

import dynamic from 'next/dynamic';

// Realiza la importación dinámica DENTRO del Client Component
const DynamicEditor = dynamic(() => import('./Editor'), { // Asegúrate que la ruta a Editor sea correcta
  ssr: false, // Ahora esto es permitido porque estamos en un Client Component
  loading: () => <p>Cargando editor...</p>, // Puedes mantener el estado de carga
});

export default function EditorClientWrapper() {
  // Simplemente renderiza el componente cargado dinámicamente
  return <DynamicEditor />;
}