import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({mode}) => {
  const showcase = mode === 'showcase';
  const previewData = path.resolve(__dirname,'src/showcase/data.ts');
  return {
    plugins: [react(), tailwindcss(), ...(showcase ? [{name:'showcase-entry',
      transformIndexHtml:{order:'pre' as const,handler:(html:string)=>html.replace('/src/main.tsx','/src/showcase/main.tsx')}
    }] : [])],
    resolve: {
      alias: [
        ...(showcase ? [{find:/^(?:\.\.\/|\.\/)lib\/(?:firebase|commands)$/,replacement:previewData},
          {find:/^firebase\/(?:auth|firestore)$/,replacement:previewData}] : []),
        {find:'@',replacement:path.resolve(__dirname,'.')}
      ],
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
