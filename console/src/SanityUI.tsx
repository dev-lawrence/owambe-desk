import {LayerProvider, PortalProvider, ThemeProvider} from '@sanity/ui'
import '@sanity/ui/styles.css'
import {ToastProvider} from '@sanity/ui/toast'
import {buildTheme} from '@sanity/ui/theme'
import type {ReactNode} from 'react'
import {createGlobalStyle} from 'styled-components'

const theme = buildTheme()

const GlobalStyle = createGlobalStyle`
  html, body { margin: 0; padding: 0; }
  body { font-variant-numeric: tabular-nums; }
`

export function SanityUI({children}: {children: ReactNode}) {
  return (
    <>
      <GlobalStyle />
      <ThemeProvider theme={theme}>
        <LayerProvider>
          <PortalProvider>
            <ToastProvider>{children}</ToastProvider>
          </PortalProvider>
        </LayerProvider>
      </ThemeProvider>
    </>
  )
}
