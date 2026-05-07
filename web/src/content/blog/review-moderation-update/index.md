---
title: "Making reviews harder to game"
summary: "KYCnot.me user ratings now give more weight to useful, trusted reviews and less weight to throwaway accounts, spam, brigades, and affiliated accounts."
author: pluja
publishedAt: 2026-05-07T12:00:00Z
tags:
  - update
  - moderation
  - reviews
  - trust
draft: true
---

User feedback on KYCnot.me is important. Admin checks help, but users often see things first: frozen funds, surprise KYC, bad support, strange terms, good experiences too. That feedback is useful, and I want to keep it visible and useful.

The problem is obvious, as with any online review system: reviews are easy to abuse.

Creating an account on KYCnot.me takes almost no effort. That is intentional. I do not want email verification, phone numbers, or anything that turns a privacy site into another identity gate. But easy accounts have a cost and over time we have seen people create accounts to push a service, bury a complaint, attack a competitor, or win an argument in the comments.

For these reasons, we made some changes to how reviews and ratings work.

## What changed

User ratings are now trust weighted. A five star review from a long-time active user should not count the same as a five star review from an account created a few minutes ago with a single comment.

Reviews from established users count more. Verified reviews and reviews with approved private proof count more too. New accounts, low activity accounts, suspicious comments, and service-affiliated accounts have less influence. Some ratings, like spam comments, do not count at all.

The comment can still stay visible. That part matters. A weak or disabled rating does not always mean the comment is useless. Sometimes it means the claim is hard to verify. Sometimes the user is new. Sometimes the account is related to the service. Readers can still look at the comment and decide what to do with it.

The score should be harder to manipulate than the comment section.

## One user, one active rating

People can post more than one review for the same service. That is normal, since you might use a service again months later and have a different experience.

However, only one rating per user counts toward the score, the latest approved review is the one that counts. Older reviews can remain visible, but their star rating is disabled.

This keeps review history without letting one person stack five ratings on the same service.

## New account limits

New accounts can reply to other comments right away, but they need to wait before posting a new "root" review.

This is a small delay, currently 24 hours, but I may reduce or increase it in the future. It is not meant to punish real users. It is there because throwaway accounts were being used too easily and too often. If someone only wants to create an account, drop a rating, and disappear, waiting a bit makes that less useful.

Replies stay open because they are lower impact. A reply does not create a new service review or change the rating by itself.

## Private proof

Users can add an order ID or other short private proof when posting a review. Admins can see it, the public cannot.

For now this is still simple text. If the proof looks valid, the review gets more weight and a `verified customer` badge. If it does not, the comment can still be judged on its public content.

Approved proof does not make the review officially verified by KYCnot.me. It means the private proof was accepted for that comment.

## Moderation rules

Moderation now follows a simpler framework.

Comments should help other users understand the service. First-hand experiences are best. Questions, corrections, and useful replies are welcome.

We reject spam, doxxing, threats, illegal content, AI-generated text, unrelated content, and personal fights that do not help anyone.

"Fake review" is a loaded phrase, so here is what I mean by it. A review is fake, or at least not reliable enough to affect the score, when it looks like the user did not actually use the service, when the same story is posted by several new accounts, when it reads like advertising, when it attacks a competitor without details, or when the account is clearly related to the service and does not say so.

We cannot always prove intent. That is why moderation has two levels. If the comment is useless or abusive, we reject it. If the comment might still be useful but the rating is weak, unclear, affiliated, or easy to game, we can leave the comment visible and disable only the star rating.

Ratings have an extra rule: the star rating should reflect your own experience with the service. A rating may be disabled if the review is vague, not based on first-hand use, mostly about drama, posted from an affiliated account, or made to manipulate the score.

## Why this is better

The old system treated most accepted ratings too equally. That was too easy to game.

The new system keeps comments readable, keeps moderation transparent, and makes the final user rating less fragile. A single new account should not be able to move a score much. A handful of throwaway accounts should not decide whether a service looks safe.

This will not catch everything. Human moderation still matters. Users still need to read the comments and do their own research.

But the score is now less naive. That is the goal.
