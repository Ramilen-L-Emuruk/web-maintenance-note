---
name: regex-vs-llm-structured-text
description: 構造化テキストの解析において正規表現と LLM のどちらを使うかを判断するフレームワーク — まず正規表現で処理し、低信頼度のエッジケースにのみ LLM を適用する。
origin: ECC
---

# 構造化テキスト解析における正規表現 vs LLM

構造化テキスト（クイズ、フォーム、請求書、ドキュメント）を解析するための実践的な判断フレームワーク。重要なポイント: 正規表現は 95〜98% のケースを低コストかつ決定論的に処理できる。残りのエッジケースにのみ高コストな LLM 呼び出しを使用する。

## 使用タイミング

- 繰り返しパターンを持つ構造化テキスト（問題、フォーム、テーブル）の解析
- テキスト抽出に正規表現と LLM のどちらを使うか判断する場合
- 両方のアプローチを組み合わせたハイブリッドパイプラインの構築
- テキスト処理におけるコスト/精度のトレードオフの最適化

## 判断フレームワーク

```
テキスト形式は一貫して繰り返しがあるか？
├── はい（90%以上がパターンに従う） → 正規表現から開始
│   ├── 正規表現が 95%以上を処理 → 完了、LLM 不要
│   └── 正規表現が 95%未満 → エッジケースにのみ LLM を追加
└── いいえ（自由形式、高い可変性） → LLM を直接使用
```

## アーキテクチャパターン

```
ソーステキスト
    │
    ▼
[正規表現パーサー] ─── 構造を抽出（95〜98% の精度）
    │
    ▼
[テキストクリーナー] ─── ノイズ除去（マーカー、ページ番号、アーティファクト）
    │
    ▼
[信頼度スコアラー] ─── 低信頼度の抽出をフラグ
    │
    ├── 高信頼度（≥0.95） → 直接出力
    │
    └── 低信頼度（<0.95） → [LLM バリデーター] → 出力
```

## 実装

### 1. 正規表現パーサー（大部分を処理）

```python
import re
from dataclasses import dataclass

@dataclass(frozen=True)
class ParsedItem:
    id: str
    text: str
    choices: tuple[str, ...]
    answer: str
    confidence: float = 1.0

def parse_structured_text(content: str) -> list[ParsedItem]:
    """Parse structured text using regex patterns."""
    pattern = re.compile(
        r"(?P<id>\d+)\.\s*(?P<text>.+?)\n"
        r"(?P<choices>(?:[A-D]\..+?\n)+)"
        r"Answer:\s*(?P<answer>[A-D])",
        re.MULTILINE | re.DOTALL,
    )
    items = []
    for match in pattern.finditer(content):
        choices = tuple(
            c.strip() for c in re.findall(r"[A-D]\.\s*(.+)", match.group("choices"))
        )
        items.append(ParsedItem(
            id=match.group("id"),
            text=match.group("text").strip(),
            choices=choices,
            answer=match.group("answer"),
        ))
    return items
```

### 2. 信頼度スコアリング

LLM レビューが必要な可能性のある項目をフラグする:

```python
@dataclass(frozen=True)
class ConfidenceFlag:
    item_id: str
    score: float
    reasons: tuple[str, ...]

def score_confidence(item: ParsedItem) -> ConfidenceFlag:
    """Score extraction confidence and flag issues."""
    reasons = []
    score = 1.0

    if len(item.choices) < 3:
        reasons.append("few_choices")
        score -= 0.3

    if not item.answer:
        reasons.append("missing_answer")
        score -= 0.5

    if len(item.text) < 10:
        reasons.append("short_text")
        score -= 0.2

    return ConfidenceFlag(
        item_id=item.id,
        score=max(0.0, score),
        reasons=tuple(reasons),
    )

def identify_low_confidence(
    items: list[ParsedItem],
    threshold: float = 0.95,
) -> list[ConfidenceFlag]:
    """Return items below confidence threshold."""
    flags = [score_confidence(item) for item in items]
    return [f for f in flags if f.score < threshold]
```

### 3. LLM バリデーター（エッジケースのみ）

```python
def validate_with_llm(
    item: ParsedItem,
    original_text: str,
    client,
) -> ParsedItem:
    """Use LLM to fix low-confidence extractions."""
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",  # Cheapest model for validation
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": (
                f"Extract the question, choices, and answer from this text.\n\n"
                f"Text: {original_text}\n\n"
                f"Current extraction: {item}\n\n"
                f"Return corrected JSON if needed, or 'CORRECT' if accurate."
            ),
        }],
    )
    # Parse LLM response and return corrected item...
    return corrected_item
```

### 4. ハイブリッドパイプライン

```python
def process_document(
    content: str,
    *,
    llm_client=None,
    confidence_threshold: float = 0.95,
) -> list[ParsedItem]:
    """Full pipeline: regex -> confidence check -> LLM for edge cases."""
    # Step 1: Regex extraction (handles 95-98%)
    items = parse_structured_text(content)

    # Step 2: Confidence scoring
    low_confidence = identify_low_confidence(items, confidence_threshold)

    if not low_confidence or llm_client is None:
        return items

    # Step 3: LLM validation (only for flagged items)
    low_conf_ids = {f.item_id for f in low_confidence}
    result = []
    for item in items:
        if item.id in low_conf_ids:
            result.append(validate_with_llm(item, content, llm_client))
        else:
            result.append(item)

    return result
```

## 実運用メトリクス

本番クイズ解析パイプライン（410 項目）の実績:

| メトリクス | 値 |
|-----------|-----|
| 正規表現の成功率 | 98.0% |
| 低信頼度の項目数 | 8 (2.0%) |
| 必要な LLM 呼び出し数 | ~5 |
| 全 LLM 処理と比較したコスト削減 | ~95% |
| テストカバレッジ | 93% |

## ベストプラクティス

- **まず正規表現から始める** — 不完全な正規表現でも改善のベースラインになる
- **信頼度スコアリング**を使って LLM の助けが必要な箇所をプログラム的に特定する
- **最も安価な LLM** をバリデーションに使用する（Haiku クラスのモデルで十分）
- 解析済み項目を**ミューテーションしない** — クリーニング/バリデーションステップでは新しいインスタンスを返す
- **TDD** はパーサーと相性が良い — 既知のパターンのテストを先に書き、次にエッジケースを追加する
- **メトリクスをログに記録**する（正規表現の成功率、LLM 呼び出し数）ことでパイプラインの健全性を追跡する

## 避けるべきアンチパターン

- 正規表現が 95% 以上を処理できるのに全テキストを LLM に送る（高コストかつ低速）
- 自由形式で可変性の高いテキストに正規表現を使う（LLM の方が適している）
- 信頼度スコアリングをスキップして正規表現が「うまくいく」ことを期待する
- クリーニング/バリデーションステップで解析済みオブジェクトをミューテーションする
- エッジケースのテストを行わない（不正な入力、欠損フィールド、エンコーディングの問題）

## 使用場面

- クイズ/試験問題の解析
- フォームデータの抽出
- 請求書/レシートの処理
- ドキュメント構造の解析（ヘッダー、セクション、テーブル）
- コストが重要な、繰り返しパターンを持つ構造化テキスト全般
