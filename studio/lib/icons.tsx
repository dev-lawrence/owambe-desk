import {HugeiconsIcon, type IconSvgElement} from '@hugeicons/react'
import type {ComponentType} from 'react'

// Studio document icons use Hugeicons, the same icon set as the web app and console.
export function hugeicon(icon: IconSvgElement): ComponentType {
  function Icon() {
    return <HugeiconsIcon icon={icon} size="1em" strokeWidth={1.6} />
  }
  return Icon
}
