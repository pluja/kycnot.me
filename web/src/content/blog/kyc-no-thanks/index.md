---
title: "KYC? No, thanks: how identity verification harms privacy"
summary: "KYC was sold as a way to stop criminals. In practice it excludes the unbanked, leaks personal data on dark web markets, and surveils everyone else."
author: pluja
publishedAt: 2023-09-28T12:04:47Z
coverImage: ./cover.webp
tags:
  - privacy
  - cypherpunk
  - surveillance
  - kyc
draft: false
---


Know Your Customer is a regulation that requires companies of all sizes to verify the identity, suitability, and risks involved with maintaining a business relationship with a customer. Such procedures fit within the broader scope of anti-money laundering (AML) and counterterrorism financing (CTF) regulations.

Banks, exchanges, online business, mail providers, domain registrars... Everyone wants to know who you are before you can even opt for their service. Your personal information is flowing around the internet in the hands of "god-knows-who" and secured by "trust-me-bro military-grade encryption". Once your account is linked to your personal (and verified) identity, tracking you is just as easy as keeping logs on all these platforms.


## Rights for Illusions

KYC processes aim to combat terrorist financing, money laundering, and other illicit activities. On the surface, KYC seems like a commendable initiative. I mean, who wouldn't want to halt terrorists and criminals in their tracks?

The logic behind KYC is: "If we mandate every financial service provider to identify their users, it becomes easier to pinpoint and apprehend the malicious actors."

However, terrorists and criminals are not precisely lining up to be identified. They're crafty. They may adopt false identities or find alternative strategies to continue their operations. Far from being outwitted, many times they're several steps ahead of regulations. Realistically, KYC might deter a small fraction, perhaps 1% of these malefactors. Yet, the cost? All of us are saddled with the inconvenient process of identification just to use a service.

Under the rhetoric of "ensuring our safety", governments and institutions enact regulations that seem more out of a dystopian novel, gradually taking away our right to privacy.

To illustrate, consider a city where the mayor has rolled out facial recognition cameras in every nook and cranny. A band of criminals, intent on robbing a local store, rolls in with a stolen car, their faces obscured by masks and their bodies cloaked in all-black clothes. Once they've committed the crime and exited the city's boundaries, they switch vehicles and clothes out of the cameras' watchful eyes. The high-tech surveillance? It didn’t manage to identify or trace them. Yet, for every law-abiding citizen who merely wants to drive through the city or do some shopping, their movements and identities are constantly logged. The irony? This invasive tracking impacts all of us, just to catch the 1% of less-than-careful criminals.

## KYC? Not you.

> KYC creates barriers to participation in normal economic activity, to supposedly stop criminals. [^2]

KYC puts barriers between many users and businesses. One of these comes from the fact that the process often requires multiple forms of identification, proof of address, and sometimes even financial records. For individuals in areas with poor record-keeping, non-recognized legal documents, or those who are unbanked, homeless or transient, obtaining these documents can be challenging, if not impossible.

For people who are not skilled with technology or just don't have access to it, there's also a barrier since KYC procedures are mostly online, leaving them inadvertently excluded.

Another barrier goes for the casual or one-time user, where they might not see the value in undergoing a rigorous KYC process, and these requirements can deter them from using the service altogether.

It also wipes some businesses out of the equation, since for smaller businesses, the costs associated with complying with KYC norms (from the actual process of gathering and submitting documents to potential delays in operations) can be prohibitive in economical and/or technical terms.

## You're not welcome

Imagine a swanky new club in town with a strict "members only" sign. You hear the music, you see the lights, and you want in. You step up, ready to join, but suddenly there's a long list of criteria you must meet. After some time, you are finally checking all the boxes. But then the club rejects your membership with no clear reason why. You just weren't accepted. Frustrating, right?

This club scenario isn't too different from the fact that KYC is being used by many businesses as a convenient gatekeeping tool. A perfect excuse based on a "legal" procedure they are obliged to.

Even some exchanges may randomly use this to freeze and block funds from users, claiming these were "flagged" by a cryptic system that inspects the transactions. You are left hostage to their arbitrary decision to let you successfully pass the KYC procedure. If you choose to sidestep their invasive process, they might just hold onto your funds indefinitely.

## Your identity has been stolen

KYC data has been found to be for sale on many dark net markets[^3]. Exchanges may have leaks or hacks, and such leaks contain **very** sensitive data. We're talking about the full monty: passport or ID scans, proof of address, and even those awkward selfies where you're holding up your ID next to your face. All this data is being left to the mercy of the (mostly) "trust-me-bro" security systems of such companies. Quite scary, isn't it?

As cheap as $10 for 100 documents, with discounts applying for those who buy in bulk, the personal identities of innocent users who passed KYC procedures are for sale. [^3]

In short, if you have ever passed the KYC/AML process of a crypto exchange, your privacy is at risk of being compromised, or it might even have already been compromised.

## (they) Know Your Coins

You may already know that **Bitcoin and most cryptocurrencies have a transparent public blockchain**, meaning that all data is shown unencrypted for everyone to see and recorded **forever**. If you link an address you own to your identity through KYC, for example, by sending an amount from a KYC exchange to it, your Bitcoin is no longer pseudonymous and can then be traced.

If, for instance, you send Bitcoin from such an identified address to another KYC'ed address (say, from a friend), everyone having access to that address-identity link information (exchanges, governments, hackers, etc.) will be able to associate that transaction and know who you are transacting with.

## Conclusions

To sum up, **KYC does not protect individuals**; rather, it's a threat to our privacy, freedom, security and integrity. Sensible information flowing through the internet is thrown into chaos by dubious security measures. It puts borders between many potential customers and businesses, and it helps governments and companies track innocent users. That's the chaos KYC has stirred.

The criminals are using stolen identities from companies that gathered them thanks to these very same regulations that were supposed to combat them. Criminals always know how to circumvent such regulations. In the end, normal people are the most affected by these policies.

The threat that KYC poses to individuals in terms of privacy, security and freedom is not to be neglected. And if we don’t start challenging these systems and questioning their efficacy, we are just one step closer to the dystopian future that is now foreseeable.

> KYCnot.me is the practical answer to this critique. See [why this site exists](/blog/four-years), and if you choose to use crypto services, follow the [5 rules to avoid scams and frozen funds](/blog/stay-safe-using-services).

> Edited 20/03/2024
> * Add reference to the 1% statement on [Rights for Illusions](#rights-for-illusions) section to an article where Chainalysis found that only 0.34%!o(MISSING)f the transaction volume with cryptocurrencies in 2023 was attributable to criminal activity [^1]


[^1]: https://www.chainalysis.com/blog/2024-crypto-crime-report-introduction/
[^2]: https://old.reddit.com/r/BitcoinBeginners/comments/k2bve1/is_kyc_bad_if_so_why/gdtc8kz
[^3]: https://www.ccn.com/hacked-customer-data-from-world-leading-cryptocurrency-exchanges-for-sale-on-the-dark-web/
