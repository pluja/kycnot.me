---
title: 'Compare no-KYC crypto swap rates on KYCnot.me'
summary: 'A new swap page on KYCnot.me lets you compare live rates across no-KYC crypto exchanges side by side, with the KYC level, score, policies, and reputation context already on the site.'
author: pluja
publishedAt: 2026-04-25T12:00:00Z
coverImage: ./cover.webp
tags:
  - update
  - feature
  - swap
draft: false
---

A lot of you have asked for this, and it makes sense: when you're picking a no-KYC exchange, the rate still matters.

KYCnot.me already collects the context that matters around services: **KYC level, score, policies, ToS highlights, ratings, and verification history.** Adding a rate comparison page on top of that felt like the natural next step. It's just another way to explore the listings.

The swap comparison page is now **[live at kycnot.me/swap](https://kycnot.me/swap)**.

It's launching in **beta**, and I'll keep improving it based on how people use it.

## How it works

For the aggregation layer, we partnered with **[OrangeFren](https://orangefren.com)**. They've been in this space for years, and plugging into their infrastructure made more sense than trying to turn KYCnot.me into a full-time aggregator project.

OrangeFren provides the live rate data. KYCnot.me adds the trust context that already exists on the site.

## Why add this now?

The line between **directories, aggregators, reviews, and comparison tools** keeps getting blurrier, and users expect these things to work together.

I still want KYCnot.me focused on what it does best: **[the directory](/)**. So rather than building and maintaining dozens of provider integrations myself, I partnered to build this as a feature on top of the existing site.

## What's next

The swap page is live and running. From here, expect improvements. If you spot something off or want to request a feature, [send feedback here](https://cryptpad.fr/form/#/2/form/view/HbIG5b9s0P1-+CCmkgVpnRX6vuV2uDMYNbswRQ8Ch-M/).

## Transparency

The comparison feature is powered by a partnership with **OrangeFren**, limited strictly to the swap page. The rest of KYCnot.me works exactly as it always has. As always, the code is [open source](https://codeberg.org/pluja/kycnotme).
