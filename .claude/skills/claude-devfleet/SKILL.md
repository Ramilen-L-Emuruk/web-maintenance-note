---
name: claude-devfleet
description: Claude DevFleet を介したマルチエージェントコーディングタスクのオーケストレーション — プロジェクト計画、分離されたワークツリーでの並列エージェント配置、進捗監視、構造化レポートの読み取り。
origin: community
---

# Claude DevFleet マルチエージェントオーケストレーション

## 使用タイミング

複数の Claude Code エージェントを並列でコーディングタスクに配置する必要がある場合に使用する。各エージェントは分離された git ワークツリーでフルツールを使って実行される。

実行中の Claude DevFleet インスタンスが MCP 経由で接続されている必要がある:
```bash
claude mcp add devfleet --transport http http://localhost:18801/mcp
```

## 仕組み

```
ユーザー → 「認証付きの REST API とテストを構築して」
  ↓
plan_project(prompt) → project_id + ミッション DAG
  ↓
ユーザーに計画を表示 → 承認を取得
  ↓
dispatch_mission(M1) → エージェント1がワークツリーで起動
  ↓
M1 完了 → 自動マージ → M2 を自動ディスパッチ（M1 に依存）
  ↓
M2 完了 → 自動マージ
  ↓
get_report(M2) → 変更ファイル、完了内容、エラー、次のステップ
  ↓
ユーザーに報告
```

### ツール一覧

| ツール | 用途 |
|------|------|
| `plan_project(prompt)` | AI が説明をチェーンされたミッションを持つプロジェクトに分解 |
| `create_project(name, path?, description?)` | 手動でプロジェクトを作成、`project_id` を返す |
| `create_mission(project_id, title, prompt, depends_on?, auto_dispatch?)` | ミッションを追加。`depends_on` はミッション ID 文字列のリスト。`auto_dispatch=true` で依存が満たされた時に自動開始 |
| `dispatch_mission(mission_id, model?, max_turns?)` | ミッション上でエージェントを開始 |
| `cancel_mission(mission_id)` | 実行中のエージェントを停止 |
| `wait_for_mission(mission_id, timeout_seconds?)` | ミッション完了までブロック（下記注意参照） |
| `get_mission_status(mission_id)` | ブロックせずにミッション進捗を確認 |
| `get_report(mission_id)` | 構造化レポートを読む（変更ファイル、テスト結果、エラー、次のステップ） |
| `get_dashboard()` | システム概要: 実行中のエージェント、統計、最近のアクティビティ |
| `list_projects()` | 全プロジェクトを一覧 |
| `list_missions(project_id, status?)` | プロジェクト内のミッションを一覧 |

> **`wait_for_mission` に関する注意:** `timeout_seconds`（デフォルト 600）までコンバセーションをブロックする。長時間実行のミッションでは、30〜60 秒ごとに `get_mission_status` でポーリングすることを推奨。ユーザーに進捗更新が表示される。

### ワークフロー: 計画 → 配置 → 監視 → 報告

1. **計画**: `plan_project(prompt="...")` を呼び出し → `project_id` + `depends_on` チェーンと `auto_dispatch=true` を持つミッション一覧を返す
2. **計画表示**: ミッションのタイトル、タイプ、依存チェーンをユーザーに提示
3. **配置**: ルートミッション（空の `depends_on`）に対して `dispatch_mission(mission_id=...)` を呼び出し。残りのミッションは依存完了時に自動ディスパッチ
4. **監視**: `get_mission_status(mission_id=...)` または `get_dashboard()` で進捗確認
5. **報告**: ミッション完了時に `get_report(mission_id=...)` を呼び出し。ハイライトをユーザーに共有

### 並行処理

DevFleet はデフォルトで最大3つの同時エージェントを実行（`DEVFLEET_MAX_AGENTS` で設定可能）。全スロットが埋まっている場合、`auto_dispatch=true` のミッションはミッションウォッチャーのキューに入り、スロットが空き次第自動ディスパッチされる。`get_dashboard()` で現在のスロット使用状況を確認。

## 使用例

### フルオート: 計画と起動

1. `plan_project(prompt="...")` → ミッションと依存関係付きの計画を表示
2. 最初のミッション（空の `depends_on`）をディスパッチ
3. 残りのミッションは依存解決時に自動ディスパッチ（`auto_dispatch=true`）
4. プロジェクト ID とミッション数をユーザーに報告
5. `get_mission_status` または `get_dashboard()` で定期的にポーリングし、全ミッションが終端状態に達するまで待つ
6. 各終端ミッションに対して `get_report(mission_id=...)` — 成功を要約し、エラーと次のステップを指摘

### 手動: ステップバイステップ制御

1. `create_project(name="My Project")` → `project_id` を返す
2. ルートミッションを作成、後続タスクを `depends_on` で連結
3. 最初のミッションを `dispatch_mission` でチェーン開始
4. 完了時に `get_report(mission_id=...)` で結果確認

### レビュー付きシーケンシャル

1. `create_project(name="...")` → `project_id` を取得
2. 実装ミッションを作成してディスパッチ、完了をポーリング
3. `get_report` で結果をレビュー
4. 依存ミッションとしてレビューミッションを作成 — 依存が完了済みのため自動開始

## ガイドライン

- ユーザーが「進めて」と言わない限り、ディスパッチ前に必ず計画を確認する
- ステータス報告時にはミッションタイトルと ID を含める
- ミッションが失敗した場合、リトライ前にレポートを読む
- バルクディスパッチ前に `get_dashboard()` でエージェントスロットの空きを確認
- ミッション依存は DAG を構成する — 循環依存を作成しない
- 各エージェントは分離された git ワークツリーで実行され、完了時に自動マージ。マージコンフリクト発生時はエージェントのワークツリーブランチに変更が残る
- 手動ミッション作成時、依存完了時の自動トリガーが必要な場合は必ず `auto_dispatch=true` を設定する
