import fs from 'node:fs'
import path from 'node:path'

import type { Font } from 'satori'

const FONT_FILES_ROOT = path.resolve(process.cwd(), 'node_modules', '@fontsource')
const LOCAL_FONT_ROOT = path.resolve(process.cwd(), 'src', 'assets', 'fonts')

function readFont(packageName: string, fileName: string): Buffer {
  return fs.readFileSync(path.join(FONT_FILES_ROOT, packageName, 'files', fileName))
}

function readLocalFont(fileName: string): Buffer {
  return fs.readFileSync(path.join(LOCAL_FONT_ROOT, fileName))
}

const notoSansFonts = [
  {
    name: 'Noto Sans',
    weight: 400,
    style: 'normal',
    data: readLocalFont('NotoSans-Regular.ttf'),
  },
  {
    name: 'Noto Sans',
    weight: 700,
    style: 'normal',
    data: readLocalFont('NotoSans-Bold.ttf'),
  },
] satisfies Font[]

export const ogImageFonts = [
  {
    name: 'Inter',
    weight: 400,
    style: 'normal',
    data: readFont('inter', 'inter-latin-400-normal.woff'),
  },
  {
    name: 'Inter',
    weight: 700,
    style: 'normal',
    data: readFont('inter', 'inter-latin-700-normal.woff'),
  },
  {
    name: 'Space Grotesk',
    weight: 400,
    style: 'normal',
    data: readFont('space-grotesk', 'space-grotesk-latin-400-normal.woff'),
  },
  {
    name: 'Space Grotesk',
    weight: 700,
    style: 'normal',
    data: readFont('space-grotesk', 'space-grotesk-latin-700-normal.woff'),
  },
  ...notoSansFonts,
] satisfies Font[]
