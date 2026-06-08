---
name: continuous-learning-v2
description: フックによるセッション観測で、確信度スコア付きのアトミックな instinct を生成し、スキル/コマンド/エージェントへ進化させる学習システム。v2.1 でプロジェクトスコープの instinct に対応。
origin: ECC
version: 2.1.0
---

# 継続学習 v2.1 - Instinct ベースアーキテクチャ

Claude Code セッションをアトミックな「instinct」（確信度スコア付きの学習済み行動単位）として再利用可能な知識に変換する高度な学習システム。

**v2.1** では **プロジェクトスコープの instinct** を追加 — React のパターンは React プロジェクトに、Python の規約は Python プロジェクトに留まり、汎用的なパターン（「入力は常にバリデーションする」等）はグローバルに共有される。

## 起動条件

- Claude Code セッションからの自動学習を設定する場合
- フックによる instinct ベースの行動抽出を設定する場合
- 学習済み行動の確信度閾値を調整する場合
- instinct ライブラリのレビュー・エクスポート・インポートを行う場合
- instinct をスキル・コマンド・エージェントに進化させる場合
- プロジェクトスコープ vs グローバルの instinct を管理する場合
- instinct をプロジェクトからグローバルスコープに昇格させる場合

## v2.1 の新機能

| 機能 | v2.0 | v2.1 |
|------|------|------|
| ストレージ | グローバル (~/.claude/homunculus/) | プロジェクトスコープ (projects/<hash>/) |
| スコープ | 全 instinct がどこにでも適用 | プロジェクトスコープ + グローバル |
| 検出 | なし | git リモート URL / リポジトリパス |
| 昇格 | N/A | 2つ以上のプロジェクトで共通 → グローバルへ |
| コマンド | 4個 (status/evolve/export/import) | 6個 (+promote/projects) |
| クロスプロジェクト | 汚染リスクあり | デフォルトで隔離 |

## v2 の新機能（v1 との比較）

| 機能 | v1 | v2 |
|------|----|----|
| 観測 | Stop フック（セッション終了時） | PreToolUse/PostToolUse（100% 確実） |
| 分析 | メインコンテキスト | バックグラウンドエージェント（Haiku） |
| 粒度 | 完全なスキル | アトミックな「instinct」 |
| 確信度 | なし | 0.3〜0.9 の重み付き |
| 進化 | スキルに直接変換 | Instinct → クラスタ → スキル/コマンド/エージェント |
| 共有 | なし | Instinct のエクスポート/インポート |

## Instinct モデル

instinct は小さな学習済み行動:

```yaml
---
id: prefer-functional-style
trigger: "新しい関数を書くとき"
confidence: 0.7
domain: "code-style"
source: "session-observation"
scope: project
project_id: "a1b2c3d4e5f6"
project_name: "my-react-app"
---

# 関数型スタイルを優先

## アクション
適切な場合はクラスより関数型パターンを使用する。

## 根拠
- 関数型パターンの優先が5回観測された
- 2025-01-15 にユーザーがクラスベースを関数型に修正
```

**プロパティ:**
- **アトミック** — 1トリガー、1アクション
- **確信度付き** — 0.3 = 暫定的、0.9 = ほぼ確実
- **ドメインタグ** — code-style、testing、git、debugging、workflow 等
- **根拠付き** — どの観測から生成されたかを追跡
- **スコープ対応** — `project`（デフォルト）または `global`

## 動作の仕組み

```
セッションのアクティビティ（git リポジトリ内）
      |
      | フックがプロンプト + ツール使用をキャプチャ（100% 確実）
      | + プロジェクトコンテキストを検出（git リモート / リポジトリパス）
      v
+---------------------------------------------+
|  projects/<project-hash>/observations.jsonl  |
|  （プロンプト、ツール呼び出し、結果、プロジェクト）  |
+---------------------------------------------+
      |
      | オブザーバーエージェントが読み取り（バックグラウンド、Haiku）
      v
+---------------------------------------------+
|          パターン検出                          |
|   * ユーザーの修正 → instinct               |
|   * エラー解決 → instinct                   |
|   * 繰り返しワークフロー → instinct          |
|   * スコープ判断: project or global?         |
+---------------------------------------------+
      |
      | 作成/更新
      v
+---------------------------------------------+
|  projects/<project-hash>/instincts/personal/ |
|   * prefer-functional.yaml (0.7) [project]   |
|   * use-react-hooks.yaml (0.9) [project]     |
+---------------------------------------------+
|  instincts/personal/  (グローバル)            |
|   * always-validate-input.yaml (0.85) [global]|
|   * grep-before-edit.yaml (0.6) [global]     |
+---------------------------------------------+
      |
      | /evolve でクラスタリング + /promote
      v
+---------------------------------------------+
|  projects/<hash>/evolved/ (プロジェクトスコープ) |
|  evolved/ (グローバル)                         |
|   * commands/new-feature.md                    |
|   * skills/testing-workflow.md                 |
|   * agents/refactor-specialist.md              |
+---------------------------------------------+
```

## プロジェクト検出

システムが現在のプロジェクトを自動検出する:

1. **`CLAUDE_PROJECT_DIR` 環境変数**（最高優先度）
2. **`git remote get-url origin`** — ハッシュ化してポータブルなプロジェクト ID を生成（同じリポジトリなら別マシンでも同一 ID）
3. **`git rev-parse --show-toplevel`** — リポジトリパスによるフォールバック（マシン固有）
4. **グローバルフォールバック** — プロジェクトが検出されない場合、instinct はグローバルスコープに配置

各プロジェクトは12文字のハッシュ ID（例: `a1b2c3d4e5f6`）を持つ。`~/.claude/homunculus/projects.json` のレジストリファイルが ID と可読名をマッピングする。

## クイックスタート

### 1. 観測フックの有効化

`~/.claude/settings.json` に追加。

**プラグインとしてインストールした場合**（推奨）:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/hooks/observe.sh"
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/hooks/observe.sh"
      }]
    }]
  }
}
```

**手動で `~/.claude/skills` にインストールした場合**:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "~/.claude/skills/continuous-learning-v2/hooks/observe.sh"
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "~/.claude/skills/continuous-learning-v2/hooks/observe.sh"
      }]
    }]
  }
}
```

### 2. ディレクトリ構造の初期化

システムは初回使用時に自動的にディレクトリを作成するが、手動で作成することも可能:

```bash
# グローバルディレクトリ
mkdir -p ~/.claude/homunculus/{instincts/{personal,inherited},evolved/{agents,skills,commands},projects}

# プロジェクトディレクトリは git リポジトリ内でフックが初めて実行されたときに自動作成
```

### 3. Instinct コマンドの使用

```bash
/instinct-status     # 学習済み instinct の表示（プロジェクト + グローバル）
/evolve              # 関連する instinct をスキル/コマンドにクラスタリング
/instinct-export     # instinct をファイルにエクスポート
/instinct-import     # 他者の instinct をインポート
/promote             # プロジェクト instinct をグローバルスコープに昇格
/projects            # 既知のプロジェクトと instinct 数を一覧表示
```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `/instinct-status` | 全 instinct の表示（プロジェクトスコープ + グローバル）、確信度付き |
| `/evolve` | 関連する instinct をスキル/コマンドにクラスタリング、昇格候補を提案 |
| `/instinct-export` | instinct のエクスポート（スコープ/ドメインでフィルタ可能） |
| `/instinct-import <file>` | instinct のインポート（スコープ制御付き） |
| `/promote [id]` | プロジェクト instinct をグローバルスコープに昇格 |
| `/projects` | 既知のプロジェクトと instinct 数の一覧 |

## 設定

`config.json` を編集してバックグラウンドオブザーバーを制御:

```json
{
  "version": "2.1",
  "observer": {
    "enabled": false,
    "run_interval_minutes": 5,
    "min_observations_to_analyze": 20
  }
}
```

| キー | デフォルト | 説明 |
|------|-----------|------|
| `observer.enabled` | `false` | バックグラウンドオブザーバーエージェントの有効化 |
| `observer.run_interval_minutes` | `5` | オブザーバーが観測を分析する間隔（分） |
| `observer.min_observations_to_analyze` | `20` | 分析実行に必要な最小観測数 |

その他の動作（観測キャプチャ、instinct 閾値、プロジェクトスコーピング、昇格条件）は `instinct-cli.py` と `observe.sh` のコードデフォルトで設定される。

## ファイル構造

```
~/.claude/homunculus/
+-- identity.json           # ユーザープロファイル、技術レベル
+-- projects.json           # レジストリ: プロジェクトハッシュ → 名前/パス/リモート
+-- observations.jsonl      # グローバル観測（フォールバック）
+-- instincts/
|   +-- personal/           # グローバル自動学習 instinct
|   +-- inherited/          # グローバルインポート instinct
+-- evolved/
|   +-- agents/             # グローバル生成エージェント
|   +-- skills/             # グローバル生成スキル
|   +-- commands/           # グローバル生成コマンド
+-- projects/
    +-- a1b2c3d4e5f6/       # プロジェクトハッシュ（git リモート URL から生成）
    |   +-- project.json    # プロジェクト単位のメタデータミラー (id/名前/ルート/リモート)
    |   +-- observations.jsonl
    |   +-- observations.archive/
    |   +-- instincts/
    |   |   +-- personal/   # プロジェクト固有の自動学習
    |   |   +-- inherited/  # プロジェクト固有のインポート
    |   +-- evolved/
    |       +-- skills/
    |       +-- commands/
    |       +-- agents/
    +-- f6e5d4c3b2a1/       # 別のプロジェクト
        +-- ...
```

## スコープ判断ガイド

| パターン種別 | スコープ | 例 |
|-------------|---------|-----|
| 言語/フレームワーク規約 | **project** | 「React hooks を使用」「Django REST パターンに従う」 |
| ファイル構造の好み | **project** | 「テストは `__tests__`/ に配置」「コンポーネントは src/components/ に配置」 |
| コードスタイル | **project** | 「関数型スタイルを使用」「dataclass を優先」 |
| エラーハンドリング戦略 | **project** | 「Result 型でエラーを処理」 |
| セキュリティプラクティス | **global** | 「ユーザー入力をバリデーション」「SQL をサニタイズ」 |
| 一般的なベストプラクティス | **global** | 「テストファーストで書く」「常にエラーを処理」 |
| ツールワークフローの好み | **global** | 「Edit 前に Grep」「Write 前に Read」 |
| Git プラクティス | **global** | 「Conventional commits」「小さく焦点を絞ったコミット」 |

## Instinct の昇格（Project → Global）

同じ instinct が複数のプロジェクトで高い確信度で出現した場合、グローバルスコープへの昇格候補となる。

**自動昇格の条件:**
- 同じ instinct ID が2つ以上のプロジェクトに存在
- 平均確信度 >= 0.8

**昇格方法:**

```bash
# 特定の instinct を昇格
python3 instinct-cli.py promote prefer-explicit-errors

# 条件を満たす全 instinct を自動昇格
python3 instinct-cli.py promote

# 変更なしでプレビュー
python3 instinct-cli.py promote --dry-run
```

`/evolve` コマンドでも昇格候補が提案される。

## 確信度スコアリング

確信度は時間とともに変化する:

| スコア | 意味 | 動作 |
|-------|------|------|
| 0.3 | 暫定的 | 提案されるが強制されない |
| 0.5 | 中程度 | 関連する場面で適用 |
| 0.7 | 強い | 自動承認で適用 |
| 0.9 | ほぼ確実 | コア動作 |

**確信度が上昇するケース:**
- パターンが繰り返し観測された
- ユーザーが提案された行動を修正しなかった
- 他のソースからの類似 instinct と一致した

**確信度が低下するケース:**
- ユーザーが明示的に行動を修正した
- 長期間パターンが観測されなかった
- 矛盾する根拠が出現した

## なぜ観測にスキルではなくフックを使うのか？

> 「v1 はスキルによる観測に依存していた。スキルは確率的で、Claude の判断により 50〜80% の確率でしか発火しない。」

フックは **100% 確実** に、決定論的に発火する。これにより:
- すべてのツール呼び出しが観測される
- パターンの見落としがない
- 学習が包括的になる

## 後方互換性

v2.1 は v2.0 および v1 と完全互換:
- `~/.claude/homunculus/instincts/` の既存グローバル instinct はグローバル instinct として動作を継続
- v1 の `~/.claude/skills/learned/` の既存スキルも動作を継続
- Stop フックは引き続き実行可能（v2 にもデータを供給）
- 段階的移行: 両方を並行運用可能

## プライバシー

- 観測データはマシンの **ローカル** に保存
- プロジェクトスコープの instinct はプロジェクトごとに隔離
- エクスポートできるのは **instinct**（パターン）のみ — 生の観測データは不可
- 実際のコードや会話の内容は共有されない
- エクスポートと昇格はユーザーが制御

## 関連情報

- [ECC-Tools GitHub App](https://github.com/apps/ecc-tools) - リポジトリ履歴から instinct を生成
- Homunculus - v2 の instinct ベースアーキテクチャに影響を与えたコミュニティプロジェクト（アトミック観測、確信度スコアリング、instinct 進化パイプライン）
- [The Longform Guide](https://x.com/affaanmustafa/status/2014040193557471352) - 継続学習セクション

---

*Instinct ベースの学習: パターンを一つずつ、プロジェクトごとに Claude に教える。*
