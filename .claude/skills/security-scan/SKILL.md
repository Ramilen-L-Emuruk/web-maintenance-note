---
name: security-scan
description: Claude Code の設定（.claude/ ディレクトリ）をセキュリティ脆弱性、設定ミス、インジェクションリスクについてスキャンする。AgentShield を使用して CLAUDE.md、settings.json、MCP サーバー、フック、エージェント定義を検査。
origin: ECC
---

# Security Scan スキル

[AgentShield](https://github.com/affaan-m/agentshield) を使用して Claude Code の設定をセキュリティ監査する。

## 起動タイミング

- 新しい Claude Code プロジェクトのセットアップ時
- `.claude/settings.json`、`CLAUDE.md`、MCP 設定の変更後
- 設定変更のコミット前
- 既存の Claude Code 設定があるリポジトリへのオンボーディング時
- 定期的なセキュリティ衛生チェック

## スキャン対象

| ファイル | チェック内容 |
|---------|-------------|
| `CLAUDE.md` | ハードコードされたシークレット、自動実行指示、プロンプトインジェクションパターン |
| `settings.json` | 過度に許可的な許可リスト、拒否リストの欠如、危険なバイパスフラグ |
| `mcp.json` | リスクのある MCP サーバー、ハードコードされた環境シークレット、npx サプライチェーンリスク |
| `hooks/` | 補間によるコマンドインジェクション、データ流出、サイレントエラー抑制 |
| `agents/*.md` | 無制限のツールアクセス、プロンプトインジェクション面、モデル仕様の欠如 |

## 前提条件

AgentShield がインストールされている必要がある:

```bash
# インストール確認
npx ecc-agentshield --version

# グローバルインストール（推奨）
npm install -g ecc-agentshield

# または npx で直接実行（インストール不要）
npx ecc-agentshield scan .
```

## 使用方法

### 基本スキャン

現在のプロジェクトの `.claude/` ディレクトリに対して実行:

```bash
# 現在のプロジェクトをスキャン
npx ecc-agentshield scan

# 特定のパスをスキャン
npx ecc-agentshield scan --path /path/to/.claude

# 最小重要度フィルター付きでスキャン
npx ecc-agentshield scan --min-severity medium
```

### 出力フォーマット

```bash
# ターミナル出力（デフォルト） — 色付きレポートとグレード
npx ecc-agentshield scan

# JSON — CI/CD 統合用
npx ecc-agentshield scan --format json

# Markdown — ドキュメント用
npx ecc-agentshield scan --format markdown

# HTML — 自己完結型ダークテーマレポート
npx ecc-agentshield scan --format html > security-report.html
```

### 自動修正

安全な修正を自動適用（自動修正可能とマークされたもののみ）:

```bash
npx ecc-agentshield scan --fix
```

実行内容:
- ハードコードされたシークレットを環境変数参照に置換
- ワイルドカード権限をスコープ付き代替に絞り込み
- 手動のみの提案は変更しない

### Opus 4.6 深層分析

より深い分析のための敵対的3エージェントパイプラインを実行:

```bash
# ANTHROPIC_API_KEY が必要
export ANTHROPIC_API_KEY=your-key
npx ecc-agentshield scan --opus --stream
```

実行内容:
1. **攻撃者（Red Team）** — 攻撃ベクトルを発見
2. **防御者（Blue Team）** — 堅牢化を推奨
3. **監査者（最終判定）** — 両方の視点を統合

### セキュア設定の初期化

新しいセキュアな `.claude/` 設定をゼロからスキャフォールド:

```bash
npx ecc-agentshield init
```

作成されるもの:
- スコープ付き権限と拒否リスト付きの `settings.json`
- セキュリティベストプラクティス付きの `CLAUDE.md`
- `mcp.json` プレースホルダー

### GitHub Action

CI パイプラインに追加:

```yaml
- uses: affaan-m/agentshield@v1
  with:
    path: '.'
    min-severity: 'medium'
    fail-on-findings: true
```

## 重要度レベル

| グレード | スコア | 意味 |
|---------|--------|------|
| A | 90-100 | セキュアな設定 |
| B | 75-89 | 軽微な問題 |
| C | 60-74 | 注意が必要 |
| D | 40-59 | 重大なリスク |
| F | 0-39 | 致命的な脆弱性 |

## 結果の解釈

### Critical（即座に修正）
- 設定ファイル内のハードコードされた API キーやトークン
- 許可リスト内の `Bash(*)`（無制限のシェルアクセス）
- `${file}` 補間によるフック内のコマンドインジェクション
- シェルを実行する MCP サーバー

### High（本番前に修正）
- CLAUDE.md 内の自動実行指示（プロンプトインジェクションベクトル）
- 権限内の拒否リストの欠如
- 不要な Bash アクセスを持つエージェント

### Medium（推奨）
- フック内のサイレントエラー抑制（`2>/dev/null`、`|| true`）
- PreToolUse セキュリティフックの欠如
- MCP サーバー設定内の `npx -y` 自動インストール

### Info（認識用）
- MCP サーバーの説明の欠如
- グッドプラクティスとして正しくフラグされた禁止的指示

## リンク

- **GitHub**: [github.com/affaan-m/agentshield](https://github.com/affaan-m/agentshield)
- **npm**: [npmjs.com/package/ecc-agentshield](https://www.npmjs.com/package/ecc-agentshield)
