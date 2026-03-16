import { Badge } from '@/components/ui/badge'
import { NEWSLETTER_STATUSES, FEATURE_PAGE_STATUSES } from '@/lib/constants'
import type { NewsletterStatus, FeaturePageStatus } from '@/types'

export function NewsletterStatusBadge({ status }: { status: NewsletterStatus }) {
  const config = NEWSLETTER_STATUSES[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function FeaturePageStatusBadge({ status }: { status: FeaturePageStatus }) {
  const config = FEATURE_PAGE_STATUSES[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
