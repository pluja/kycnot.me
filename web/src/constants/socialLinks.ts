type SocialLink = {
  name: string
  handle: string
  href: string
  icon: string
}

export const socialLinks = [
  {
    name: 'Nostr',
    handle: 'kycnotme',
    href: 'https://primal.net/p/nprofile1qqsrnnzne83l04ycpvsmaf0tezjmnn0hlfjnjsctt2pxazk4yutgv4se2eygg',
    icon: 'nostr',
  },
  {
    name: 'Mastodon',
    handle: '@kycnotme@fosstodon.org',
    href: 'https://fosstodon.org/@kycnotme',
    icon: 'ri:mastodon-line',
  },
  {
    name: 'X',
    handle: '@kycnot',
    href: 'https://x.com/kycnot',
    icon: 'ri:twitter-x-line',
  },
  {
    name: 'Bitcointalk',
    handle: 'Forum profile',
    href: 'https://bitcointalk.org/index.php?action=profile;u=3571596',
    icon: 'bitcoin',
  },
] as const satisfies SocialLink[]
