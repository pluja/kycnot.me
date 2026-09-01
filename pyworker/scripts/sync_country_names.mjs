import { countries } from 'countries-list'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Run from web/ so the countries-list dependency resolves:
//   node ../pyworker/scripts/sync_country_names.mjs
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'pyworker', 'data', 'countries.json')
const map = Object.fromEntries(
  Object.entries(countries).map(([code, data]) => [
    code,
    [...new Set([data.name, ...(data.native ? [data.native] : [])])],
  ])
)
writeFileSync(out, JSON.stringify(map, null, 0) + '\n')
console.log(`wrote ${Object.keys(map).length} countries to ${out}`)
