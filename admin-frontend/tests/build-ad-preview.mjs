// Compile the actual component for an isolated localhost browser regression.
// This is not a replacement for authenticated production browser verification.
import {build} from 'vite'
import vue from '@vitejs/plugin-vue'
import {writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const out=path.resolve(process.argv[2]||'/tmp/kinosota-ad-preview')
mkdirSync(out,{recursive:true})
const entry=out+'-entry.ts'
writeFileSync(entry,`import {createApp} from ${JSON.stringify(root+'/node_modules/vue/dist/vue.esm-bundler.js')};import AdStudio from ${JSON.stringify(root+'/src/views/AdStudio.vue')};createApp(AdStudio).mount('#app')`)
await build({configFile:false,root,define:{'process.env.NODE_ENV':JSON.stringify('production')},plugins:[vue()],build:{outDir:out,emptyOutDir:true,lib:{entry,name:'AdStudioQA',formats:['iife'],fileName:()=> 'studio.js'}}})
writeFileSync(out+'/index.html','<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin-frontend.css"><body style="margin:0;background:#0e1522;color:#e7edf5;font-family:Arial"><div id="app"></div><script src="/studio.js"></script></body></html>')
