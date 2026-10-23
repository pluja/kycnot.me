export const editFeedbackGroups = [
  {
    label: 'Publishing',
    publishes: true,
    texts: [
      'Thanks, your edit is published.',
      'Published. Thanks for correcting it.',
      'Published. Thanks for keeping your comment up to date.',
    ],
  },
  {
    label: 'Rejecting',
    publishes: false,
    texts: [
      "What you picked (Positive, Neutral or mixed, or Negative) doesn't match what you wrote. Pick the one that fits and edit again.",
      'Please add what happened since as an update, instead of rewriting the original comment.',
      'The edit removes details other readers rely on. Keep the original details and add to them.',
      "The edit adds promotion or links that aren't part of your experience. Remove them and edit again.",
      "The edit doesn't say what changed. Describe what happened, for example the support reply or the outcome.",
    ],
  },
] as const
