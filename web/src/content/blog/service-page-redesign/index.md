---
title: 'Service pages redesign and other improvements'
summary: 'KYCnot.me service pages have been redesigned to show the important information first, show how the scores add up, and take their KYC notes from the terms.'
author: pluja
publishedAt: 2026-09-10T12:00:00Z
coverImage: ./cover.webp
tags:
  - update
  - kyc
draft: false
---

The service pages on [kycnot.me](/) have been redesigned. Not much information was added; most of what you see was already on the page or in the database. What changed is where it's placed and how it reads.

When you open a service you usually want to know two things: will they ask me for ID/KYC, and is there anything on record against them. Before, you had to work that out from a score, a row of badges and a long list of attributes. Now both answers are at the top, and the rest of the page is the evidence for them.

Open [Mullvad](/service/mullvad) or [Bisq](/service/bisq) (or any other service) to see it.

## More info on the header

The header of the service contains more information. How long have they been operating, where the company is located, user ratings score... All in a small row below the description.

## Two answers first

The first new card gives the **KYC policy** in one line, from "No KYC, guaranteed" to "KYC required", with the level badge next to it. Under it are the notes on what the terms say, and when it applies, or any extra information worth knowing. This card will get some more improvements in the near future.

The second card says whether there is **anything on record** against the service: some attribute that's worth having in mind, an open incident or a recent one that still counts, a warning that has not ended, a failed review check, or nothing. Each item links to its card further down, so you can read more about it and judge it yourself.

Neither card is derived from the score. They are built from the KYC level, the attributes, the incidents and the review checks. That is the main point of the redesign: you can read them without needing to trust just a number.

## The score shows its sums

The score section is now a ledger with three columns: negative, positive and neutral. As always, every service starts at 50 privacy and 50 trust, in the neutral column. Each attribute is a card with its points, each column has a subtotal, and the three subtotals add up to the scores. Privacy weighs 60% and trust 40% in the overall grade, the same as before.

Incidents now appear in the negative column as a card, with the trust points they cost. While an incident is open it costs the full penalty: 5 points for low severity, 12 for medium, 22 for high, 35 for critical. Once resolved, the penalty drops depending on the outcome (20% remains if funds were recovered, 30% if users were reimbursed, 50% for a partial or unknown outcome, 75% if funds were lost) and then fades to zero over 90 days for a low incident, up to 540 days for a critical one. The card shows the current number and the incident shows when it fades.

You may now see short notes to attributes for one service, for the cases where the shared description does not say enough. Notes are text only. They never touch the points.

## Terms of service

The terms summary moved up under the two cards, with the count of positive, neutral and negative points. The full section below keeps every highlight, and every highlight has a quote from the documents. If we cannot quote it, it is not published. The section ends with the date we last checked.

## Evidence and history

Below the scores: the review status, the checks we ran, and one timeline for events and incidents. Ongoing first, recent ones folded, older ones behind a fold. One date on the page says when we last reviewed the listing, and that same date is what the sitemap and the structured data carry.

## How the KYC notes are written

The notes under the KYC card come from the service's own documents. The scanner reads the terms, the privacy policy and the pages linked from them, and proposes a KYC level with its reasoning, a summary with quoted highlights, attribute changes with the clause that justifies each one, and the notes.

A person reviews every proposal before it is published.

## Smaller things

- Pages are lighter, and the structured data is cleaner.
- Referral links are marked as such. Links to evidence on other sites do not carry our endorsement.
- Headings, buttons and links were fixed for phones and screen readers.
- A link to a service with capital letters in it now redirects to the correct page instead of a 404.
- The repository moved from codeberg, since they no longer allow crypto-related projects, nor projects that use AI assistance for the code. For this, I am hosting my own Forgejo instance at [tig.cx](https://tig.cx)

Everything here is in the [source code](https://tig.cx/pluja/kycnotme). If a card or a number on a service page looks wrong, [report it](/about#suggestion-review-process).
