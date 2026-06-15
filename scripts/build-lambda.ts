import * as path from 'path'

import * as esbuild from 'esbuild'

async function build() {
  try {
    console.log('Building Lambda function...')
    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/lambda/quizGenerator.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: path.join(__dirname, '../dist/lambda/index.js'),
      external: ['pg-native', 'aws-sdk'],
      minify: true,
      sourcemap: true,
    })
    console.log('Build successful! Output: dist/lambda/index.js')
  } catch (error) {
    console.error('Build failed:', error)
    process.exit(1)
  }
}

build()
