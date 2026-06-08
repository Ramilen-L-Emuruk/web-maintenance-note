import { useRef, useState } from 'react'
import { useHeaderTitle } from '../components/Layout'
import { exportToFile, importFromJson } from '../utils/backup'
import { notificationPermission, requestNotificationPermission } from '../utils/notify'

export default function SettingsPage() {
  useHeaderTitle('設定')
  const fileRef = useRef<HTMLInputElement>(null)
  const [perm, setPerm] = useState(notificationPermission())
  const [busy, setBusy] = useState(false)

  async function handleImport(file: File, mode: 'replace' | 'merge') {
    setBusy(true)
    try {
      const text = await file.text()
      await importFromJson(text, mode)
      alert('インポートが完了しました。')
    } catch (e) {
      alert(`インポートに失敗しました: ${(e as Error).message}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function pickFile(mode: 'replace' | 'merge') {
    const input = fileRef.current
    if (!input) return
    input.onchange = () => {
      const f = input.files?.[0]
      if (f) handleImport(f, mode)
    }
    input.click()
  }

  async function handleRequestPerm() {
    const p = await requestNotificationPermission()
    setPerm(p)
  }

  return (
    <>
      <div className="card">
        <div className="card-title">データのバックアップ</div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          全データを JSON ファイルとして書き出し／読み込みできます。別の端末への引き継ぎに使ってください（画像も含まれます）。
        </p>
        <button className="btn btn-primary btn-block" onClick={() => exportToFile()} disabled={busy}>
          ⬇ エクスポート（バックアップ書き出し）
        </button>
        <div className="divider" />
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} />
        <div className="btn-row">
          <button className="btn btn-block" onClick={() => pickFile('merge')} disabled={busy}>
            ⬆ インポート（追加・統合）
          </button>
        </div>
        <button
          className="btn btn-danger btn-block"
          style={{ marginTop: 10 }}
          onClick={() => {
            if (confirm('現在のデータをすべて削除してから読み込みます。よろしいですか？')) pickFile('replace')
          }}
          disabled={busy}
        >
          ⬆ インポート（全置換）
        </button>
      </div>

      <div className="card">
        <div className="card-title">通知</div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          車検・保険の満了、部品の交換時期が近づくと通知します。
          {perm === 'unsupported'
            ? 'この環境では通知に対応していません。'
            : perm === 'granted'
              ? '通知は許可されています。'
              : '通知を有効にするには許可が必要です。'}
        </p>
        <p className="muted" style={{ fontSize: 12 }}>
          ※ iPhone/iPad ではホーム画面に追加した PWA としてのみ通知が動作します。サーバーを持たない構成のため、通知はアプリ起動時などのタイミングでまとめて表示されます。
        </p>
        {perm !== 'granted' && perm !== 'unsupported' && (
          <button className="btn btn-primary btn-block" onClick={handleRequestPerm}>
            🔔 通知を許可する
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-title">このアプリについて</div>
        <div className="list-item">
          <div className="main">
            <div className="title" style={{ fontWeight: 500 }}>
              バイク メンテナンスノート
            </div>
            <div className="sub muted">オフライン対応 PWA</div>
          </div>
          <div className="trailing">
            <div className="sub muted">バージョン</div>
            <div className="title" style={{ fontWeight: 600 }}>
              v{__APP_VERSION__}
            </div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>
          データは端末内（IndexedDB）にのみ保存され、外部送信はされません。
        </p>
      </div>
    </>
  )
}
