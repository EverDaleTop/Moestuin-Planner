import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fontawesome-subset.css'
import './fonts.css'
import './index.css'
import App from './App.tsx'
import { CustomScrollbars } from './CustomScrollbars.tsx'
import { LegalPage } from './LegalPage.tsx'
import { legalPageFromPath } from './legalRoutes.ts'

const legalPage = legalPageFromPath(window.location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {legalPage ? (
      <LegalPage page={legalPage} />
    ) : (
      <>
        <App />
        <CustomScrollbars />
      </>
    )}
  </StrictMode>,
)
