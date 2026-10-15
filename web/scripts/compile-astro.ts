// Compiles .astro files the way the build does. astro check and eslint parse the source with other tools, so a file
// the Astro compiler turns into invalid code (such as a multi-line exported type in the frontmatter) passes them and
// only fails the production build.
import { readFileSync } from 'node:fs'

import { transform } from '@astrojs/compiler'
import { transform as transpile } from 'esbuild'

let failed = false
for (const file of process.argv.slice(2)) {
  const { code } = await transform(readFileSync(file, 'utf8'), { filename: file })
  try {
    await transpile(code, { loader: 'ts', logLevel: 'silent' })
  } catch (error) {
    failed = true
    const messages = (error as { errors?: { text: string }[] }).errors?.map((item) => item.text) ?? [
      String(error),
    ]
    console.error(`${file}: ${messages.join('; ')}`)
  }
}
if (failed) process.exit(1)
