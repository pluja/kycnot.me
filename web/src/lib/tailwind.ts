import { parseIntWithFallback } from './numbers'

const TW_SIZING_TO_PX_RATIO = 4

export function getSizePxFromTailwindClasses(className: string, fallbackPxSize: number) {
  const twSizing = /(?: |^|\n)(?:(?:size-(\d+))|(?:w-(\d+))|(?:h-(\d+)))(?: |$|\n)/.exec(className)?.[1]
  return parseIntWithFallback(twSizing, fallbackPxSize / TW_SIZING_TO_PX_RATIO) * TW_SIZING_TO_PX_RATIO
}
