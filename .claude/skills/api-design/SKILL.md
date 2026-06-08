---
name: api-design
description: REST API 設計パターン — リソース命名、ステータスコード、ページネーション、フィルタリング、エラーレスポンス、バージョニング、レートリミットを含む本番 API の設計指針。
origin: ECC
---

# API 設計パターン

一貫性があり開発者フレンドリーな REST API を設計するための規約とベストプラクティス。

## 起動タイミング

- 新しい API エンドポイントの設計時
- 既存の API 契約のレビュー時
- ページネーション、フィルタリング、ソートの追加時
- API のエラーハンドリング実装時
- API バージョニング戦略の計画時
- 公開またはパートナー向け API の構築時

## リソース設計

### URL 構造

```
# リソースは名詞、複数形、小文字、ケバブケース
GET    /api/v1/users
GET    /api/v1/users/:id
POST   /api/v1/users
PUT    /api/v1/users/:id
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id

# 関係性のためのサブリソース
GET    /api/v1/users/:id/orders
POST   /api/v1/users/:id/orders

# CRUD にマッピングされないアクション（動詞は控えめに使用）
POST   /api/v1/orders/:id/cancel
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
```

### 命名規則

```
# 良い例
/api/v1/team-members          # 複合語はケバブケース
/api/v1/orders?status=active  # フィルタリングにはクエリパラメータ
/api/v1/users/123/orders      # 所有関係のネストリソース

# 悪い例
/api/v1/getUsers              # URL に動詞
/api/v1/user                  # 単数形（複数形を使用）
/api/v1/team_members          # URL にスネークケース
/api/v1/users/123/getOrders   # ネストリソースに動詞
```

## HTTP メソッドとステータスコード

### メソッドのセマンティクス

| メソッド | 冪等 | 安全 | 用途 |
|---------|------|------|------|
| GET | はい | はい | リソースの取得 |
| POST | いいえ | いいえ | リソースの作成、アクションのトリガー |
| PUT | はい | いいえ | リソースの完全置換 |
| PATCH | いいえ* | いいえ | リソースの部分更新 |
| DELETE | はい | いいえ | リソースの削除 |

*PATCH は適切な実装で冪等にできる

### ステータスコードリファレンス

```
# 成功
200 OK                    — GET, PUT, PATCH（レスポンスボディあり）
201 Created               — POST（Location ヘッダーを含む）
204 No Content            — DELETE, PUT（レスポンスボディなし）

# クライアントエラー
400 Bad Request           — バリデーション失敗、不正な JSON
401 Unauthorized          — 認証の欠如または無効
403 Forbidden             — 認証済みだが認可されていない
404 Not Found             — リソースが存在しない
409 Conflict              — 重複エントリ、状態の競合
422 Unprocessable Entity  — 意味的に無効（有効な JSON だが不正なデータ）
429 Too Many Requests     — レート制限超過

# サーバーエラー
500 Internal Server Error — 予期しない障害（詳細を公開しない）
502 Bad Gateway           — 上流サービスの障害
503 Service Unavailable   — 一時的な過負荷、Retry-After を含む
```

### よくある間違い

```
# 悪い例: すべてに 200
{ "status": 200, "success": false, "error": "Not found" }

# 良い例: HTTP ステータスコードを意味的に使用
HTTP/1.1 404 Not Found
{ "error": { "code": "not_found", "message": "ユーザーが見つかりません" } }

# 悪い例: バリデーションエラーに 500
# 良い例: フィールドレベルの詳細付きで 400 または 422

# 悪い例: 作成されたリソースに 200
# 良い例: Location ヘッダー付きで 201
HTTP/1.1 201 Created
Location: /api/v1/users/abc-123
```

## レスポンスフォーマット

### 成功レスポンス

```json
{
  "data": {
    "id": "abc-123",
    "email": "alice@example.com",
    "name": "Alice",
    "createdAt": "2025-01-15T10:30:00Z"
  }
}
```

### コレクションレスポンス（ページネーション付き）

```json
{
  "data": [
    { "id": "abc-123", "name": "Alice" },
    { "id": "def-456", "name": "Bob" }
  ],
  "meta": {
    "total": 142,
    "page": 1,
    "perPage": 20,
    "totalPages": 8
  },
  "links": {
    "self": "/api/v1/users?page=1&perPage=20",
    "next": "/api/v1/users?page=2&perPage=20",
    "last": "/api/v1/users?page=8&perPage=20"
  }
}
```

### エラーレスポンス

```json
{
  "error": {
    "code": "validation_error",
    "message": "リクエストのバリデーションに失敗しました",
    "details": [
      {
        "field": "email",
        "message": "有効なメールアドレスを入力してください",
        "code": "invalid_format"
      },
      {
        "field": "age",
        "message": "0〜150の範囲で入力してください",
        "code": "out_of_range"
      }
    ]
  }
}
```

### レスポンスエンベロープのバリエーション

```java
// オプション A: data ラッパー付きエンベロープ（公開 API 推奨）
public record ApiResponse<T>(
    T data,
    PaginationMeta meta,
    PaginationLinks links
) {}

public record ApiError(
    ErrorBody error
) {
    public record ErrorBody(
        String code,
        String message,
        List<FieldError> details
    ) {}
}

// オプション B: フラットレスポンス（シンプル、内部 API 向け）
// 成功: リソースを直接返す
// エラー: エラーオブジェクトを返す
// HTTP ステータスコードで区別
```

## ページネーション

### オフセットベース（シンプル）

```
GET /api/v1/users?page=2&perPage=20
```

```java
// Spring Data JPA での実装
@GetMapping("/api/v1/users")
public ResponseEntity<ApiResponse<List<UserDto>>> listUsers(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int perPage) {
    Page<User> users = userRepository.findAll(
            PageRequest.of(page, perPage, Sort.by("createdAt").descending()));
    return ResponseEntity.ok(ApiResponse.of(users));
}
```

**メリット:** 実装が容易、「N ページに移動」をサポート
**デメリット:** 大きなオフセットで低速、並行挿入で不整合

### カーソルベース（スケーラブル）

```
GET /api/v1/users?cursor=eyJpZCI6MTIzfQ&limit=20
```

```java
@GetMapping("/api/v1/users")
public ResponseEntity<CursorResponse<UserDto>> listUsers(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "20") int limit) {
    Long cursorId = decodeCursor(cursor);
    List<User> users = userRepository.findByIdGreaterThan(
            cursorId, PageRequest.of(0, limit + 1, Sort.by("id")));

    boolean hasNext = users.size() > limit;
    if (hasNext) users = users.subList(0, limit);

    return ResponseEntity.ok(new CursorResponse<>(
            users.stream().map(UserDto::from).toList(),
            hasNext,
            hasNext ? encodeCursor(users.getLast().getId()) : null));
}
```

**メリット:** 位置に関係なく一定のパフォーマンス、並行挿入で安定
**デメリット:** 任意のページにジャンプ不可、カーソルは不透明

### 使い分け

| ユースケース | ページネーション方式 |
|-------------|---------------------|
| 管理画面、小さなデータセット（<10K） | オフセット |
| 無限スクロール、フィード、大きなデータセット | カーソル |
| 公開 API | カーソル（デフォルト）+ オフセット（オプション） |
| 検索結果 | オフセット（ユーザーがページ番号を期待） |

## フィルタリング、ソート、検索

### フィルタリング

```
# 単純な等価比較
GET /api/v1/orders?status=active&customerId=abc-123

# 比較演算子（ブラケット表記）
GET /api/v1/products?price[gte]=10&price[lte]=100
GET /api/v1/orders?createdAt[after]=2025-01-01

# 複数値（カンマ区切り）
GET /api/v1/products?category=electronics,clothing

# ネストされたフィールド（ドット表記）
GET /api/v1/orders?customer.country=JP
```

### ソート

```
# 単一フィールド（降順にはプレフィックス -）
GET /api/v1/products?sort=-createdAt

# 複数フィールド（カンマ区切り）
GET /api/v1/products?sort=-featured,price,-createdAt
```

### 全文検索

```
# 検索クエリパラメータ
GET /api/v1/products?q=ワイヤレスヘッドホン

# フィールド固有の検索
GET /api/v1/users?email=alice
```

### スパースフィールドセット

```
# 指定フィールドのみ返す（ペイロード削減）
GET /api/v1/users?fields=id,name,email
GET /api/v1/orders?fields=id,total,status&include=customer.name
```

## 認証と認可

### トークンベース認証

```
# Authorization ヘッダーに Bearer トークン
GET /api/v1/users
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

# API キー（サーバー間通信）
GET /api/v1/data
X-API-Key: sk_live_abc123
```

### 認可パターン

```java
// リソースレベル: 所有権チェック
@GetMapping("/api/v1/orders/{id}")
public ResponseEntity<?> getOrder(@PathVariable Long id, @AuthenticationPrincipal UserDetails user) {
    Order order = orderRepository.findById(id)
            .orElseThrow(() -> new NotFoundException("注文が見つかりません"));
    if (!order.getUserId().equals(user.getId())) {
        throw new ForbiddenException("アクセス権限がありません");
    }
    return ResponseEntity.ok(Map.of("data", OrderDto.from(order)));
}

// ロールベース: 権限チェック
@DeleteMapping("/api/v1/users/{id}")
@PreAuthorize("hasRole('ADMIN')")
public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
    userService.delete(id);
    return ResponseEntity.noContent().build();
}
```

## レートリミット

### ヘッダー

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000

# 超過時
HTTP/1.1 429 Too Many Requests
Retry-After: 60
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "レート制限を超過しました。60秒後に再試行してください。"
  }
}
```

### レート制限ティア

| ティア | 制限 | ウィンドウ | ユースケース |
|--------|------|----------|-------------|
| 匿名 | 30/分 | IP 単位 | 公開エンドポイント |
| 認証済み | 100/分 | ユーザー単位 | 標準 API アクセス |
| プレミアム | 1000/分 | API キー単位 | 有料 API プラン |
| 内部 | 10000/分 | サービス単位 | サービス間通信 |

## バージョニング

### URL パスバージョニング（推奨）

```
/api/v1/users
/api/v2/users
```

**メリット:** 明示的、ルーティングが容易、キャッシュ可能
**デメリット:** バージョン間で URL が変わる

### ヘッダーバージョニング

```
GET /api/users
Accept: application/vnd.myapp.v2+json
```

**メリット:** クリーンな URL
**デメリット:** テストが難しい、忘れやすい

### バージョニング戦略

```
1. /api/v1/ から開始 — 必要になるまでバージョニングしない
2. アクティブなバージョンは最大2つ（現行 + 前バージョン）
3. 非推奨タイムライン:
   - 非推奨を告知（公開 API は6ヶ月前通知）
   - Sunset ヘッダーを追加: Sunset: Sat, 01 Jan 2026 00:00:00 GMT
   - サンセット日以降は 410 Gone を返す
4. 後方互換性のある変更は新バージョン不要:
   - レスポンスへの新フィールド追加
   - 新しいオプションクエリパラメータの追加
   - 新しいエンドポイントの追加
5. 破壊的変更は新バージョンが必要:
   - フィールドの削除または名前変更
   - フィールド型の変更
   - URL 構造の変更
   - 認証方式の変更
```

## 実装パターン

### Java（Spring Boot @RestController）

```java
// リクエスト DTO（Bean Validation 付き record）
public record CreateUserRequest(
    @NotBlank @Email String email,
    @NotBlank @Size(min = 1, max = 100) String name
) {}

// レスポンス DTO
public record UserResponse(
    String id,
    String email,
    String name,
    Instant createdAt
) {
    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getEmail(),
                user.getName(), user.getCreatedAt());
    }
}

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserService userService;

    @PostMapping
    public ResponseEntity<Map<String, UserResponse>> createUser(
            @Valid @RequestBody CreateUserRequest request) {
        User user = userService.create(request);
        UserResponse response = UserResponse.from(user);
        return ResponseEntity
                .created(URI.create("/api/v1/users/" + user.getId()))
                .body(Map.of("data", response));
    }
}

// グローバルエラーハンドリング
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(
            MethodArgumentNotValidException ex) {
        List<Map<String, String>> details = ex.getBindingResult()
                .getFieldErrors().stream()
                .map(e -> Map.of(
                        "field", e.getField(),
                        "message", e.getDefaultMessage(),
                        "code", e.getCode()))
                .toList();

        return ResponseEntity.status(422).body(Map.of(
                "error", Map.of(
                        "code", "validation_error",
                        "message", "リクエストのバリデーションに失敗しました",
                        "details", details)));
    }
}
```

## API 設計チェックリスト

新しいエンドポイントを公開する前に:

- [ ] リソース URL が命名規約に従っている（複数形、ケバブケース、動詞なし）
- [ ] 正しい HTTP メソッドを使用（GET は読み取り、POST は作成、等）
- [ ] 適切なステータスコードを返す（すべてに 200 を使わない）
- [ ] Bean Validation でバリデーション済み
- [ ] エラーレスポンスがコードとメッセージ付きの標準フォーマットに従う
- [ ] リストエンドポイントにページネーションを実装（カーソルまたはオフセット）
- [ ] 認証が必要（または明示的にパブリックとマーク）
- [ ] 認可チェック済み（ユーザーは自分のリソースのみアクセス可能）
- [ ] レートリミットを設定
- [ ] レスポンスが内部詳細を漏洩しない（スタックトレース、SQL エラー）
- [ ] 既存エンドポイントと一貫した命名（camelCase）
- [ ] ドキュメント化済み（OpenAPI/Swagger 仕様を更新）
