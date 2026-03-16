'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'

interface CopyButtonProps {
  text: string
  label?: string
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function CopyButton({ text, label = 'コピー', variant = 'outline', size = 'default' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant={variant} size={size} onClick={handleCopy}>
      {copied ? (
        <>
          <Check className="mr-1 h-4 w-4" />
          コピー済
        </>
      ) : (
        <>
          <Copy className="mr-1 h-4 w-4" />
          {label}
        </>
      )}
    </Button>
  )
}
