---
name: coding-standards
description: プロジェクト横断のコーディング規約ベースライン。命名、可読性、イミュータビリティ、コード品質レビューに使用。フレームワーク固有のパターンは rules/java/ を参照。
origin: ECC
---

# コーディング規約 & ベストプラクティス

プロジェクト横断で適用可能なベースラインのコーディング規約。

本スキルは共通の基盤であり、フレームワーク固有の詳細なプレイブックではない。

- Java 固有のパターン（record、sealed 型、Stream API 等）は `rules/java/coding-style.md` を参照。
- リポジトリ/サービス層、Controller パターンは `rules/common/patterns.md` を参照。
- 最小限の再利用可能なルールレイヤーが必要な場合は `rules/common/coding-style.md` を参照。

## 発動タイミング

- 新しいプロジェクトやモジュールの開始時
- コード品質・保守性のレビュー時
- 既存コードを規約に合わせてリファクタリングする時
- 命名・フォーマット・構造の一貫性を徹底する時
- リント・フォーマット・静的解析ルールのセットアップ時
- 新しいコントリビューターへのコーディング規約の共有時

## スコープ境界

本スキルの対象:
- 説明的な命名
- イミュータビリティのデフォルト化
- 可読性、KISS、DRY、YAGNI の徹底
- エラーハンドリングの基準とコードスメルのレビュー

本スキルの対象外（より適切なルール/スキルが存在する場合）:
- JSP タグライブラリや Controller 固有のパターン
- セキュリティ（認証・認可・入力バリデーション）
- ドメイン固有のフレームワークガイダンス

## コード品質原則

### 1. 可読性第一

- コードは書くより読む回数の方が多い
- 明確な変数名・メソッド名を使用
- コメントよりも自己文書化コードを優先
- 一貫したフォーマット

### 2. KISS（シンプルに保つ）

- 動作する最もシンプルな解決策を選ぶ
- 過剰設計を避ける
- 早すぎる最適化をしない
- 巧妙なコード < 理解しやすいコード

### 3. DRY（繰り返さない）

- 共通ロジックをメソッド・ユーティリティに抽出
- 再利用可能なコンポーネントを作成
- モジュール間でユーティリティを共有
- コピー&ペーストプログラミングを避ける

### 4. YAGNI（必要になるまで作らない）

- 必要になる前に機能を構築しない
- 投機的な汎用化を避ける
- 必要になった時だけ複雑さを追加
- シンプルに始め、必要に応じてリファクタリング

## Java コーディング規約

### 変数の命名

```java
// 良い例: 説明的な名前
String marketSearchQuery = "election";
boolean isUserAuthenticated = true;
BigDecimal totalRevenue = BigDecimal.valueOf(1000);

// 悪い例: 不明確な名前
String q = "election";
boolean flag = true;
BigDecimal x = BigDecimal.valueOf(1000);
```

### メソッドの命名

```java
// 良い例: 動詞 + 名詞パターン
Optional<Order> findOrderById(Long orderId) { }
BigDecimal calculateTotalAmount(List<OrderItem> items) { }
boolean isValidEmail(String email) { }

// 悪い例: 不明確または名詞のみ
Optional<Order> order(Long id) { }
BigDecimal total(List<OrderItem> items) { }
boolean email(String e) { }
```

### イミュータビリティパターン（重要）

```java
// 良い例: 不変オブジェクト（record 推奨）
public record OrderResponse(Long id, String customer, BigDecimal total) {
    public static OrderResponse from(Order order) {
        return new OrderResponse(order.getId(), order.getCustomerName(), order.getTotal());
    }
}

// 良い例: final フィールド + コンストラクタインジェクション
public class OrderService {
    private final OrderRepository orderRepository;

    public OrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }
}

// 悪い例: 可変オブジェクト + setter
public class OrderService {
    private OrderRepository orderRepository;

    public void setOrderRepository(OrderRepository repo) {
        this.orderRepository = repo;  // 不変性が失われる
    }
}
```

### エラーハンドリング

```java
// 良い例: 包括的なエラーハンドリング
public Order findById(Long id) {
    return orderRepository.findById(id)
        .orElseThrow(() -> new OrderNotFoundException(
            "注文が見つかりません: id=" + id));
}

// 悪い例: エラーハンドリングなし
public Order findById(Long id) {
    return orderRepository.findById(id).get();  // NoSuchElementException のリスク
}

// 悪い例: サイレントな空 catch
try {
    processOrder(order);
} catch (Exception e) {
    // 何もしない — 問題を隠蔽
}
```

### Optional の活用

```java
// 良い例: Optional を適切に使用
public String getCustomerEmail(Long orderId) {
    return orderRepository.findById(orderId)
        .map(Order::getCustomerEmail)
        .orElse("unknown@example.com");
}

// 悪い例: null チェックの連鎖
public String getCustomerEmail(Long orderId) {
    Order order = orderRepository.findById(orderId).orElse(null);
    if (order != null) {
        return order.getCustomerEmail();
    }
    return "unknown@example.com";
}
```

### 型安全

```java
// 良い例: sealed 型でドメインモデルを表現
public sealed interface PaymentResult
    permits PaymentSuccess, PaymentFailure {

    record PaymentSuccess(String transactionId, BigDecimal amount)
        implements PaymentResult {}

    record PaymentFailure(String errorCode, String message)
        implements PaymentResult {}
}

// 良い例: 網羅的ハンドリング（Java 21+）
String message = switch (result) {
    case PaymentSuccess s -> "決済完了: " + s.transactionId();
    case PaymentFailure f -> "決済失敗: " + f.errorCode();
};

// 悪い例: Object 型の多用
Object getResult() { return "何でも返せる"; }  // 型安全性なし
```

## API 設計規約

### REST API 規約

```
GET    /api/orders              # 注文一覧
GET    /api/orders/{id}         # 特定の注文を取得
POST   /api/orders              # 注文を作成
PUT    /api/orders/{id}         # 注文を更新（全体）
PATCH  /api/orders/{id}         # 注文を更新（部分）
DELETE /api/orders/{id}         # 注文を削除

# クエリパラメータによるフィルタリング
GET /api/orders?status=active&limit=10&offset=0
```

### レスポンス形式

```java
// 良い例: 一貫したレスポンス構造
public record ApiResponse<T>(boolean success, T data, String error) {
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, null);
    }
    public static <T> ApiResponse<T> error(String message) {
        return new ApiResponse<>(false, null, message);
    }
}

// 成功レスポンス
return ResponseEntity.ok(ApiResponse.ok(orders));

// エラーレスポンス
return ResponseEntity.badRequest()
    .body(ApiResponse.error("不正なリクエストです"));
```

### 入力バリデーション

```java
// 良い例: Bean Validation を使用
public record CreateOrderRequest(
    @NotBlank(message = "顧客名は必須です")
    @Size(max = 200, message = "顧客名は200文字以内で入力してください")
    String customerName,

    @NotNull(message = "金額は必須です")
    @DecimalMin(value = "0.01", message = "金額は正の値で入力してください")
    BigDecimal amount,

    @NotEmpty(message = "商品を1つ以上選択してください")
    List<@NotBlank String> itemIds
) {}
```

## ファイル構成

### プロジェクト構造

```
src/main/java/com/example/app/
├── controller/        # HTTP リクエスト処理
├── service/           # ビジネスロジック
├── repository/        # データアクセス
├── model/             # ドメインモデル・エンティティ
│   └── dto/          # データ転送オブジェクト（record）
├── config/            # 設定クラス
├── exception/         # カスタム例外
└── util/              # ユーティリティクラス
```

### ファイル命名

```
controller/OrderController.java    # PascalCase（クラス名）
service/OrderService.java          # 機能 + レイヤー名
repository/OrderRepository.java    # インターフェース
model/Order.java                   # ドメインモデル
model/dto/OrderResponse.java       # DTO（record）
util/DateUtils.java                # ユーティリティ
```

## コメント & ドキュメント

### コメントすべき場面

```java
// 良い例: WHY（なぜ）を説明する
// API 障害時にサーバーを圧倒しないよう指数バックオフを使用
long delay = Math.min(1000L * (long) Math.pow(2, retryCount), 30000L);

// パフォーマンスのため意図的に可変リストを使用（大量データ処理）
items.add(newItem);

// 悪い例: WHAT（何を）を述べている — 自明
// カウンターを1増加
count++;

// ユーザー名を設定
name = user.getName();
```

### JavaDoc（公開 API）

```java
/**
 * セマンティック類似度を使用して注文を検索する。
 *
 * @param query 自然言語の検索クエリ
 * @param limit 最大結果数（デフォルト: 10）
 * @return 類似度スコア順にソートされた注文のリスト
 * @throws SearchException 検索サービスが利用不可の場合
 */
public List<Order> searchOrders(String query, int limit) {
    // 実装
}
```

## パフォーマンスのベストプラクティス

### キャッシュ

```java
// 良い例: 不変の計算結果を static final にキャッシュ
private static final Charset UTF_8 = StandardCharsets.UTF_8;
private static final DateTimeFormatter FORMATTER =
    DateTimeFormatter.ofPattern("yyyy-MM-dd");

// 良い例: enum.values() の結果をキャッシュ
private static final Status[] STATUSES = Status.values();
```

### データベースクエリ

```java
// 良い例: 必要なカラムのみ取得
@Query("SELECT o.id, o.customerName, o.status FROM Order o WHERE o.status = :status")
List<OrderSummary> findSummariesByStatus(@Param("status") String status);

// 悪い例: 全カラム取得
List<Order> findByStatus(String status);  // 大量のカラムを不要に取得
```

## テスト規約

### テスト構造（AAA パターン）

```java
@Test
@DisplayName("類似度が正しく計算される")
void calculateSimilarity_validVectors_returnsCorrectScore() {
    // Arrange
    double[] vector1 = {1, 0, 0};
    double[] vector2 = {0, 1, 0};

    // Act
    double similarity = MathUtils.cosineSimilarity(vector1, vector2);

    // Assert
    assertThat(similarity).isEqualTo(0.0);
}
```

### テスト命名

```java
// 良い例: 説明的なテスト名
@Test void クエリに一致する注文がない場合空リストを返す() {}
@Test void APIキーが未設定の場合に例外をスローする() {}
@Test void 検索サービスが利用不可の場合に部分一致検索にフォールバックする() {}

// 悪い例: 曖昧なテスト名
@Test void 動作する() {}
@Test void 検索テスト() {}
```

## コードスメルの検出

以下のアンチパターンに注意:

### 1. 長いメソッド

```java
// 悪い例: 50行超のメソッド
void processOrderData() {
    // 100行のコード
}

// 良い例: 小さなメソッドに分割
void processOrderData() {
    var validated = validateData();
    var transformed = transformData(validated);
    saveData(transformed);
}
```

### 2. 深いネスト

```java
// 悪い例: 5段階以上のネスト
if (user != null) {
    if (user.isAdmin()) {
        if (order != null) {
            if (order.isActive()) {
                if (hasPermission) {
                    // 処理
                }
            }
        }
    }
}

// 良い例: 早期リターン
if (user == null) return;
if (!user.isAdmin()) return;
if (order == null) return;
if (!order.isActive()) return;
if (!hasPermission) return;

// 処理
```

### 3. マジックナンバー

```java
// 悪い例: 説明のない数値
if (retryCount > 3) { }
Thread.sleep(500);

// 良い例: 名前付き定数
private static final int MAX_RETRIES = 3;
private static final long RETRY_DELAY_MS = 500L;

if (retryCount > MAX_RETRIES) { }
Thread.sleep(RETRY_DELAY_MS);
```

---

**注意**: コード品質は妥協しない。明確で保守しやすいコードが、迅速な開発と安心なリファクタリングを可能にする。
