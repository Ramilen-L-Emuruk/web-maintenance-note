---
name: backend-patterns
description: バックエンドアーキテクチャパターン、API 設計、データベース最適化、サーバーサイドベストプラクティス。Spring Boot / Spring Data JPA / Spring MVC 向け。
origin: ECC
---

# バックエンド開発パターン

スケーラブルなサーバーサイドアプリケーションのためのアーキテクチャパターンとベストプラクティス。

> ※ Spring Boot 固有のパターンについては `springboot-patterns` スキルも参照。本スキルはフレームワーク非依存の概念を中心に、Java/Spring での実装例を示す。

## 起動タイミング

- REST API エンドポイントの設計時
- リポジトリ・サービス・コントローラーレイヤーの実装時
- データベースクエリの最適化時（N+1、インデックス、コネクションプール）
- キャッシュの追加時（Redis、インメモリ、HTTP キャッシュヘッダー）
- バックグラウンドジョブや非同期処理のセットアップ時
- API のエラーハンドリングとバリデーションの構築時
- ミドルウェア（認証、ロギング、レートリミット）の構築時

## API 設計パターン

### RESTful API 構造

```
# PASS: リソースベースの URL
GET    /api/markets                 # リソース一覧
GET    /api/markets/{id}            # 単一リソース取得
POST   /api/markets                 # リソース作成
PUT    /api/markets/{id}            # リソース置換
PATCH  /api/markets/{id}            # リソース更新
DELETE /api/markets/{id}            # リソース削除

# PASS: フィルタリング、ソート、ページネーション用のクエリパラメータ
GET /api/markets?status=active&sort=volume&size=20&page=0
```

### リポジトリパターン

```java
// データアクセスロジックの抽象化
public interface MarketRepository extends JpaRepository<Market, Long> {

    // Spring Data JPA のメソッド名によるクエリ生成
    List<Market> findByStatus(MarketStatus status);

    // ページネーション対応
    Page<Market> findByStatus(MarketStatus status, Pageable pageable);

    // カスタムクエリ（必要なカラムのみ取得）
    @Query("SELECT m FROM Market m WHERE m.status = :status ORDER BY m.volume DESC")
    List<Market> findActiveMarketsByVolume(@Param("status") MarketStatus status);

    // プロジェクション（必要なフィールドのみ）
    @Query("SELECT m.id, m.name, m.status, m.volume FROM Market m WHERE m.status = :status")
    List<MarketSummaryProjection> findSummaryByStatus(@Param("status") MarketStatus status);
}
```

### サービスレイヤーパターン

```java
// ビジネスロジックをデータアクセスから分離
@Service
@RequiredArgsConstructor
public class MarketService {

    private final MarketRepository marketRepository;

    @Transactional(readOnly = true)
    public List<Market> searchMarkets(String query, int limit) {
        // ビジネスロジック
        var embedding = generateEmbedding(query);
        var results = vectorSearch(embedding, limit);

        // 完全なデータを取得
        var ids = results.stream().map(SearchResult::getId).toList();
        var markets = marketRepository.findAllById(ids);

        // 類似度でソート
        var scoreMap = results.stream()
                .collect(Collectors.toMap(SearchResult::getId, SearchResult::getScore));
        return markets.stream()
                .sorted(Comparator.comparingDouble(m -> scoreMap.getOrDefault(m.getId(), 0.0)))
                .toList();
    }
}
```

### フィルターパターン（ミドルウェア）

```java
// リクエスト/レスポンス処理パイプライン
@Component
@Order(1)
public class AuthenticationFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String token = extractBearerToken(request);

        if (token == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("{\"error\": \"認証トークンがありません\"}");
            return;
        }

        try {
            var user = verifyToken(token);
            request.setAttribute("authenticatedUser", user);
            filterChain.doFilter(request, response);
        } catch (InvalidTokenException e) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("{\"error\": \"無効なトークン\"}");
        }
    }

    private String extractBearerToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}
```

## データベースパターン

### クエリ最適化

```java
// PASS: 必要なカラムのみ取得
@Query("SELECT m.id, m.name, m.status, m.volume FROM Market m " +
       "WHERE m.status = :status ORDER BY m.volume DESC")
List<MarketSummaryProjection> findTopMarkets(
        @Param("status") MarketStatus status, Pageable pageable);

// FAIL: 全カラム取得（不要なデータを含む）
List<Market> findAll();
```

### N+1 クエリ防止

```java
// FAIL: N+1 クエリ問題
var markets = marketRepository.findAll();
for (var market : markets) {
    market.getCreator().getName();  // N 回の追加クエリ
}

// PASS: @EntityGraph で一括取得
@EntityGraph(attributePaths = {"creator"})
@Query("SELECT m FROM Market m WHERE m.status = :status")
List<Market> findWithCreator(@Param("status") MarketStatus status);

// PASS: JPQL の JOIN FETCH
@Query("SELECT m FROM Market m JOIN FETCH m.creator WHERE m.status = :status")
List<Market> findWithCreatorJoinFetch(@Param("status") MarketStatus status);
```

### トランザクションパターン

```java
@Service
@RequiredArgsConstructor
public class MarketTransactionService {

    private final MarketRepository marketRepository;
    private final PositionRepository positionRepository;

    @Transactional
    public Market createMarketWithPosition(
            CreateMarketDto marketData,
            CreatePositionDto positionData) {
        // Spring の @Transactional で自動的にトランザクション管理
        var market = marketRepository.save(marketData.toEntity());
        var position = positionData.toEntity(market.getId());
        positionRepository.save(position);

        // 例外発生時は自動ロールバック
        return market;
    }
}
```

## キャッシュ戦略

### Spring Cache によるキャッシュレイヤー

```java
@Service
@RequiredArgsConstructor
public class CachedMarketService {

    private final MarketRepository marketRepository;

    // キャッシュヒット時は DB アクセスをスキップ
    @Cacheable(value = "markets", key = "#id")
    public Market findById(Long id) {
        return marketRepository.findById(id)
                .orElseThrow(() -> new MarketNotFoundException(id));
    }

    // 更新時にキャッシュを無効化
    @CacheEvict(value = "markets", key = "#id")
    @Transactional
    public Market update(Long id, UpdateMarketDto dto) {
        var market = marketRepository.findById(id)
                .orElseThrow(() -> new MarketNotFoundException(id));
        market.update(dto);
        return marketRepository.save(market);
    }

    // 全キャッシュクリア
    @CacheEvict(value = "markets", allEntries = true)
    public void invalidateAll() {
        // キャッシュをクリアするだけ
    }
}
```

### Cache-Aside パターン（Redis）

```java
@Service
@RequiredArgsConstructor
public class RedisCachedMarketService {

    private final MarketRepository marketRepository;
    private final RedisTemplate<String, Market> redisTemplate;

    private static final Duration CACHE_TTL = Duration.ofMinutes(5);

    public Market findById(Long id) {
        String cacheKey = "market:" + id;

        // キャッシュを確認
        Market cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            return cached;
        }

        // キャッシュミス — DB から取得
        Market market = marketRepository.findById(id)
                .orElseThrow(() -> new MarketNotFoundException(id));

        // キャッシュに保存（TTL: 5分）
        redisTemplate.opsForValue().set(cacheKey, market, CACHE_TTL);

        return market;
    }
}
```

## エラーハンドリングパターン

### 集約エラーハンドラー

```java
// カスタム例外
public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final boolean operational;

    public ApiException(HttpStatus status, String message) {
        this(status, message, true);
    }

    public ApiException(HttpStatus status, String message, boolean operational) {
        super(message);
        this.status = status;
        this.operational = operational;
    }

    public HttpStatus getStatus() { return status; }
    public boolean isOperational() { return operational; }
}

// グローバルエラーハンドラー
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException e) {
        return ResponseEntity.status(e.getStatus())
                .body(new ErrorResponse(false, e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        var details = e.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .toList();
        return ResponseEntity.badRequest()
                .body(new ErrorResponse(false, "バリデーションエラー", details));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception e) {
        log.error("予期しないエラー", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ErrorResponse(false, "内部サーバーエラー"));
    }

    record ErrorResponse(boolean success, String error, List<String> details) {
        ErrorResponse(boolean success, String error) {
            this(success, error, null);
        }
    }
}
```

### 指数バックオフ付きリトライ

```java
// Spring Retry を使用
@Service
@RequiredArgsConstructor
public class ExternalApiService {

    @Retryable(
        retryFor = {RestClientException.class},
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2)  // 1秒, 2秒, 4秒
    )
    public ApiResponse fetchFromExternalApi(String endpoint) {
        return restClient.get()
                .uri(endpoint)
                .retrieve()
                .body(ApiResponse.class);
    }

    @Recover
    public ApiResponse fallback(RestClientException e, String endpoint) {
        log.error("外部 API 呼び出し失敗（リトライ後）: {}", endpoint, e);
        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "外部サービスが一時的に利用できません");
    }
}
```

## 認証・認可

### Spring Security による認可

```java
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/public/**").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
                .build();
    }
}
```

### ロールベースアクセス制御

```java
@RestController
@RequestMapping("/api/markets")
@RequiredArgsConstructor
public class MarketController {

    private final MarketService marketService;

    // 認証済みユーザーのみ
    @GetMapping
    public ResponseEntity<List<Market>> findAll() {
        return ResponseEntity.ok(marketService.findAll());
    }

    // ADMIN ロールが必要
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        marketService.delete(id);
        return ResponseEntity.noContent().build();
    }

    // リソースの所有者または ADMIN のみ
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN') or @marketService.isOwner(#id, authentication.name)")
    public ResponseEntity<Market> update(
            @PathVariable Long id,
            @Valid @RequestBody UpdateMarketDto dto) {
        return ResponseEntity.ok(marketService.update(id, dto));
    }
}
```

## レートリミット

### Bucket4j によるレートリミット

```java
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    // IP アドレスごとの Bucket を管理
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String ip = request.getRemoteAddr();
        Bucket bucket = buckets.computeIfAbsent(ip, this::createBucket);

        if (bucket.tryConsume(1)) {
            filterChain.doFilter(request, response);
        } else {
            response.setStatus(HttpServletResponse.SC_TOO_MANY_REQUESTS); // 429
            response.getWriter().write("{\"error\": \"リクエスト数の上限を超えました\"}");
        }
    }

    private Bucket createBucket(String key) {
        // 1分あたり100リクエスト
        Bandwidth limit = Bandwidth.classic(100,
                Refill.greedy(100, Duration.ofMinutes(1)));
        return Bucket.builder().addLimit(limit).build();
    }
}
```

## バックグラウンドジョブとキュー

### Spring の非同期処理

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class IndexingService {

    private final MarketRepository marketRepository;

    // 非同期でインデックスを更新（リクエストをブロックしない）
    @Async
    public CompletableFuture<Void> indexMarket(Long marketId) {
        try {
            var market = marketRepository.findById(marketId)
                    .orElseThrow(() -> new MarketNotFoundException(marketId));
            // インデックス処理
            log.info("マーケット {} のインデックスを更新", marketId);
            return CompletableFuture.completedFuture(null);
        } catch (Exception e) {
            log.error("インデックス更新失敗: {}", marketId, e);
            return CompletableFuture.failedFuture(e);
        }
    }
}

// コントローラーでの利用
@PostMapping("/markets/{id}/index")
public ResponseEntity<Map<String, String>> requestIndex(@PathVariable Long id) {
    indexingService.indexMarket(id);  // 非同期実行
    return ResponseEntity.accepted()
            .body(Map.of("message", "インデックス更新をキューに追加しました"));
}
```

## ロギングとモニタリング

### 構造化ロギング

```java
@RestController
@RequestMapping("/api/markets")
@RequiredArgsConstructor
@Slf4j
public class MarketController {

    private final MarketService marketService;

    @GetMapping
    public ResponseEntity<List<Market>> findAll(HttpServletRequest request) {
        String requestId = UUID.randomUUID().toString();

        // MDC（Mapped Diagnostic Context）で構造化ロギング
        MDC.put("requestId", requestId);
        MDC.put("method", "GET");
        MDC.put("path", "/api/markets");

        try {
            log.info("マーケット一覧を取得");
            var markets = marketService.findAll();
            return ResponseEntity.ok(markets);
        } catch (Exception e) {
            log.error("マーケット一覧の取得に失敗", e);
            throw e;
        } finally {
            MDC.clear();
        }
    }
}
```

**重要**: バックエンドパターンはスケーラブルで保守性の高いサーバーサイドアプリケーションを実現する。プロジェクトの複雑度に合ったパターンを選択すること。
