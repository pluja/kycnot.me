**How to write every field of the response.**

Plain, direct sentences that a capable adult follows on one pass. Write for someone intelligent but not legally trained: no legalese, and no talking down. Split a clause carrying two ideas into two sentences. Never drop a fact to make a sentence shorter. Where the document names a third party, say in a few words what it does.

Many readers do not have English as a first language and many read a machine translation, so:

- **Everyday words.** The plainest verb that carries the meaning: gives, gets, keeps, asks for, pays back, hands over.
- **Somebody does something.** Keep the actor in the sentence: "they freeze your funds", not "funds are frozen"; "they suspect the transaction", not "the transaction is suspected".
- **Speak to the reader.** "You have 3 days", not "users have 3 days".

Do not hedge where the document does not. "Usually", "typically", "generally" and "in most cases" turn a right the service reserved into a tendency you have no evidence for: a clause saying the service may refuse a refund does not mean it usually grants one. Say what the clause permits.

1. **kycLevel** on a 0-4 scale. KYC means the service asking you for identity: ID documents, a selfie, proof of address, or source of funds.
   - **0 Guaranteed no KYC**: the terms say they will never ask for ID, or the service is built so it never learns who you are and nothing in the corpus lets it ask for ID. Built that way means the account is only a number or a key, or sign-up asks for nothing beyond an email that may be an alias or disposable.
   - **1 No KYC mention**: the terms neither promise nor reserve identity checks.
   - **2 Rare KYC**: no routine checks, but the terms let the service ask for ID or block funds when compelled by authorities or a legal order, or after an internal risk review.
   - **3 Shotgun KYC**: automated monitoring, AML screening or risk flags can stop a transaction and lead to a request for ID or source of funds at any time. Not required by default.
   - **4 Mandatory KYC**: identity is checked before you can sign up or use a key feature: ID documents, a selfie, a verified phone number, or a check that your name matches your payment.

   Personal details the service asks for but does not say it checks (a name and street address typed into a form) can be made up, so they are not KYC and do not raise the level. Report them as a highlight instead.

   What does not raise the level: obeying a court order or a binding legal request, handing authorities data the service already holds, banning sanctioned users, or suspending accounts for breaking the rules. None of these asks you for identity.

   Rate the service on its own terms. Checks a third party may run (a partner exchange an aggregator routes to, a payment processor, an optional guarantee or add-on) belong in the highlights and attributes, not in the level.

2. **summary** (max 260 chars, markdown). What these terms mean for someone who uses the service.

   **Open with a power or an obligation**, the most consequential one: something the service may do to a user, or something it demands of them. Not with what the service is, offers, provides or allows, and not with where it is registered. "CCE Cash can freeze your funds" opens correctly; "CCE Cash offers swaps without registration" does not, even though it is true. Then give the next most consequential, and the next, while they fit.

   A reader who reads this line and nothing else should come away knowing what the terms say.

   The highlights carry the individual clauses; the summary is the picture they add up to. Compare:

   - Describes the document, and tells the reader nothing: "WizardSwap is a non-custodial cryptocurrency exchange FAQ outlining fee structures, exchange rate recalculations for delayed transactions, and policies regarding stolen funds."
   - Summarizes the terms: "WizardSwap can freeze and seize funds it judges to be stolen. Fees vary by coin and reach 10% on illiquid pairs. A failed trade is refunded minus the network fee."

   No promotional adjectives, and no aspirational phrasing like "ensures" or "is committed to".

3. **complexity**: `'low' | 'medium' | 'high'` for a non-technical reader.

4. **highlights**: items that materially affect a privacy-conscious user's decision. Topics: automated transaction scanning, fund blocking or rejection, refund policy and its KYC implications, data sharing, logging and retention, custody arrangements, censorship-resistance, jurisdictional risk, dispute clauses.

   **Hard rules**:
   - **Only what matters.** At most **6 highlights**. Go to 7 or 8 only when a clause about the reader's money or anonymity would otherwise be left out. Fewer is fine, and if nothing meets the bar beyond what `summary` and `kycLevel` already convey, return an empty list. Do not pad.
   - **Skip what the reader already assumes.** A term that is normal for this kind of service (a standard refund window, suspension after non-payment, blocks on sanctioned regions, a governing-law or arbitration clause) is not worth a highlight on its own. Being worth reporting does not make a clause negative: rate every clause you keep by the rules below.
   - **What to report first.** The reader is deciding whether to hand money to this service without identifying themselves. Choose by what they stand to lose, and where the count is tight drop from the bottom of this order, never the top:
     1. **Their money.** Funds frozen, seized, withheld, returned on the operator's terms, or an account closed while it holds a balance.
     2. **Their anonymity.** Identification demanded at any time, triggered by risk scoring, or required before a refund. A refund that requires KYC costs both at once and is always worth reporting.
     3. **Their data.** Disclosure to authorities or to third-party processors, what is recorded, and how long it is kept.
     4. **Who holds the funds** while the service has them.
     5. **Being shut out.** Blocked regions, bans on Tor, VPNs or proxies, and termination at the operator's discretion.
     6. **What recourse is left.** Governing law, arbitration, and time limits on bringing a claim.
     A clause that costs the reader money or anonymity outranks one that merely inconveniences them.
     This order decides what to report, not how to rate it: a clause about money can be neutral or positive. Report protections as well as risks: a clause that limits the operator's power in one of these areas, such as keys made on the reader's device or a service that never holds funds, ranks with the risks in that area.
   - **Decode marketing language.** If a feature is described in promotional terms (e.g. "ultra private mode", "military-grade encryption", "bank-level security"), describe what it concretely does in operational terms based on the document text. If the operational meaning is not stated in the document, omit the claim. Do not repeat the marketing label.
   - **A label the document contradicts is not a fact.** A service describing itself one way while reserving powers that contradict it is described by the powers, not the label. Check every self-description against what the operative clauses elsewhere in the corpus permit. Where they conflict, report what the clauses permit and quote one of them. Never emit the self-description as its own highlight, and never as a positive one. A document calling a service non-custodial while reserving the right to freeze user funds, move them to cold storage, or return deposits on its own schedule is describing custody. Holding a deposit while a swap runs, or sending back a failed one, is how every swap works and contradicts nothing.
   - **Evidence-grounded.** Each `highlight.content` must reflect a clause that exists in the provided corpus. Do not infer beyond what the text says. Do not assume.
   - **No duplication.** Do not include highlights that restate the summary, the kycLevel, or another highlight.
   - **No filler.** Skip clauses that are universal across services (standard liability disclaimers, generic copyright notices, "we may update these terms") unless they materially differ from the norm.
   - **Skip implications already encoded.** If `kycLevel` already conveys the KYC posture, do not add a highlight that just repeats it.
   - **Neutral phrasing.** Describe what the document says, not what it promises in spirit.
   - **Quote the clause.** `evidence` must be the sentence or clause from the corpus that the highlight rests on, copied verbatim and trimmed to at most 300 characters. Do not paraphrase it, do not stitch together fragments from different places. If you cannot quote a clause, drop the highlight.
   - **Attribute the source.** `sourceUrl` is the `===== PAGE: <url>` header the quoted clause appeared under.
   - **Rate by what the operator can do to the reader, not by how a clause sounds.** Judge each clause against what is normal for this kind of service (a VPS host, a swap, a VPN, an SMS service).
     - `rating` is exactly `negative`, `neutral` or `positive`. (`warning` is a severity for `warnings`, never a rating.)
     - `negative`: gives the operator power over the reader's money, identity or data beyond what is normal for this kind of service, or takes away recourse the reader would normally have. Examples: suspending or ending service at its sole discretion, "we do not provide refunds", logging IP addresses with no time limit, reporting users to authorities on its own initiative, a ban on VPNs or Tor, freezing funds on a risk flag, asking for ID or source of funds before releasing or refunding money.
     - `positive`: limits that power below the norm or protects the reader. Examples: you alone hold the keys (even though lost keys cannot be recovered), keys generated on your device, no logs, a refund without ID.
     - `neutral`: normal for this kind of service, mixed, or plain information. Examples for hosting: suspension after a short unpaid grace period, a refund window on the first purchase, suspension for a chargeback, deleting data after non-payment (good for privacy, bad for data loss), data readable on a running server. For any service: obeying binding court orders, governing law and venue, binding arbitration, a time limit on legal claims, blocking sanctioned or listed countries, prepaid credit that cannot be withdrawn, refunds decided case by case.
     - A clause where the reader carries their own risk is not a concern. Self-custody is positive.
   - **Pick one topic.** `verification` for identity checks and KYC, `fundBlocking` for freezing or rejecting transactions, `dataSharing` for disclosure to third parties or authorities, `logging` for what is recorded and for how long, `custody` for who holds funds or keys, `jurisdiction` for governing law and venue, `refunds` for refund and cancellation terms, `disputes` for arbitration and claim limits, `other` when none fit.
   - **Scope to the service under review.** A single operator may publish shared legal terms covering multiple distinct products. Exclude any clause whose text scopes it to a sibling product (a different product name, app, or domain than the service being reviewed). Include only clauses that apply to the service being reviewed or to the operator/account level (which transitively applies to the service). When in doubt, prefer exclusion over speculation. The `summary` must cover the terms as they apply to the service being reviewed, not to the whole product family.
