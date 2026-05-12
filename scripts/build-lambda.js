// @ts-check
const esbuild = require('esbuild')
const { execSync } = require('child_process')
const { mkdirSync, existsSync, unlinkSync } = require('fs')
const { resolve } = require('path')

const root = resolve(__dirname, '..')
const outDir = resolve(root, 'dist', 'lambda')
const outFile = resolve(outDir, 'index.js')
const zipFile = resolve(outDir, 'quizGenerator.zip')

mkdirSync(outDir, { recursive: true })

esbuild
  .build({
    entryPoints: [resolve(root, 'src', 'lambda', 'quizGenerator.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: outFile,
    sourcemap: true,
    external: [],
    minify: false,
  })
  .then(() => {
    console.log('Bundle written to', outFile)

    if (existsSync(zipFile)) unlinkSync(zipFile)

    if (process.platform === 'win32') {
      execSync(
        `powershell -Command "Compress-Archive -Path '${outFile}' -DestinationPath '${zipFile}'"`,
      )
    } else {
      execSync(`cd "${outDir}" && zip -j "${zipFile}" "${outFile}"`)
    }

    console.log('ZIP written to', zipFile)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
