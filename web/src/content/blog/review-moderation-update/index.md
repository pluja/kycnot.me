---
title: 'Making reviews harder to game'
summary: 'KYCnot.me user ratings now give more weight to useful, trusted reviews and less weight to throwaway accounts, spam, brigades, and affiliated accounts.'
author: pluja
publishedAt: 2026-05-07T12:00:00Z
coverImage: ./cover.webp
tags:
  - update
  - moderation
  - reviews
  - trust
draft: false
---

User feedback on KYCnot.me is important. Admin checks help, but users often see things first: frozen funds, surprise KYC, bad support, strange terms, good experiences too. That feedback is useful, and I want to keep it visible.

As with any online review system, reviews are easy to abuse. Review sites are gamed all the time. Fake praise, fake complaints, brigades, angry customers, paid comments, competitor attacks, and service owners defending themselves all get mixed together.

That makes reviews hard to handle fairly. Users should be able to warn others, and services should not be damaged by throwaway accounts or vague claims. That's not easy or perfectly solvable, even more so with anonymous accounts.

Creating an account on KYCnot.me takes almost no effort. That is intentional. We don't want email verification, phone numbers, or anything that turns a privacy site into another identity gate. But easy accounts have a cost. Over time we have seen people create accounts only to push a service, bury a complaint, attack a competitor, or win an argument in the comments.

So we made some changes to how reviews and ratings work.

## What changed

User ratings are now **trust weighted**. We think a five star review from a long-time active user should not count the same as a five star review from an account created a few minutes ago with a single comment.

Reviews from established users will now count more. Verified reviews and reviews with approved proof of usage count more too. New accounts, low activity accounts, suspicious comments, and service-affiliated accounts have less influence. Some ratings, like spam comments, do not count at all.

A weak or disabled rating does not always mean the comment is useless. Sometimes it means the claim is hard to verify, sometimes the user is new, sometimes the account is related to the service. Readers can still look at the comment and decide what to do with it. Each review shows its rating weight next to the stars.

The user rating should be harder to manipulate than the comment section. **User scores do not affect the main service score**. The main score still comes from KYCnot.me service attributes and checks, because user reviews are useful context, but they are too easy to game to affect the service score.

## One user, one active rating

People can post more than one review for the same service. That is normal, since you might use a service again months later and have a different experience.

**Only one rating per user counts toward the score**. The latest approved review is the one that counts. Older reviews remain visible, but their star rating is disabled.

The comment section also has better sorting now. Newest remains the default. You can also sort by Upvoted, Lowest, Highest, or Trusted. Upvoted appears only when comments have upvotes. Trusted sorts by review trust weight.

User badges now add simple context too. New account means the account was created recently. Single review means the user has only made that comment. Active user and Trusted user are based on account activity.

## New account limits

New accounts can reply to other comments right away, but they need to wait before posting a new review review. For urgent reports, you should [contact directly](/about#contact).

This is a small delay, currently 24 hours, but I may reduce or increase it in the future. It is not meant to punish real users. It is there because throwaway accounts were being used too easily and too often. If someone only wants to create many accounts, to drop ratings, and disappear, they will need to wait 24 hours, which is enough friction to stop most users who want to manipulate the score.

Replies stay open because they are lower impact. A reply does not create a new service review or change the rating by itself.

## Private proof

Users can add an order ID or other short text-based private proof when posting a review. Admins can see it, the public cannot.

For now this is still simple text. If the proof looks valid, the review gets more weight and a `Verified customer` badge. If it does not, the comment can still be judged on its public content.

Approved proof does not make the review officially verified by KYCnot.me. It means the private proof was accepted for that comment.

## Moderation rules

Comments should help other users understand the service. First-hand experiences are best. Questions, corrections, and useful replies are welcome.

We reject spam, fake reviews, doxxing, threats, illegal content, clear AI-generated text, unrelated content, and personal fights that do not help anyone.

A fake review is not always easy to prove, so here is what I mean by it. We consider a review is fake, or at least not reliable enough to affect the score, when it looks like the user did not actually use the service, when the same story is posted by several new accounts, when it reads like advertising, when it attacks a competitor without details, or when the account is clearly related to the service and does not say so.

We cannot always prove intent. That is why moderation has two levels. If the comment is useless or abusive, we reject it. If the comment might still be useful but the rating is weak, unclear, affiliated, or easy to game, we can leave the comment visible and disable only the star rating.

Ratings have an extra rule: the star rating should reflect your own experience with the service. A rating may be disabled if the review is vague, not based on first-hand use, mostly about drama, posted from an affiliated account, or made to manipulate the score.

## Why this is better

The old system treated all accepted ratings too equally. That was too easy to game.

The new system keeps comments readable, keeps moderation transparent, and makes the final user rating less fragile. A single new account should not be able to move a score much. A handful of throwaway accounts should not decide whether a service looks safe.

This is also why the user rating is separate from the main service score. Reviews can reveal real problems fast, but they are also the easiest part of the site to manipulate. They should inform readers, not quietly rewrite the service score.

Also, we hope this new rules encourage users to keep their accounts and contribute to the community with useful reviews. Creating fresh accounts to add a single comment is now not very useful.

This will not catch everything. Human moderation still matters. Users still need to read the comments and do their own research. But the score is now less naive. That is the goal.

These rules apply from now on. Older reviews will stay as they are unless a moderator reviews them later.
