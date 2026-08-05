# iOS/iPadOS ネイティブアプリ移行 検討メモ

作成日: 2026-07-19
目的: 現行の Web版（React + TS + Vite PWA）を、iOS/iPadOS 向けのフルネイティブアプリ（SwiftUI）に移行するための検討記録。Mac 側で新規プロジェクトを開始する際の引き継ぎ資料。

**このドキュメントの位置づけ: 議論のみで実装はまだ行っていない。次のセッション（Mac側）で計画・実装に入る前提の土台。**

---

## 1. 移行の動機（なぜネイティブ化するか）

「ネイティブアプリという形」への憧れではなく、PWA では技術的に実現できない3つの機能が動機。

1. **バックグラウンドでの通知**: 現在の PWA は Web Notification API に依存しており、アプリを開いていない時に自動で通知を飛ばせない（サーバー無しでは不可能）。
2. **バックグラウンド GPS ロギング**: PWA の Geolocation API はページ破棄と同時に停止する。Google マップのタイムラインのような「常時ロギング」を実現したい。ツーリング中の走行ログを記録するのが主目的。
3. **Liquid Glass デザイン**: Apple 純正アプリのような本物の質感（`glassEffect` 等のネイティブ API）を求める。CSS での模倣では妥協できないと判断し、フルネイティブ書き直しを選択。

---

## 2. 決定事項サマリー

| 項目 | 結論 |
|---|---|
| アプリの形態 | SwiftUI によるフルネイティブアプリ（Capacitor 等のラップ方式ではない） |
| 対象OS | iOS + iPadOS（iPad は `NavigationSplitView` 等で正しく最適化する） |
| データ層 | SwiftData（Dexie/IndexedDB からの置き換え） |
| グラフ | Swift Charts（Recharts からの置き換え） |
| 通知 | UserNotifications framework でローカル通知を OS 予約。無料 Personal Team でも問題なく使用可 |
| GPS ロギング設計 | 下記「4. GPSロギングの設計」参照。常時ロギング・省電力優先 |
| デザイン | 本物の Liquid Glass（ネイティブ API）。CSS 模倣は不採用 |
| データ移行 | 既存の Web版インポート/エクスポート機能を使って SwiftData へ初期移行 |
| 配布方法 | AltStore Classic（無料 Apple ID、Mac + AltServer による週次自動再署名） |
| 同期方式 | iCloud/CloudKit ではなく **Cloudflare Workers + D1** で自前の同期APIを構築（下記「5. 同期方式」参照） |
| Web版の扱い | 完全移行し、Web版のメンテナンスは停止する |
| 開発環境 | **Mac 必須**。Xcode は macOS 専用のため Windows では開発不可 |

---

## 3. 配布方法: AltStore Classic

- ストア配布は考えていない（本人希望）。個人利用のみ。
- 無料 Apple ID + Xcode でのサイドロードは **7日ごとに証明書が失効**する制約がある（Apple の free tier 仕様）。
- **AltStore Classic**（AltServer をMacに常駐させ、同一Wi-Fi上で自動的に署名延長する仕組み）を採用すれば、手動でのXcode再ビルドなしに運用できる。
- 日本でも 2025年12月18日の「スマホソフトウェア競争促進法」施行により **AltStore PAL**（Apple公式の代替マーケットプレイス）が利用可能になったが、
  - iPad は対象外（iPhoneのみ）
  - 自作アプリの配布には結局 Apple Developer Program（$99/年）+ Notarization が必要
  - → 今回の要件（無料・iPad含む）には合わないため、**AltStore Classic（非公式・従来方式）を採用**。
- リスク: Apple の OS アップデートで一時的に動かなくなることが過去に何度かあった（数日〜数週間で復旧する実績はある）。

### 3.1 技術的な注意点
- **Bundle Identifier を一貫させること**。再ビルド・再インストールを繰り返す際にBundle IDがぶれると、SwiftDataのローカルデータが消えるリスクがある。
- 万一ローカルデータが消えても、Cloudflare 側に同期データがあれば復元できる（5章参照）。

---

## 4. GPSロギングの設計

「常時ロギング」かつ「最高精度は不要」という要件のため、Google マップのタイムラインに近いハイブリッド設計を採用する。

| 状態 | 使う仕組み | 精度 | 電池影響 |
|---|---|---|---|
| 静止中（大半の時間） | Significant-Change Location Service | 粗い（〜数百m、約500m移動 or セルタワー切替で発火） | ほぼゼロ |
| 移動検知後 | Core Motion（活動認識）→ 継続的な位置情報更新（`CLLocationManager`, `allowsBackgroundLocationUpdates`） | 中精度（`distanceFilter` で調整、`activityType = .automotiveNavigation` 推奨） | 移動中のみ発生 |

### 設計のポイント
- **Significant-Change Location Service** は `Background Modes`（location）Capability を使わずに動作し、アプリが完全終了していてもOSが再起動して呼び出してくれる特性がある。「常時ロギング」の土台として最適。
- 移動検知後に通常の継続更新へ切り替えることで、精度と電池のバランスを取る。停止を検知したら Significant-Change のみの待機モードへ戻す。
- `distanceFilter` は 10〜20m 程度が現実的な落としどころ（`kCLDistanceFilterNone` は精度最高だが電池を大きく消費する）。

### 未解決のリスク
- **無料 Personal Team で Background Modes（location）が安定動作するかは未検証**。フォーラム上で制限の報告があり、実機検証が必要。
- **長期ツーリング（7日以上）と AltStore Classic の再署名ルールが衝突する可能性**。証明書失効は基本的に「新規起動のブロック」であり、動作中のバックグラウンド処理を即座に止めるものではない可能性が高いが、確証はない。旅先でアプリを開けなくなるリスクは残る。
- 「常に許可」の位置情報権限は2段階の同意フロー（まず「使用中のみ」→ 後から「常に」への昇格）が必要。iOSが定期的に「バックグラウンドで位置情報を使用しています」という確認ダイアログを出すのは正常な仕様。

---

## 5. 同期方式: Cloudflare Workers + D1

- iCloud/CloudKit は SwiftData と統合が深く本来は第一候補だが、**無料 Personal Team では利用不可**（Push通知・iCloud・App Groups等は有料 Apple Developer Program 専用の entitlement）。
- 代替として **Cloudflare Workers（サーバーレス関数）+ D1（サーバーレスSQLite）** で自前の同期APIを構築する方針。
  - Apple の entitlement 制限と無関係のため、無料 Personal Team のままで実装可能。
  - Workers は TypeScript で書けるため、Web版で培った知見をそのまま活かせる。
  - 無料枠は個人利用なら十分（Workers: 1日10万リクエスト、D1: 個人のメンテ記録程度なら余裕）。
  - 認証はシンプルなトークン方式で十分（個人利用のため OAuth 等は過剰）。
  - 同期ロジックは「最終更新が勝つ」程度の単純な方式で十分（単一ユーザーの複数端末利用のため）。
- 副次的メリット: AltStore Classic の署名失効や端末側のデータ消失があっても、Cloudflare側のデータから復元できる（バックアップの役割も兼ねる）。

---

## 6. 開発環境: Mac 必須

- Xcode は **macOS 専用**。Windows/Linux 版は存在せず、ビルド・シミュレータ起動・コード署名は Mac 上でしか行えない。
- 本プロジェクトの検証方針（「型チェックだけでなく必ずアプリを起動して実行確認する」）を維持するなら、検証は Mac 上でしか成立しない。
- **SSH 経由（Windows から Mac にリモート接続して Claude Code を動かす）のデメリット**:
  - シミュレータの目視確認が困難（`simctl` でスクリーンショットは撮れるが、UXは劣化する）
  - コード署名時のキーチェーン確認プロンプトが非対話セッションで詰まることがある
  - Instruments（バッテリー・パフォーマンス計測）はGUI依存が強く、SSH越しでは実質使えない
  - **GPS・Core Motion はシミュレータで正しく検証できない**（実機が必要）。本プロジェクトの核心機能（GPSロギング）の検証には、どのみち実機をMacに接続する作業が必要になるため、SSHで得られる利便性は限定的
  - Macをスリープさせず、SSH（リモートログイン）を有効にしたまま維持する運用コストが発生
- **結論**: iOS開発セッションは Mac 側で完結させ、Web版の作業（今後は行わない想定）だけ Windows に残す、という住み分けが妥当。

---

## 7. 未解決事項（Mac側での実機検証・判断待ち）

### 7.1 無料 vs 有料（Apple Developer Program, $99/年）
以下3つの理由から、有料化も検討の余地がある。**Mac側で実機検証してから最終判断する**方針で保留中。

1. iCloud/CloudKit を使いたい場合は有料必須
2. 無料 Personal Team での Background Modes（GPS）の安定性が未検証
3. 長期ツーリング中（7日超）の AltStore Classic 署名失効リスク

有料化した場合のメリット: 上記3つが全て解消し、AltStore Classicの週次メンテナンスも不要になる（Ad-Hoc配布やTestFlightに切り替え可能）。Cloudflare同期は有料化後もそのまま使い続けて問題ない。

### 7.2 リポジトリ構成
- 現行の `web-maintenance-note` リポジトリに Xcode プロジェクトを同居させるか、別リポジトリとして切り出すか未決定。
- Web版は完全移行・メンテナンス終了の方針のため、**別リポジトリとして新規に立ち上げる**のが自然と思われるが、最終決定はMac側の作業開始時に行う。

### 7.3 CLAUDE.md の作り直し
- 現行の CLAUDE.md は npm/tsc/Vite/PowerShell 前提で書かれており、Swift/Xcode 用に全面的に書き直しが必要（ビルド確認コマンド、テスト方針、コミット規約等）。

---

## 8. 次のアクション（Mac側セッション開始時）

1. リポジトリ構成を決定（新規リポジトリ推奨）
2. `planner` エージェント or 計画モードで、以下のフェーズ分割を実装計画に落とし込む
   - データモデル（SwiftData）設計
   - 基本CRUD画面の実装
   - 燃費計算・グラフ（Swift Charts）
   - 通知機能（UserNotifications）
   - GPSロギング（Significant-Change + Core Motion のハイブリッド設計）
   - Cloudflare Workers + D1 の同期API構築
   - Liquid Glass デザインの磨き込み
   - AltStore Classic での配布設定
3. 実機での Background Modes 検証を早期に実施し、7.1 の無料/有料判断を確定させる
4. 既存 Web版のエクスポート機能でデータをバックアップし、SwiftData への移行パスを確認する
5. Swift/Xcode 向けの新しい CLAUDE.md を作成する
