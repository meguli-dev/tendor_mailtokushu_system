import { SfaNav } from '@/components/sfa/sfa-nav'

export default function SfaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <SfaNav />
      {children}
    </div>
  )
}
