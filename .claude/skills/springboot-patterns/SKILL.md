---
name: springboot-patterns
description: Spring Boot アーキテクチャパターン、REST API 設計、レイヤードサービス、データアクセス、キャッシュ、非同期処理、ロギング。Java Spring Boot バックエンド作業時に使用。
origin: ECC
---

# Spring Boot 開発パターン

スケーラブルでプロダクション品質のサービスのための Spring Boot アーキテクチャと API パターン。

## 発動タイミング

- Spring MVC または WebFlux で REST API を構築する時
- Controller → Service → Repository のレイヤー構成を設計する時
- Spring Data JPA、キャッシュ、非同期処理を設定する時
- バリデーション、例外ハンドリング、ページネーションを追加する時
- dev/staging/production 環境のプロファイルを設定する時
- Spring Events や Kafka によるイベント駆動パターンを実装する時

## REST API 構造

```java
@RestController
@RequestMapping("/api/markets")
@Validated
class MarketController {
  private final MarketService marketService;

  MarketController(MarketService marketService) {
    this.marketService = marketService;
  }

  @GetMapping
  ResponseEntity<Page<MarketResponse>> list(
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    Page<Market> markets = marketService.list(PageRequest.of(page, size));
    return ResponseEntity.ok(markets.map(MarketResponse::from));
  }

  @PostMapping
  ResponseEntity<MarketResponse> create(@Valid @RequestBody CreateMarketRequest request) {
    Market market = marketService.create(request);
    return ResponseEntity.status(HttpStatus.CREATED).body(MarketResponse.from(market));
  }
}
```

## リポジトリパターン（Spring Data JPA）

```java
public interface MarketRepository extends JpaRepository<MarketEntity, Long> {
  @Query("select m from MarketEntity m where m.status = :status order by m.volume desc")
  List<MarketEntity> findActive(@Param("status") MarketStatus status, Pageable pageable);
}
```

## トランザクション付きサービス層

```java
@Service
public class MarketService {
  private final MarketRepository repo;

  public MarketService(MarketRepository repo) {
    this.repo = repo;
  }

  @Transactional
  public Market create(CreateMarketRequest request) {
    MarketEntity entity = MarketEntity.from(request);
    MarketEntity saved = repo.save(entity);
    return Market.from(saved);
  }
}
```

## DTO とバリデーション

```java
public record CreateMarketRequest(
    @NotBlank @Size(max = 200) String name,
    @NotBlank @Size(max = 2000) String description,
    @NotNull @FutureOrPresent Instant endDate,
    @NotEmpty List<@NotBlank String> categories) {}

public record MarketResponse(Long id, String name, MarketStatus status) {
  static MarketResponse from(Market market) {
    return new MarketResponse(market.id(), market.name(), market.status());
  }
}
```

## 例外ハンドリング

```java
@ControllerAdvice
class GlobalExceptionHandler {
  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
    String message = ex.getBindingResult().getFieldErrors().stream()
        .map(e -> e.getField() + ": " + e.getDefaultMessage())
        .collect(Collectors.joining(", "));
    return ResponseEntity.badRequest().body(ApiError.validation(message));
  }

  @ExceptionHandler(AccessDeniedException.class)
  ResponseEntity<ApiError> handleAccessDenied() {
    return ResponseEntity.status(HttpStatus.FORBIDDEN).body(ApiError.of("アクセスが拒否されました"));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ApiError> handleGeneric(Exception ex) {
    // 予期しないエラーはスタックトレース付きでログ出力
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(ApiError.of("内部サーバーエラー"));
  }
}
```

## キャッシュ

設定クラスで `@EnableCaching` が必要。

```java
@Service
public class MarketCacheService {
  private final MarketRepository repo;

  public MarketCacheService(MarketRepository repo) {
    this.repo = repo;
  }

  @Cacheable(value = "market", key = "#id")
  public Market getById(Long id) {
    return repo.findById(id)
        .map(Market::from)
        .orElseThrow(() -> new EntityNotFoundException("マーケットが見つかりません"));
  }

  @CacheEvict(value = "market", key = "#id")
  public void evict(Long id) {}
}
```

## 非同期処理

設定クラスで `@EnableAsync` が必要。

```java
@Service
public class NotificationService {
  @Async
  public CompletableFuture<Void> sendAsync(Notification notification) {
    // メール/SMS の送信
    return CompletableFuture.completedFuture(null);
  }
}
```

## ロギング（SLF4J）

```java
@Service
public class ReportService {
  private static final Logger log = LoggerFactory.getLogger(ReportService.class);

  public Report generate(Long marketId) {
    log.info("generate_report marketId={}", marketId);
    try {
      // ロジック
    } catch (Exception ex) {
      log.error("generate_report_failed marketId={}", marketId, ex);
      throw ex;
    }
    return new Report();
  }
}
```

## ミドルウェア / フィルター

```java
@Component
public class RequestLoggingFilter extends OncePerRequestFilter {
  private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain filterChain) throws ServletException, IOException {
    long start = System.currentTimeMillis();
    try {
      filterChain.doFilter(request, response);
    } finally {
      long duration = System.currentTimeMillis() - start;
      log.info("req method={} uri={} status={} durationMs={}",
          request.getMethod(), request.getRequestURI(), response.getStatus(), duration);
    }
  }
}
```

## ページネーションとソート

```java
PageRequest page = PageRequest.of(pageNumber, pageSize, Sort.by("createdAt").descending());
Page<Market> results = marketService.list(page);
```

## 外部呼び出しのリトライ

```java
public <T> T withRetry(Supplier<T> supplier, int maxRetries) {
  int attempts = 0;
  while (true) {
    try {
      return supplier.get();
    } catch (Exception ex) {
      attempts++;
      if (attempts >= maxRetries) {
        throw ex;
      }
      try {
        Thread.sleep((long) Math.pow(2, attempts) * 100L);
      } catch (InterruptedException ie) {
        Thread.currentThread().interrupt();
        throw ex;
      }
    }
  }
}
```

## レートリミット（フィルター + Bucket4j）

**セキュリティ注意**: `X-Forwarded-For` ヘッダーはクライアントが偽装可能なため、デフォルトでは信頼できない。
転送ヘッダーを使用する条件:
1. 信頼できるリバースプロキシ（nginx、AWS ALB 等）の背後で動作している
2. `ForwardedHeaderFilter` を Bean として登録済み
3. `server.forward-headers-strategy=NATIVE` または `FRAMEWORK` を設定済み
4. プロキシが `X-Forwarded-For` ヘッダーを追記ではなく上書きするよう設定済み

`ForwardedHeaderFilter` が正しく設定されている場合、`request.getRemoteAddr()` は転送ヘッダーから正しいクライアント IP を自動的に返す。設定なしの場合は `request.getRemoteAddr()` を直接使用する — これが唯一の信頼できる値。

```java
@Component
public class RateLimitFilter extends OncePerRequestFilter {
  private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

  /*
   * セキュリティ: このフィルターはレートリミットのクライアント識別に
   * request.getRemoteAddr() を使用する。
   *
   * リバースプロキシ（nginx、AWS ALB 等）の背後にある場合、正確なクライアント IP
   * 検出のために Spring の転送ヘッダー処理を適切に設定する必要がある:
   *
   * 1. application.properties/yaml で server.forward-headers-strategy=NATIVE
   *    （クラウドプラットフォーム向け）または FRAMEWORK を設定
   * 2. FRAMEWORK 戦略の場合、ForwardedHeaderFilter を登録:
   *
   *    @Bean
   *    ForwardedHeaderFilter forwardedHeaderFilter() {
   *        return new ForwardedHeaderFilter();
   *    }
   *
   * 3. プロキシが X-Forwarded-For を追記ではなく上書きするよう設定し偽装を防止
   * 4. server.tomcat.remoteip.trusted-proxies 等をコンテナに合わせて設定
   *
   * この設定なしでは request.getRemoteAddr() はクライアント IP ではなく
   * プロキシ IP を返す。信頼できるプロキシ設定なしに X-Forwarded-For を
   * 直接読み取ってはならない — 容易に偽装可能。
   */
  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain filterChain) throws ServletException, IOException {
    // ForwardedHeaderFilter 設定済みなら正しいクライアント IP を返し、
    // 未設定なら直接接続 IP を返す。プロキシ設定なしに X-Forwarded-For を
    // 直接信頼してはならない。
    String clientIp = request.getRemoteAddr();

    Bucket bucket = buckets.computeIfAbsent(clientIp,
        k -> Bucket.builder()
            .addLimit(Bandwidth.classic(100, Refill.greedy(100, Duration.ofMinutes(1))))
            .build());

    if (bucket.tryConsume(1)) {
      filterChain.doFilter(request, response);
    } else {
      response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
    }
  }
}
```

## バックグラウンドジョブ

Spring の `@Scheduled` またはキュー（Kafka、SQS、RabbitMQ 等）を使用。ハンドラーは冪等かつ監視可能に保つ。

## オブザーバビリティ

- 構造化ログ（JSON）: Logback エンコーダ経由
- メトリクス: Micrometer + Prometheus/OTel
- トレーシング: Micrometer Tracing（OpenTelemetry または Brave バックエンド）

## プロダクションのデフォルト設定

- コンストラクタインジェクションを優先、フィールドインジェクションを避ける
- `spring.mvc.problemdetails.enabled=true` で RFC 7807 エラーを有効化（Spring Boot 3+）
- HikariCP プールサイズをワークロードに合わせて設定し、タイムアウトを設定
- クエリには `@Transactional(readOnly = true)` を使用
- `@NonNull` と `Optional` で null 安全性を確保

**注意**: Controller は薄く、Service は焦点を絞り、Repository はシンプルに、エラーは一元的にハンドリングする。保守性とテスタビリティを最適化すること。
