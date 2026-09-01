/**
 * Paths that cost crawl budget and can never rank.
 *
 * `/go/` is the outbound redirect hop. Its links already carry
 * `rel="nofollow"`, so this only adds cover for crawlers that ignore that.
 */
const DISALLOWED_PATHS = ['/admin/', '/internal-api/', '/api/', '/feeds/user/', '/go/']

/**
 * Swap query parameters that turn one page into an unbounded set of
 * near-identical quotes. The page marks these `noindex` itself; keeping them
 * out of crawl stops the parameter space being walked in the first place.
 */
const DISALLOWED_SWAP_PARAMS = ['sendAmount', 'receiveAmount', 'sortBy', 'approvedOnly']

/**
 * Crawlers that put the site in a search index or cite it in an answer.
 *
 * `Claude-User`, `Perplexity-User` and `Amzn-User` fetch a page because a
 * person asked about it, so blocking them would only remove the site from
 * answers it was already about to appear in.
 */
const SEARCH_AND_ANSWER_BOTS = [
  'ChatGPT-User',
  'OAI-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-SearchBot',
  'Claude-User',
  'Amzn-SearchBot',
  'Amzn-User',
]

/**
 * Crawlers that collect training data, blocked per the content license.
 *
 * `anthropic-ai` is retired but harmless to keep; `ClaudeBot` is the token
 * Anthropic actually crawls with. `Amazonbot` is here because Amazon
 * documents it as feeding model training, unlike its two sibling tokens.
 * Blocking `Google-Extended` costs nothing in Search: it gates Gemini
 * grounding and training, not indexing or AI Overviews.
 */
const TRAINING_BOTS = [
  'GPTBot',
  'Google-Extended',
  'anthropic-ai',
  'ClaudeBot',
  'CCBot',
  'Applebot-Extended',
  'Diffbot',
  'Amazonbot',
  'Meta-ExternalAgent',
  'meta-externalagent',
  'meta-externalfetcher',
]

const userAgentLines = (agents: string[]) => agents.map((agent) => `User-agent: ${agent}`)

/**
 * A group that may crawl, minus the paths nobody should.
 *
 * Every rule is repeated per group on purpose: RFC 9309 has crawlers obey
 * exactly one group, so a named group inherits nothing from `*`. Generating
 * them from one list is what stops the groups drifting apart.
 */
const allowGroup = (agents: string[]) =>
  [
    ...userAgentLines(agents),
    'Allow: /',
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    ...DISALLOWED_SWAP_PARAMS.map((param) => `Disallow: /swap?*${param}=`),
  ].join('\n')

const blockGroup = (agents: string[]) => [...userAgentLines(agents), 'Disallow: /'].join('\n')

export function buildRobotsTxt(sitemapUrl: string): string {
  return [
    '# Search and answer engines. Allowed so the site can be found and cited.',
    allowGroup(SEARCH_AND_ANSWER_BOTS),
    '',
    '# Training crawlers. Blocked per the content license.',
    blockGroup(TRAINING_BOTS),
    '',
    '# Bytespider is reported to skip grouped User-agent lines, so it gets its own.',
    blockGroup(['Bytespider']),
    '',
    '# Everyone else.',
    allowGroup(['*']),
    '',
    `Sitemap: ${sitemapUrl}`,
    '',
  ].join('\n')
}
