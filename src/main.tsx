import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { seedIfEmpty } from './db/seed'
import './index.css'

// 初回起動時のマスタ投入
seedIfEmpty().catch((e) => console.error('seed failed', e))

// Service Worker 登録（PWA / オフライン / 通知）
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
