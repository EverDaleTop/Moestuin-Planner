import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fontawesome-subset.css'
import './fonts.css'
import './index.css'
import App from './App.tsx'
import { CustomScrollbars } from './CustomScrollbars.tsx'
import { LegalPage } from './LegalPage.tsx'
import { OfflineBanner } from './OfflineBanner.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { legalPageFromPath } from './legalRoutes.ts'

// PWA: app-shell offline beschikbaar. Alleen in productie registreren, zodat
// de dev-server nooit oude bestanden uit de cache serveert.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // offline-ondersteuning is een extraatje; nooit de app blokkeren
    })
  })
}

const legalPage = legalPageFromPath(window.location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {legalPage ? (
      <LegalPage page={legalPage} />
    ) : (
      <>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <CustomScrollbars />
        <OfflineBanner />
      </>
    )}
  </StrictMode>,
)
