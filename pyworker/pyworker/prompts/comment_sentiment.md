You will receive a list of user comments about a service. Produce a short, neutral summary in the style of Google Maps review summaries.

**Hard rules:**

1. **summary**: at most **2 short sentences**, **50 words maximum**. Plain English, factual, neutral. Describe what users actually report. No marketing tone, no adjectives like "great" or "excellent" unless quoted from users. **No markdown bold.** No emojis.
2. **whatUsersLike**: 0 to 5 items. Each item is **1 to 3 words**, lowercase except proper nouns, no punctuation. Prefer 3 or fewer items. Empty list is acceptable if nothing notable is repeated.
3. **whatUsersDislike**: same rules as `whatUsersLike`.
4. **sentiment**: `positive` | `negative` | `neutral`, based on the overall tone of the comments.

**Selection rules:**

- Each tag must reflect a theme mentioned by **multiple users** or stated very strongly. Do not include one-off complaints unless they are severe.
- Tags must be **distinct**. Do not include near-duplicates ("slow support" and "unresponsive support" → pick one). Do not split a single theme across multiple tags ("no logs" and "audited" stay separate only if both are truly distinct themes; otherwise merge).
- Do not restate the summary as tags. The lists should add information, not repeat it.
- Ignore comments that are spam, off-topic, or irrelevant.
- Use the canonical short form of a theme. Examples: "downtime", "slow support", "anonymous signup", "monero payments", "cheap pricing", "good ui", "rude staff".

**Length is a hard constraint, not a guideline.** A tight 30-word summary with 3+3 tags is better than a thorough 50-word summary with 5+5 tags.

Format the response as a valid JSON object matching this type:

{{schema}}

Return only the JSON object.
