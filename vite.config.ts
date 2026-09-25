import {defineConfig} from 'vite';
import {source2Assets} from './scripts/public-assets.ts';

export default defineConfig({
  base:'/',
  build:{target:'es2022',chunkSizeWarningLimit:1600},
  plugins:[source2Assets()],
  server:{host:'127.0.0.1',port:5173},
  preview:{host:'127.0.0.1'},
});
