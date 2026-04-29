import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        watch: {},
        outDir: 'wwwroot/js',
        emptyOutDir: false,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'JS_VITE/main.js'),
                app: resolve(__dirname, 'JS_VITE/app.js'),
                extras: resolve(__dirname, 'JS_VITE/extras.js'),
                simulation: resolve(__dirname, 'JS_VITE/main.js')
            },
            output: {
                entryFileNames: '[name].js'
            }
        }
    }
});
