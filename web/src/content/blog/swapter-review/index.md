---
title: "Swapter review: cheap and liquid, but watch for shotgun KYC"
summary: "Hands-on review of Swapter.io, an instant exchange with low fees and 1000+ coins, marred by shotgun KYC triggers and reliance on third-party liquidity."
author: pluja
publishedAt: 2024-05-21T12:04:47Z
tags:
  - review
  - sponsored
  - privacy
  - swap
coverImage: ./cover.webp
draft: false
---

> **Update, September 2026: Swapter is now flagged as a scam.** Since November 2025, Swapter has held large swaps for months without paying or refunding, including one of 700 XMR. For months Swapter told that user the exchange processing the deposit was delaying it, and that there was no ID problem. Later it asked for ID. Swapter now says the user has sent part of the requested information, but it declined to share the exchange's request, calling it confidential. We asked Swapter for proof in July. It only answered after we flagged it, and sent no proof. Do not use it. [See the evidence on the Swapter listing](/service/swapter#verification-proof).
>
> We are keeping this review online so the record stays public. It describes the service as we tested it in May 2024.

These reviews are sponsored, yet the sponsorship does not influence the outcome of the evaluations. Sponsored reviews are independent from the kycnot.me list, being only part of the blog. The reviews have no impact on the scores of the listings or their continued presence on the list. Should any issues arise, I will not hesitate to remove any listing. Reviews are in collaboration with [Orangefren](/service/orangefren).

## The review

[Swapter.io](/service/swapter) is an all-purpose instant exchange. They entered the scene in the depths of the bear market about 2 years ago in June of 2022.


| Pros            | Cons                               |
| --------------- | ---------------------------------- |
| Low fees        | Shotgun KYC with opaque triggers   |
| Large liquidity | Relies on 3rd party liquidity      |
| Works over Tor  | Front-end not synced with back-end |
| Pretty UI       |                                    |

**Rating**: ~~★★★☆☆~~ Withdrawn, see the update above.
**Service Website:** <a href="https://swapter.io" rel="sponsored">swapter.io</a>

### Test Trades

During our testing we performed a trade from XMR to LTC, and then back to XMR.

Our first trade had the ID of: `mpUitpGemhN8jjNAjQuo6EvQ`. We were promised **0.8 LTC** for sending **0.5 XMR**, before we sent the Monero. When the Monero arrived we were sent **0.799 LTC**.

On the return journey we performed trade with ID: `yaCRb5pYcRKAZcBqg0AzEGYg`. This time we were promised **0.4815 XMR** for sending **0.799 LTC**. After Litecoin arrived we were sent **0.4765 XMR**.

As such we saw a discrepancy of `~0.1%` in the first trade and `~1%` in the second trade. Considering those trades were floating we determine the estimates presented in the UI to be highly accurate and honest.

Of course Swapter could've been imposing a large fee on their estimates, but we checked their estimates against CoinGecko and found the difference to be equivalent to a fee of just over `0.5%`. Perfectly in line with other swapping services.

### Trading

Swapter supports BTC, LTC, XMR and well over a thousand other coins. Sadly they **don't support the Lightning Network**. For the myriad of currencies they deal with they provide massive upper limits. You could exchange tens, or even hundreds, of thousands of dollars worth of cryptocurrency in a single trade (although we wouldn't recommend it).

The flip side to this is that Swapter **relies on 3rd party liquidity**. Aside from the large liqudity this also benefits the user insofar as it allows for very low fees. However, it also comes with a negative - the 3rd party gets to see all your trades. Unfortunately Swapter opted not to share where they source their liquidity in their Privacy Policy or Terms of Service.

### KYC & AML policies

Swapter reserves the right to require its users to provide their full name, their date of birth, their address and government-issued ID. A practice known as "*shotgun KYC*". This should not happen often - in our testing it never did - however it's not clear when exactly it could happen. The AML & KYC policy provided on Swapter's website simply states they will put your trade on hold if their "risk scoring system [deems it] as suspicious".

Worse yet, if they determine that "any of the information [the] customer provided is incorrect, false, outdated, or incomplete" then Swapter may decide to terminate all of the services they provide to the user. What exactly would happen to their funds in such a case remains unclear.

The only clarity we get is that the Swapter policy outlines a designated 3rd party that will verify the information provided by the user. The third party's name is Sum & Substance Ltd, also simply known as samsub and available at [sumsub.com](https://sumsub.com/)

It's understandable that some exchanges will decide on a policy of this sort, especially when they rely on external liquidity, but we would prefer more clarity be given. **When exactly is a trade suspicious?**

### Tor

We were pleased to discover Swapter **works over Tor**. However, they do not provide a Tor mirror, nor do they work without JavaScript. Additionally, we found that some small features, such as the live chat, did not work over Tor. Fortunately, other means of contacting their support are still available.

### UI

We have found the Swapter UI to be very modern, straightforward and simple to use. It's available in 4 languages (English, French, Dutch and Russian), although we're unable to vouch for the quality of some of those, the ones that we used seemed perfectly serviceable.

Our only issue with the UI was that it claims the funds have been sent following the trade, when in reality it seems to take the backend a minute or so to actually broadcast the transaction.

### Getting in touch

Swapter's team has a chat on their website, a support email address and a support Telegram. Their social media presence in most active on Telegram and X (formerly Twitter).

### Disclaimer

*None of the above should be understood as investment or financial advice. The views are our own only and constitute a faithful representation of our experience in using and investigating this exchange. This review is not a guarantee of any kind on the services rendered by the exchange. Do your own research before using any service.*

> Swapter's shotgun KYC policy makes the [5 rules for safely using crypto services](/blog/stay-safe-using-services) especially relevant. For a swap with a stricter no-KYC stance, see our [WizardSwap review](/blog/wizardswap-review).
