---
title: "Silent.link review: anonymous eSIM with crypto payments"
summary: "Hands-on review of Silent.link, an anonymous eSIM with pay-as-you-go pricing across 160+ countries and crypto-only payments via Bitcoin or Monero."
author: pluja
publishedAt: 2025-04-08T12:04:47Z
coverImage: ./cover.webp
tags:
  - review
  - sponsored
  - privacy
  - esim
draft: false
---

[Silent.link](/service/silent-link) is an anonymous eSIM provider. They offer pay-as-you-go roaming in 160+ countries.

### **Pros**

- Anonymous
- Private payment options
- High performance
- Global availability

### **Cons**

- Need to select the right networks sometimes
- Latency
- Data and incoming SMS & call only

### **Rating**

★★★★★

### **Service website**

<a href="https://silent.link/" rel="sponsored">Silent.link</a>

---

eSIMs replace traditional, physical SIM cards, if you have a fairly new phone, odds are it supports them. Since most people change their mobile carrier very rarely, the most common use case for these new eSIMs is their use in travel. Although their use as a piece of a larger OPSEC puzzle to improve privacy when using the internet from your phone is increasingly popular too.

Silent.link is not the only eSIM provider out there. Yet, they’re so unique that even Twitter’s (now X) founder Jack Dorsey [recommends them](https://x.com/jack/status/1830581891180699725).

Let’s start off with a quick explanation of how Silent.link works and what pay-as-you-go means. Most other eSIM providers will sell you packages of GBs with an expiration date. For instance imagine you’re visiting France then going to the UK after a few months. With other providers you might buy a 10GB in France package valid for 7 days, then after some months a 10GB in the UK package also valid for 7 days. You likely won’t use up the full package in either country and the remaining capacity will be voided as the package expires.

Silent.link’s pay-as-you-go is different. There are no geographic packages. There are no expiration dates. You simply have a balance denominated in USD and are charged as you use up the data according to the pricing of whichever local carrier you’re connecting via.

Preparing for the same trips from the example above you’d simply top-up your Silent.link balance with $10. Then you’d use Silent.link in France paying $1.33/GB, you’d only be charged for the exact amount used, then you’d go to the UK and pay $1.54/GB from the balance you had left over from France. It doesn’t matter how much time passes between the trips, because Silent.link balances don’t expire. If you have a balance left over you can use it on a future trip, or simply use it up in your home country.

---

## Pros

### Anonymity

Silent.link is anonymous. Most other eSIM providers require some form of identification. This can be a traditional, full KYC, procedure involving your ID or passport numbers or, as seemingly innocent, as verifying your phone number with your main carrier. Regardless, a link between the eSIM you bought online and your identity is established.

In some countries you’ll be able to pick up a traditional SIM (or the new eSIM) from a local carrier without undergoing this verification. This can still be a hassle though. You’ll need to look up the laws before travelling, you’ll need to find a local store selling them, you’ll need to decide how you’ll pay privately, etc. And that’s the best case, that’s assuming the country you want to get the SIM in allows you to buy one anonymously.

### Private payment methods

Silent.link only accepts cryptocurrency and according to their stats, most payments are made with Bitcoin (either onchain or using the Lightning Network) or with Monero. As such paying anonymously is not a problem. The use a self-hosted instance of BTCPay Server to process payments and operate their own LN node. The entire checkout process can be completed over Tor.

---

## Cons

### Network selection

Although you can skip the hassle of buying a new eSIM every time you travel it’s a good idea to look up the pricing of different mobile networks in the country you’re going to. The differences can be trivial, but can also be 100x. If a specific mobile network offers a much better deal, you’ll probably want to dive into your phone’s settings to make sure it only connects to that network.

### High prices for some regions

Second issue can be that, especially for poorer countries, Silent.link might not have the best prices. For instance if you travel to Angola you’ll end up paying $155.44/GB. But if you search around for other providers you’ll find eSIM that offer much lower prices for that same country.

### Data & incoming SMS & calls only

These eSIMs are either data-only or only offer data and inbound sms and calls. You can’t use Silent.link eSIMs to send texts or make phone calls.

### Latency

For most use-cases this shouldn’t matter, but the way roaming works is that when you’re abroad your data is first sent to your home country then sent out into the internet from there. For instance if you’re a Brit on holiday in Spain wherever you open up a website your phone communicates with the Spanish network who forwards the request to your home network in the UK and only there does the request start going towards the website you’re trying to load. The response takes the same path in reverse.

The home network for the Silent.link eSIMs is Poland. To take an extreme (antipodal) example, if you’re in Chile loading a Chilean website your request will go to Poland then back from Poland to the website’s server in Chile, then the response will go from Chile to Poland to you (in Chile). All those trips add latency. In our testing, done during the recent OrangeFren.com meetup in Istanbul, the difference was an additional 73ms. The bandwidth, however, was exceptional, easily surpassing 100 Mbps.

This latency issue isn’t unique to Silent.link, other eSIM providers usually suffer from it too, though their home network may be better suited for your latency needs. If you need the best latency we recommend a SIM from a local provider (or WiFi).

This proxy behaviour isn’t all negative however. It may potentially allow you to circumvent censorship or geoblocking if you’re trying to access resources available from Poland, but unavailable elsewhere.

Besides Istanbul one of the countries we also tested Silent.link in was Northern Cyprus. This territory is mostly unrecognized. It’s a country that, depending on who you ask, is or isn’t real. Despite this unresolved geopolitical status Silent.link performed without any issues.

---

## Installation

If you decide to give Silent.link a try, you'll need to select if you want a data-only plan or a plan with inbound SMS & calling, once you complete the payment simply scan the QR code on the order confirmation page with your phone.
**Make sure to save the url of that order confirmation page somewhere!** You will need it to top up your eSIM and check your remaining balance.

## Getting in touch

The preferred way of contacting Silent.link's support is using the website's built-in chat function. Alternative methods include X (formerly Twitter), Matrix and email.

Their support is online from 09:00 - 21:00 UTC although even when testing outside of those hours we got a reply within a minute.

> **NOTE**: These reviews are sponsored, yet the sponsorship does not influence the outcome of the evaluations. Sponsored reviews are independent from the kycnot.me list, being only part of the blog. The reviews have no impact on the scores of the listings or their continued presence on the list. Should any issues arise, I will not hesitate to remove any listing.

> Before paying any service in crypto, follow the [5 rules for safely using crypto services](/blog/stay-safe-using-services).
