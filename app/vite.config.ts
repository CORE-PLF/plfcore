import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import JavaScriptObfuscator from 'javascript-obfuscator'

// SINGLEFILE=1 gera um único index.html com tudo embutido (para a demo publicável).
const singlefile = process.env.SINGLEFILE === '1'

// Ofusca só o bundle final; dev continua legível. controlFlowFlattening e
// selfDefending ficam OFF: custam runtime e podem quebrar o React em produção.
const obfuscator = (): Plugin => ({
  name: 'resync-obfuscator',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type === 'chunk') {
        chunk.code = JavaScriptObfuscator.obfuscate(chunk.code, {
          compact: true,
          simplify: true,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 0.8,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          // Specifiers './Chunk-x.js' precisam ficar literais: o vite:build-import-analysis
          // roda DEPOIS deste hook e só injeta o CSS do chunk (__vite__mapDeps) se conseguir
          // resolver o import() estaticamente. Sem isso, telas lazy carregam sem estilo.
          reservedStrings: ['^\\./'],
          controlFlowFlattening: false,
          deadCodeInjection: false,
          selfDefending: false,
          debugProtection: false,
          target: 'browser',
        }).getObfuscatedCode()
      }
    }
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(singlefile ? [viteSingleFile()] : []), obfuscator()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    ...(singlefile ? { assetsInlineLimit: 100_000_000, cssCodeSplit: false } : {}),
  },
})
