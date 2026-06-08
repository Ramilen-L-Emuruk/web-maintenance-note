# バイク メンテナンスノート

バイクの **給油・メンテナンス・保険・車検** を記録できる、オフライン対応の PWA です。
データは端末内（IndexedDB）にのみ保存され、外部送信は一切ありません。別端末への引き継ぎは JSON のインポート/エクスポートで行います。

## 主な機能

- **バイク管理**: 複数台のバイクを登録・編集・アーカイブ
  - メーカーはコンボボックス（有名メーカーを初期登録済み、未登録名は自動登録）
  - 購入店舗もプルダウン選択 / 新規登録に対応
- **給油情報**: 給油記録、当月/全体の平均燃費（総走行距離 ÷ 総給油量）、燃費グラフ、1L あたりの単価、タイムライン表示
- **メンテナンス情報**: 大項目（エンジン・タイヤ等）→ 部品（エンジンオイル等）の階層。部品ごとに整備履歴を記録。推奨交換間隔（日数 / 距離）に基づくリマインド
- **保険情報**: 保険種別（自賠責・任意 等）ごとに契約と満了日を管理。満了が近いとリマインド
- **車検**: 車検満了日のリマインド
- **通知**: アプリ内リマインド表示に加え、OS 通知（要許可）。
  - ※ iPhone/iPad ではホーム画面に追加した PWA でのみ通知が動作します。サーバーレス構成のため、通知はアプリ起動時などにまとめて表示されます。
- **インポート / エクスポート**: 全データ（画像含む）を JSON でバックアップ・復元

## 技術スタック

- React 18 + TypeScript + Vite
- IndexedDB (Dexie) によるローカル永続化
- Recharts（燃費グラフ。`React.lazy` で遅延読み込みし、初期バンドルから分離）
- vite-plugin-pwa（Service Worker / オフライン / インストール対応）
- ルーティングは HashRouter、`base: './'` で GitHub Pages のサブパスに非依存

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # 本番ビルド (dist/)
npm run preview  # ビルド結果のプレビュー
```

## GitHub Pages へのデプロイ

1. このリポジトリを GitHub に push
2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定
3. `main` ブランチへ push すると `.github/workflows/deploy.yml` が自動でビルド & デプロイ

`base` は相対パスのため、リポジトリ名に依存せずそのまま動作します。

## データモデルについて

添付の ER 図（直訳・崩れた複数形）から、命名と正規化を整理しています。対応は [`src/types.ts`](src/types.ts) の先頭コメントを参照してください。主な変更:

| 元 | 変更後 |
| --- | --- |
| `*HistorysTable`（崩れた複数形） | `*Record`（`maintenanceRecords` 等） |
| `BikeInfosTable.CarBodyNumber` | `frameNumber`（車体番号） |
| `BikeInfosTable.EngineSize` | `displacement`（排気量 cc） |
| `BikeInfosTable.AutomobileInspectionCertificate` | `inspectionExpiryDate`（車検満了日） |
| `MaintenancePartsTable.InspectionInterval / InspectionRangeInterval` | `intervalDays / intervalDistance` |
| `RefuelHistorysTable.FillRefuel / FuelConsumptionCalculating` | `isFullTank / includeInFuelEconomy` |
| `InsurancesTable`（種別マスタ） | `insuranceTypes` |
| `InsurancesHistorysTable`（契約） | `insuranceRecords` |
