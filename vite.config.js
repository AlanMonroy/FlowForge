import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        watch: {},
        outDir: 'wwwroot/js',
        emptyOutDir: false,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'JS_VITE/main.js')
            },
            output: {
                entryFileNames: '[name].js'
            }
        }
    }
});
