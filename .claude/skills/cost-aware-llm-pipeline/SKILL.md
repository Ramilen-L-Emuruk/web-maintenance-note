---
name: cost-aware-llm-pipeline
description: LLM API 利用のコスト最適化パターン — タスク複雑度によるモデルルーティング、バジェット追跡、リトライロジック、プロンプトキャッシング。
origin: ECC
---

# コスト意識型 LLM パイプライン

品質を維持しながら LLM API コストを制御するパターン。モデルルーティング、バジェット追跡、リトライロジック、プロンプトキャッシングを組み合わせて構成可能なパイプラインにする。

## 起動タイミング

- LLM API（Claude、GPT 等）を呼び出すアプリケーションの構築
- 複雑さが異なるアイテムのバッチ処理
- API 支出のバジェット内に収める必要がある場合
- 複雑なタスクの品質を犠牲にせずにコスト最適化

## コアコンセプト

### 1. タスク複雑度によるモデルルーティング

単純なタスクには安価なモデルを自動選択し、複雑なタスクには高価なモデルを予約。

```python
MODEL_SONNET = "claude-sonnet-4-6"
MODEL_HAIKU = "claude-haiku-4-5-20251001"

_SONNET_TEXT_THRESHOLD = 10_000  # 文字数
_SONNET_ITEM_THRESHOLD = 30     # アイテム数

def select_model(
    text_length: int,
    item_count: int,
    force_model: str | None = None,
) -> str:
    """タスクの複雑さに基づいてモデルを選択。"""
    if force_model is not None:
        return force_model
    if text_length >= _SONNET_TEXT_THRESHOLD or item_count >= _SONNET_ITEM_THRESHOLD:
        return MODEL_SONNET  # 複雑なタスク
    return MODEL_HAIKU  # 単純なタスク（3〜4倍安い）
```

### 2. イミュータブルなコスト追跡

frozen dataclass で累積支出を追跡。各 API 呼び出しは新しいトラッカーを返す — 状態を変更しない。

```python
from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class CostRecord:
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float

@dataclass(frozen=True, slots=True)
class CostTracker:
    budget_limit: float = 1.00
    records: tuple[CostRecord, ...] = ()

    def add(self, record: CostRecord) -> "CostTracker":
        """レコードを追加した新しいトラッカーを返す（self は変更しない）。"""
        return CostTracker(
            budget_limit=self.budget_limit,
            records=(*self.records, record),
        )

    @property
    def total_cost(self) -> float:
        return sum(r.cost_usd for r in self.records)

    @property
    def over_budget(self) -> bool:
        return self.total_cost > self.budget_limit
```

### 3. 狭いリトライロジック

一時的なエラーのみリトライ。認証エラーや不正リクエストでは即座に失敗。

```python
from anthropic import (
    APIConnectionError,
    InternalServerError,
    RateLimitError,
)

_RETRYABLE_ERRORS = (APIConnectionError, RateLimitError, InternalServerError)
_MAX_RETRIES = 3

def call_with_retry(func, *, max_retries: int = _MAX_RETRIES):
    """一時的なエラーのみリトライし、それ以外は即座に失敗。"""
    for attempt in range(max_retries):
        try:
            return func()
        except _RETRYABLE_ERRORS:
            if attempt == max_retries - 1:
                raise
            time.sleep(2 ** attempt)  # 指数バックオフ
    # AuthenticationError、BadRequestError 等 → 即座に raise
```

### 4. プロンプトキャッシング

長いシステムプロンプトをキャッシュして、リクエストごとの再送信を回避。

```python
messages = [
    {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},  # これをキャッシュ
            },
            {
                "type": "text",
                "text": user_input,  # 可変部分
            },
        ],
    }
]
```

## 合成

4つの技法をすべて1つのパイプライン関数で組み合わせ:

```python
def process(text: str, config: Config, tracker: CostTracker) -> tuple[Result, CostTracker]:
    # 1. モデルルーティング
    model = select_model(len(text), estimated_items, config.force_model)

    # 2. バジェットチェック
    if tracker.over_budget:
        raise BudgetExceededError(tracker.total_cost, tracker.budget_limit)

    # 3. リトライ + キャッシング付き呼び出し
    response = call_with_retry(lambda: client.messages.create(
        model=model,
        messages=build_cached_messages(system_prompt, text),
    ))

    # 4. コスト追跡（イミュータブル）
    record = CostRecord(model=model, input_tokens=..., output_tokens=..., cost_usd=...)
    tracker = tracker.add(record)

    return parse_result(response), tracker
```

## 価格リファレンス（2025-2026）

| モデル | 入力 ($/1M トークン) | 出力 ($/1M トークン) | 相対コスト |
|--------|---------------------|----------------------|-----------|
| Haiku 4.5 | $0.80 | $4.00 | 1x |
| Sonnet 4.6 | $3.00 | $15.00 | 〜4x |
| Opus 4.5 | $15.00 | $75.00 | 〜19x |

## ベストプラクティス

- **最安モデルから開始** — 複雑さの閾値を満たした場合のみ高価なモデルにルーティング
- **明示的なバジェット制限を設定** — バッチ処理前に設定。過剰支出より早期失敗を選ぶ
- **モデル選択の判断をログ** — 実データに基づいて閾値をチューニングできる
- **1024 トークン超のシステムプロンプトにはプロンプトキャッシングを使用** — コストとレイテンシの両方を削減
- **認証やバリデーションエラーでは絶対にリトライしない** — 一時的な障害（ネットワーク、レート制限、サーバーエラー）のみ

## 避けるべきアンチパターン

- 複雑さに関係なく全リクエストに最も高価なモデルを使用
- 全エラーでリトライ（永続的な障害にバジェットを浪費）
- コスト追跡の状態をミューテート（デバッグと監査が困難に）
- コードベース全体にモデル名をハードコード（定数または設定を使用すべき）
- 繰り返しのシステムプロンプトのプロンプトキャッシングを無視
