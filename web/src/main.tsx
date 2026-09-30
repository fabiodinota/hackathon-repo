import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { liveAssistSource } from './data/liveAssistSource'
import './styles.css'
import './assist.css'
import './context.css'
import './notification.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App assistSource={liveAssistSource} />
  </StrictMode>,
)
