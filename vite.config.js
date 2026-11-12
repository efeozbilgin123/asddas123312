import {defineConfig} from 'vite';
export default defineConfig({server:{proxy:{'/socket.io':{target:'http://localhost:3001',ws:true},'/health':'http://localhost:3001'}},build:{outDir:'dist'}});
