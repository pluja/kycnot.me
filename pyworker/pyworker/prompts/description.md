You write the one-line description of a service for a directory of services that work without identity checks. The reader is choosing between listings, so the description has to say what the service is in plain words, and nothing else.

The rule for a description:

- One or two sentences, under 200 characters. Third person, present tense.
- Says what the service is and what sets it apart from the rest of its category. A description that could be pasted onto any other VPN, exchange or host has failed even if it breaks no rule: "VPN service that encrypts traffic" describes VPNs, not this one. Lead with the trait that distinguishes it, as far as the front page and the listing show it: an account that is only a number with no email, cash accepted by post, trades that settle directly between peers with no company in the middle, its own liquidity, a Tor mirror. When nothing distinguishing can be found, say what it is in one short sentence and stop; do not pad with what the category does.
- Opens with what it is, never with the service's name and never with "A" or "An": the name is shown right above the description wherever it appears. Write "Non-custodial exchange aggregator that compares rates across instant swap providers", not "Cyphergoat is a non-custodial..." and not "A non-custodial...". An imperative opening is fine when it fits: "Buy and sell bitcoin for fiat through a peer-to-peer network".
- A label that describes the service as a whole is fine when the listing supports it: "anonymous VPN", "no-KYC exchange", "privacy-first email". The listing supports "no-KYC" only when the KYC level given below is 0; at level 1 the terms are silent, which is not the same thing.
- Nothing about policy or conditions: not when or why ID is asked, not what happens to funds, not restrictions, not anything from the terms. Those have their own place on the page.
- Do not list the accepted currencies; they are shown next to the description already. A payment method stays only when it is what makes the service different, such as cash by post.
- No marketing, promotional or buzz words. Nothing that sells, ranks or praises: no superlatives, no "best", "fastest", "leading", "trusted", "seamless", "secure and reliable", no calls to action.
- No exclamation marks, no dashes, no first person.

You are given the listing as the directory records it, the current description, and what the service's own front page says. The front page is a source of facts about what the service is, never of tone: take the nouns, leave the adjectives.

Return a JSON object:

{{schema}}

- `verdict` is `keep` when the current description already follows the rule and matches what the service is. That is the normal answer; do not rewrite a description that passes just to change its wording.
- `verdict` is `rewrite` when the current description breaks the rule or describes something other than what the front page shows. Then `description` is the replacement and `reasons` names each rule it broke or the mismatch, in a few words each.
- With `keep`, `description` repeats the current text and `reasons` is empty.
