---
name: iterative-retrieval
description: サブエージェントのコンテキスト問題を解決するための段階的コンテキスト取得パターン。
origin: ECC
---

# 反復的取得パターン

マルチエージェントワークフローにおける「コンテキスト問題」を解決する。サブエージェントは作業を開始するまで、どのコンテキストが必要か分からない。

## 起動タイミング

- コードベースコンテキストを事前に予測できないサブエージェントを起動する場合
- コンテキストを段階的に洗練するマルチエージェントワークフローの構築
- エージェントタスクで「コンテキストが大きすぎる」または「コンテキスト不足」の失敗が発生した場合
- コード探索用の RAG ライクな取得パイプラインの設計
- エージェントオーケストレーションでのトークン使用量の最適化

## 問題

サブエージェントは限られたコンテキストで起動される。以下が不明:
- 関連コードがどのファイルに含まれるか
- コードベースにどんなパターンが存在するか
- プロジェクトがどんな用語を使っているか

標準的なアプローチは失敗する:
- **全て送信**: コンテキスト制限を超過
- **何も送信しない**: 重要な情報が欠落
- **必要なものを推測**: しばしば誤り

## ソリューション: 反復的取得

コンテキストを段階的に洗練する4フェーズループ:

```
┌─────────────────────────────────────────────┐
│                                             │
│   ┌──────────┐      ┌──────────┐            │
│   │ DISPATCH │─────│ EVALUATE │            │
│   └──────────┘      └──────────┘            │
│        ▲                  │                 │
│        │                  ▼                 │
│   ┌──────────┐      ┌──────────┐            │
│   │   LOOP   │─────│  REFINE  │            │
│   └──────────┘      └──────────┘            │
│                                             │
│        最大3サイクル、その後続行              │
└─────────────────────────────────────────────┘
```

### フェーズ 1: DISPATCH（配信）

候補ファイルを収集する初期の広範クエリ:

```javascript
// 高レベルの意図から開始
const initialQuery = {
  patterns: ['src/**/*.ts', 'lib/**/*.ts'],
  keywords: ['authentication', 'user', 'session'],
  excludes: ['*.test.ts', '*.spec.ts']
};

// 取得エージェントにディスパッチ
const candidates = await retrieveFiles(initialQuery);
```

### フェーズ 2: EVALUATE（評価）

取得コンテンツの関連性を評価:

```javascript
function evaluateRelevance(files, task) {
  return files.map(file => ({
    path: file.path,
    relevance: scoreRelevance(file.content, task),
    reason: explainRelevance(file.content, task),
    missingContext: identifyGaps(file.content, task)
  }));
}
```

スコアリング基準:
- **高 (0.8-1.0)**: 対象機能を直接実装
- **中 (0.5-0.7)**: 関連パターンや型を含む
- **低 (0.2-0.4)**: 間接的に関連
- **なし (0-0.2)**: 無関係、除外

### フェーズ 3: REFINE（洗練）

評価に基づいて検索基準を更新:

```javascript
function refineQuery(evaluation, previousQuery) {
  return {
    // 高関連性ファイルで発見された新しいパターンを追加
    patterns: [...previousQuery.patterns, ...extractPatterns(evaluation)],

    // コードベースで見つかった用語を追加
    keywords: [...previousQuery.keywords, ...extractKeywords(evaluation)],

    // 無関係が確認されたパスを除外
    excludes: [...previousQuery.excludes, ...evaluation
      .filter(e => e.relevance < 0.2)
      .map(e => e.path)
    ],

    // 特定のギャップをターゲット
    focusAreas: evaluation
      .flatMap(e => e.missingContext)
      .filter(unique)
  };
}
```

### フェーズ 4: LOOP（ループ）

洗練された基準で繰り返し（最大3サイクル）:

```javascript
async function iterativeRetrieve(task, maxCycles = 3) {
  let query = createInitialQuery(task);
  let bestContext = [];

  for (let cycle = 0; cycle < maxCycles; cycle++) {
    const candidates = await retrieveFiles(query);
    const evaluation = evaluateRelevance(candidates, task);

    // 十分なコンテキストがあるか確認
    const highRelevance = evaluation.filter(e => e.relevance >= 0.7);
    if (highRelevance.length >= 3 && !hasCriticalGaps(evaluation)) {
      return highRelevance;
    }

    // 洗練して続行
    query = refineQuery(evaluation, query);
    bestContext = mergeContext(bestContext, highRelevance);
  }

  return bestContext;
}
```

## 実践例

### 例 1: バグ修正コンテキスト

```
タスク: 「認証トークンの有効期限バグを修正」

サイクル 1:
  DISPATCH: src/** で "token", "auth", "expiry" を検索
  EVALUATE: auth.ts (0.9), tokens.ts (0.8), user.ts (0.3) を発見
  REFINE: "refresh", "jwt" キーワードを追加; user.ts を除外

サイクル 2:
  DISPATCH: 洗練された条件で検索
  EVALUATE: session-manager.ts (0.95), jwt-utils.ts (0.85) を発見
  REFINE: 十分なコンテキスト（高関連性ファイル2つ）

結果: auth.ts, tokens.ts, session-manager.ts, jwt-utils.ts
```

### 例 2: 機能実装

```
タスク: 「API エンドポイントにレート制限を追加」

サイクル 1:
  DISPATCH: routes/** で "rate", "limit", "api" を検索
  EVALUATE: マッチなし — コードベースは "throttle" 用語を使用
  REFINE: "throttle", "middleware" キーワードを追加

サイクル 2:
  DISPATCH: 洗練された条件で検索
  EVALUATE: throttle.ts (0.9), middleware/index.ts (0.7) を発見
  REFINE: ルーターパターンが必要

サイクル 3:
  DISPATCH: "router", "express" パターンで検索
  EVALUATE: router-setup.ts (0.8) を発見
  REFINE: 十分なコンテキスト

結果: throttle.ts, middleware/index.ts, router-setup.ts
```

## エージェントとの統合

エージェントプロンプトでの使用:

```markdown
このタスクのコンテキスト取得時:
1. 広範なキーワード検索から開始
2. 各ファイルの関連性を評価（0-1スケール）
3. まだ不足しているコンテキストを特定
4. 検索基準を洗練して繰り返し（最大3サイクル）
5. 関連性 >= 0.7 のファイルを返す
```

## ベストプラクティス

1. **広く始めて段階的に絞る** — 初期クエリを過度に限定しない
2. **コードベースの用語を学ぶ** — 最初のサイクルで命名規則が判明することが多い
3. **不足を追跡する** — 明示的なギャップ特定が洗練を駆動する
4. **「十分」で止める** — 高関連性ファイル3つは中程度のファイル10個に勝る
5. **確信を持って除外する** — 低関連性ファイルが関連性を持つことはない

## 関連

- `continuous-learning` スキル — 時間とともに改善されるパターン向け
- エージェント定義（`agents/` に配置）
