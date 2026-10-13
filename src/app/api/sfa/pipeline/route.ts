import { withMember } from '@/lib/sfa/api'
import { pipelineSummary } from '@/lib/sfa/service'

export async function GET() {
  return withMember(() => pipelineSummary())
}
