// dailySortSeed keeps the listing shuffle stable for a whole UTC day, so page
// links need no seed and every visitor and crawler shares one cached copy per page.
export const dailySortSeed = (now = new Date()) => now.toISOString().slice(0, 10)
