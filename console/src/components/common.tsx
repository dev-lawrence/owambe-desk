import {HugeiconsIcon, type IconSvgElement} from '@hugeicons/react'
import {Card, Flex, Spinner, Text} from '@sanity/ui'
import {type ReactNode, useEffect, useState} from 'react'

export function Icon({icon, size = 16}: {icon: IconSvgElement; size?: number}) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.6} />
}

/** Sanity UI buttons take an icon component; this adapts a Hugeicon. */
export function iconFor(icon: IconSvgElement) {
  function ButtonIcon() {
    return <HugeiconsIcon icon={icon} size="1em" strokeWidth={1.6} />
  }
  return ButtonIcon
}

/** The current time, refreshed on an interval, so drift and "x min ago" stay live without a reload. */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function Loading({label}: {label?: string}) {
  return (
    <Flex align="center" gap={3} padding={4}>
      <Spinner muted />
      {label ? (
        <Text muted size={1}>
          {label}
        </Text>
      ) : null}
    </Flex>
  )
}

export function Notice({tone = 'caution', children}: {tone?: 'caution' | 'critical' | 'positive' | 'primary'; children: ReactNode}) {
  return (
    <Card padding={3} radius={2} tone={tone} border>
      <Text size={1}>{children}</Text>
    </Card>
  )
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function ago(iso: string, now: Date): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}
