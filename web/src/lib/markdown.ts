import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import { visit, EXIT } from 'unist-util-visit'

import type { Options as SanitizeSchema } from 'rehype-sanitize'

import { DEPLOYMENT_MODE } from '../lib/client/envVariables'

/** A string containing Markdown. */
export type MarkdownString = string

/** A string containing HTML. */
export type HtmlString = string

function rehypeLinkRelPlugin(linkRel: string[]) {
  return () => (tree: {
    type: string
    tagName?: string
    properties?: Record<string, unknown>
    children?: unknown[]
  }) => {
    if (linkRel.length === 0) return

    visit(tree, 'element', (node: { tagName?: string; properties?: Record<string, unknown> }) => {
      if (node.tagName !== 'a') return

      // Preserve `rel="sponsored"` when authored explicitly (e.g. raw HTML in
      // a sponsored review post). Trusted markdown sources (like the blog
      // content collection) can opt into this; user-generated comments are
      // already sanitized of attributes before reaching this plugin, so they
      // cannot inject `sponsored` here.
      const existingRel = node.properties?.rel
      const existingArray = Array.isArray(existingRel)
        ? existingRel.map(String)
        : typeof existingRel === 'string'
          ? existingRel.split(/\s+/)
          : []
      const rel = existingArray.includes('sponsored')
        ? ['sponsored', 'noopener', 'noreferrer'].join(' ')
        : linkRel.join(' ')

      node.properties = {
        ...node.properties,
        rel,
      }
    })
  }
}

export async function markdownToHtml(
  md: string,
  options: { allowImages?: boolean; allowRawHtml?: boolean; linkRel?: string[] } = {}
) {
  try {
    // `allowRawHtml` is for trusted sources only (e.g. blog posts authored
    // in-repo). It enables raw HTML so authored anchors with `rel="sponsored"`
    // survive into the output. NEVER pass this for user-generated content
    // (comments, suggestions): even with sanitization on top, the looser
    // parsing surface adds risk.
    const sanitizeSchema: SanitizeSchema = {
      ...defaultSchema,
      tagNames: options.allowImages
        ? defaultSchema.tagNames
        : defaultSchema.tagNames?.filter((t) => t !== 'img'),
      attributes: options.allowRawHtml
        ? {
            ...defaultSchema.attributes,
            a: [
              ...(defaultSchema.attributes?.a ?? []),
              ['rel', 'nofollow', 'noopener', 'noreferrer', 'sponsored'],
            ],
          }
        : defaultSchema.attributes,
    }

    const processor = options.allowRawHtml
      ? remark()
          .use(remarkGfm)
          .use(remarkRehype, { allowDangerousHtml: true })
          .use(rehypeRaw)
          .use(rehypeSanitize, sanitizeSchema)
      : remark()
          .use(remarkGfm)
          .use(remarkRehype)
          .use(rehypeSanitize, sanitizeSchema)

    return String(
      await processor
        .use(rehypeLinkRelPlugin(options.linkRel ?? []))
        .use(rehypeStringify)
        .process(md)
    )
  } catch (error) {
    console.error('[markdownToHtml] Error while parsing markdown:')
    console.error(error)

    if (DEPLOYMENT_MODE === 'production') return 'Error parsing markdown'

    return `Error parsing markdown. Dev-only error preview: ${typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error)}`
  }
}

export function hasLikelyXss(markdown: string): boolean {
  if (!markdown) return false

  const ast = remark().parse(markdown)

  const rxTag = /<\s*(script|iframe|object|embed|link|meta|base)\b/i
  const rxEvent = /\bon[a-z0-9-]+\s*=/i
  const rxAttrUrl = /\b(?:href|src|action|formaction|srcdoc)\s*=\s*['"]?([^\s'">]+)/i
  const rxProto = /^\s*(?:javascript|vbscript):/i
  const rxData = /^\s*data:(?:text\/html|image\/svg\+xml)/i

  const decode = (s: string) =>
    s
      .replace(/&#x([0-9a-fA-F]+);?/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#([0-9]+);?/g, (_, d: string) => String.fromCharCode(parseInt(d, 10)))

  let flagged = false

  visit(ast, (node) => {
    if (node.type === 'code' || node.type === 'inlineCode') return

    if (node.type === 'html') {
      const v = decode(node.value)
      if (rxTag.test(v) || rxEvent.test(v)) {
        flagged = true
        return EXIT
      }
      const m = rxAttrUrl.exec(v)
      if (m && (rxProto.test(m[1] ?? '') || rxData.test(m[1] ?? ''))) {
        flagged = true
        return EXIT
      }
    }

    if ('url' in node) {
      const u = decode(node.url).trim().toLowerCase()
      if (rxProto.test(u) || rxData.test(u)) {
        flagged = true
        return EXIT
      }
    }
  })

  return flagged
}
