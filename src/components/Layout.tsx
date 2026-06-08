import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface HeaderState {
  title: string
  setTitle: (t: string) => void
}

const HeaderContext = createContext<HeaderState>({ title: '', setTitle: () => {} })

/** ページからヘッダータイトルを設定する。 */
export function useHeaderTitle(title: string) {
  const { setTitle } = useContext(HeaderContext)
  useEffect(() => {
    setTitle(title)
  }, [title, setTitle])
}

export default function Layout({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState('メンテナンスノート')
  const location = useLocation()
  const navigate = useNavigate()
  const isRoot = location.pathname === '/'

  return (
    <HeaderContext.Provider value={{ title, setTitle }}>
      <header className="app-header">
        <div className="app-header-inner">
          {!isRoot ? (
            <button className="back-btn" aria-label="戻る" onClick={() => navigate(-1)}>
              ‹
            </button>
          ) : (
            <span style={{ width: 8 }} />
          )}
          <h1>{title}</h1>
          <button className="icon-btn" aria-label="設定" onClick={() => navigate('/settings')}>
            ⚙
          </button>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </HeaderContext.Provider>
  )
}
