---
name: continuous-learning
description: Claude Code セッションから再利用可能なパターンを自動抽出し、学習済みスキルとして保存する。
origin: ECC
---

# 継続学習スキル

> **[DEPRECATED]** v2 へ移行済み。新規利用は `/continuous-learning-v2` を使用。

Claude Code セッション終了時に自動評価を行い、再利用可能なパターンを学習済みスキルとして保存する。

## 起動条件

- Claude Code セッションからの自動パターン抽出を設定する場合
- セッション評価用の Stop フックを設定する場合
- `~/.claude/skills/learned/` の学習済みスキルをレビュー・整理する場合
- 抽出閾値やパターンカテゴリを調整する場合
- v1（本スキル）と v2（instinct ベース）を比較する場合

## ステータス

本 v1 スキルは引き続きサポートされるが、新規導入には `continuous-learning-v2` が推奨。
v1 を維持すべきケース: シンプルな Stop フック方式の抽出フローが必要な場合、または旧来の学習済みスキルワークフローとの互換性が必要な場合。

## 動作の仕組み

本スキルはセッション終了時に **Stop フック** として実行される:

1. **セッション評価**: セッションが十分な長さ（デフォルト: 10メッセージ以上）か判定
2. **パターン検出**: 抽出可能なパターンを特定
3. **スキル抽出**: 有用なパターンを `~/.claude/skills/learned/` に保存

## 設定

`config.json` を編集してカスタマイズ:

```json
{
  "min_session_length": 10,
  "extraction_threshold": "medium",
  "auto_approve": false,
  "learned_skills_path": "~/.claude/skills/learned/",
  "patterns_to_detect": [
    "error_resolution",
    "user_corrections",
    "workarounds",
    "debugging_techniques",
    "project_specific"
  ],
  "ignore_patterns": [
    "simple_typos",
    "one_time_fixes",
    "external_api_issues"
  ]
}
```

## パターン種別

| パターン | 説明 |
|---------|------|
| `error_resolution` | 特定エラーの解決方法 |
| `user_corrections` | ユーザーからの修正指示に基づくパターン |
| `workarounds` | フレームワーク・ライブラリの癖に対する回避策 |
| `debugging_techniques` | 効果的なデバッグ手法 |
| `project_specific` | プロジェクト固有の規約 |

## フック設定

`~/.claude/settings.json` に追加:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "~/.claude/skills/continuous-learning/evaluate-session.sh"
      }]
    }]
  }
}
```

## なぜ Stop フックか？

- **軽量**: セッション終了時に1回だけ実行
- **ノンブロッキング**: メッセージごとの遅延が発生しない
- **完全なコンテキスト**: セッション全体のトランスクリプトにアクセス可能

## 関連情報

- [The Longform Guide](https://x.com/affaanmustafa/status/2014040193557471352) - 継続学習のセクション
- `/learn` コマンド - セッション途中での手動パターン抽出

---

## 比較メモ（調査: 2025年1月）

### vs Homunculus

Homunculus v2 はより洗練されたアプローチを採用:

| 機能 | 本アプローチ | Homunculus v2 |
|------|------------|---------------|
| 観測 | Stop フック（セッション終了時） | PreToolUse/PostToolUse フック（100% 確実） |
| 分析 | メインコンテキスト | バックグラウンドエージェント（Haiku） |
| 粒度 | 完全なスキル | アトミックな「instinct」 |
| 確信度 | なし | 0.3〜0.9 の重み付き |
| 進化 | スキルに直接変換 | Instinct → クラスタ → スキル/コマンド/エージェント |
| 共有 | なし | Instinct のエクスポート/インポート |

**Homunculus からの重要な知見:**
> 「v1 はスキルによる観測に依存していた。スキルは確率的で、Claude の判断により 50〜80% の確率でしか発火しない。v2 はフックによる観測（100% 確実）と instinct を学習行動の最小単位として使用する。」

### v2 への潜在的な強化

1. **Instinct ベースの学習** - 確信度スコアリング付きの小さなアトミックな行動
2. **バックグラウンドオブザーバー** - 並列で分析する Haiku エージェント
3. **確信度の減衰** - 矛盾があれば instinct の確信度が低下
4. **ドメインタグ** - code-style、testing、git、debugging 等
5. **進化パス** - 関連する instinct をスキル/コマンドにクラスタリング

詳細: `docs/continuous-learning-v2-spec.md`
