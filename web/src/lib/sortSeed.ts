import { SEARCH_PARAM_CHARACTERS_NO_ESCAPE } from '../constants/characters'
import { getRandom } from '../lib/arrays'

export const makeSortSeed = () => {
  const firstChar = getRandom(SEARCH_PARAM_CHARACTERS_NO_ESCAPE)
  const secondChar = getRandom([...SEARCH_PARAM_CHARACTERS_NO_ESCAPE, ''] as const)
  return `${firstChar}${secondChar}`
}
