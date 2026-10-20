import type { ContactCategory } from '@prisma/client'

export const contactCategoryLabels: Record<ContactCategory, string> = {
  COMMENT_REPORT: 'Report a comment',
  ACCOUNT_VERIFICATION: 'Account verification',
  SERVICE_REPORT_URGENT: 'Urgent service report',
  BUG: 'Website bug',
  OTHER: 'Other',
}

// Color + icon for rendering a category as a BadgeSmall. Colors are BadgeSmall
// color names; icons match the category cards on the contact form.
export const contactCategoryBadges: Record<
  ContactCategory,
  { color: 'amber' | 'cyan' | 'red' | 'slate'; icon: string }
> = {
  COMMENT_REPORT: { color: 'amber', icon: 'ri:flag-line' },
  ACCOUNT_VERIFICATION: { color: 'cyan', icon: 'ri:verified-badge-line' },
  SERVICE_REPORT_URGENT: { color: 'red', icon: 'ri:alarm-warning-line' },
  BUG: { color: 'amber', icon: 'ri:bug-line' },
  OTHER: { color: 'slate', icon: 'ri:question-line' },
}
