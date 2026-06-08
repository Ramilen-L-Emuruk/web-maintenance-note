---
name: springboot-security
description: Spring Security ベストプラクティス。認証/認可、バリデーション、CSRF、シークレット管理、セキュリティヘッダー、レートリミット、依存関係セキュリティ。
origin: ECC
---

# Spring Boot セキュリティレビュー

認証の追加、入力処理、エンドポイント作成、シークレット管理時に使用。

## 発動タイミング

- 認証の追加（JWT、OAuth2、セッションベース）
- 認可の実装（@PreAuthorize、ロールベースアクセス）
- ユーザー入力のバリデーション（Bean Validation、カスタムバリデータ）
- CORS、CSRF、セキュリティヘッダーの設定
- シークレットの管理（Vault、環境変数）
- レートリミットやブルートフォース対策の追加
- 依存関係の CVE スキャン

## 認証

- ステートレスな JWT またはオペークトークン（失効リスト付き）を優先
- セッション用 Cookie は `httpOnly`、`Secure`、`SameSite=Strict` を設定
- トークンの検証は `OncePerRequestFilter` またはリソースサーバーで実施

```java
@Component
public class JwtAuthFilter extends OncePerRequestFilter {
  private final JwtService jwtService;

  public JwtAuthFilter(JwtService jwtService) {
    this.jwtService = jwtService;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    String header = request.getHeader(HttpHeaders.AUTHORIZATION);
    if (header != null && header.startsWith("Bearer ")) {
      String token = header.substring(7);
      Authentication auth = jwtService.authenticate(token);
      SecurityContextHolder.getContext().setAuthentication(auth);
    }
    chain.doFilter(request, response);
  }
}
```

## 認可

- メソッドセキュリティを有効化: `@EnableMethodSecurity`
- `@PreAuthorize("hasRole('ADMIN')")` または `@PreAuthorize("@authz.canEdit(#id)")` を使用
- デフォルトで拒否し、必要なスコープのみ公開

```java
@RestController
@RequestMapping("/api/admin")
public class AdminController {

  @PreAuthorize("hasRole('ADMIN')")
  @GetMapping("/users")
  public List<UserDto> listUsers() {
    return userService.findAll();
  }

  @PreAuthorize("@authz.isOwner(#id, authentication)")
  @DeleteMapping("/users/{id}")
  public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
    userService.delete(id);
    return ResponseEntity.noContent().build();
  }
}
```

## 入力バリデーション

- Controller で `@Valid` を使用した Bean Validation
- DTO に制約を適用: `@NotBlank`、`@Email`、`@Size`、カスタムバリデータ
- レンダリング前に HTML をホワイトリストでサニタイズ

```java
// 悪い例: バリデーションなし
@PostMapping("/users")
public User createUser(@RequestBody UserDto dto) {
  return userService.create(dto);
}

// 良い例: バリデーション付き DTO
public record CreateUserDto(
    @NotBlank @Size(max = 100) String name,
    @NotBlank @Email String email,
    @NotNull @Min(0) @Max(150) Integer age
) {}

@PostMapping("/users")
public ResponseEntity<UserDto> createUser(@Valid @RequestBody CreateUserDto dto) {
  return ResponseEntity.status(HttpStatus.CREATED)
      .body(userService.create(dto));
}
```

## SQL インジェクション対策

- Spring Data リポジトリまたはパラメータ化クエリを使用
- ネイティブクエリでは `:param` バインディングを使用し、文字列連結は絶対にしない

```java
// 悪い例: ネイティブクエリで文字列連結
@Query(value = "SELECT * FROM users WHERE name = '" + name + "'", nativeQuery = true)

// 良い例: パラメータ化ネイティブクエリ
@Query(value = "SELECT * FROM users WHERE name = :name", nativeQuery = true)
List<User> findByName(@Param("name") String name);

// 良い例: Spring Data の派生クエリ（自動パラメータ化）
List<User> findByEmailAndActiveTrue(String email);
```

## パスワードエンコーディング

- パスワードは必ず BCrypt または Argon2 でハッシュ化 — 平文保存は厳禁
- 手動ハッシュではなく `PasswordEncoder` Bean を使用

```java
@Bean
public PasswordEncoder passwordEncoder() {
  return new BCryptPasswordEncoder(12); // コストファクター 12
}

// サービス内
public User register(CreateUserDto dto) {
  String hashedPassword = passwordEncoder.encode(dto.password());
  return userRepository.save(new User(dto.email(), hashedPassword));
}
```

## CSRF 対策

- ブラウザセッションアプリでは CSRF を有効に保ち、フォーム/ヘッダーにトークンを含める
- Bearer トークンのみの純粋な API では、CSRF を無効化しステートレス認証に依存

```java
http
  .csrf(csrf -> csrf.disable())
  .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
```

## シークレット管理

- ソースコードにシークレットを含めない。環境変数または Vault から読み込む
- `application.yml` に認証情報を直接記載しない。プレースホルダーを使用
- トークンと DB 認証情報は定期的にローテーション

```yaml
# 悪い例: application.yml にハードコード
spring:
  datasource:
    password: mySecretPassword123

# 良い例: 環境変数プレースホルダー
spring:
  datasource:
    password: ${DB_PASSWORD}

# 良い例: Spring Cloud Vault 統合
spring:
  cloud:
    vault:
      uri: https://vault.example.com
      token: ${VAULT_TOKEN}
```

## セキュリティヘッダー

```java
http
  .headers(headers -> headers
    .contentSecurityPolicy(csp -> csp
      .policyDirectives("default-src 'self'"))
    .frameOptions(HeadersConfigurer.FrameOptionsConfig::sameOrigin)
    .xssProtection(Customizer.withDefaults())
    .referrerPolicy(rp -> rp.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER)));
```

## CORS 設定

- セキュリティフィルターレベルで CORS を設定（Controller 単位ではない）
- 許可するオリジンを制限 — 本番では `*` を絶対に使用しない

```java
@Bean
public CorsConfigurationSource corsConfigurationSource() {
  CorsConfiguration config = new CorsConfiguration();
  config.setAllowedOrigins(List.of("https://app.example.com"));
  config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
  config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
  config.setAllowCredentials(true);
  config.setMaxAge(3600L);

  UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
  source.registerCorsConfiguration("/api/**", config);
  return source;
}

// SecurityFilterChain 内:
http.cors(cors -> cors.configurationSource(corsConfigurationSource()));
```

## レートリミット

- Bucket4j またはゲートウェイレベルのリミットを高コストなエンドポイントに適用
- バーストをログ出力・アラートし、リトライヒント付きで 429 を返す

```java
// Bucket4j によるエンドポイント単位のレートリミット
@Component
public class RateLimitFilter extends OncePerRequestFilter {
  private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

  private Bucket createBucket() {
    return Bucket.builder()
        .addLimit(Bandwidth.classic(100, Refill.intervally(100, Duration.ofMinutes(1))))
        .build();
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    String clientIp = request.getRemoteAddr();
    Bucket bucket = buckets.computeIfAbsent(clientIp, k -> createBucket());

    if (bucket.tryConsume(1)) {
      chain.doFilter(request, response);
    } else {
      response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
      response.getWriter().write("{\"error\": \"レートリミットを超過しました\"}");
    }
  }
}
```

## 依存関係のセキュリティ

- CI で OWASP Dependency Check / Snyk を実行
- Spring Boot と Spring Security をサポートされているバージョンに維持
- 既知の CVE がある場合ビルドを失敗させる

## ロギングと PII

- シークレット、トークン、パスワード、完全な PAN データを絶対にログ出力しない
- 機密フィールドをマスキングし、構造化 JSON ロギングを使用

## ファイルアップロード

- サイズ、コンテンツタイプ、拡張子を検証
- Web ルート外に保存し、必要に応じてスキャン

## リリース前チェックリスト

- [ ] 認証トークンが正しく検証・失効されている
- [ ] すべての機密パスに認可ガードが設定されている
- [ ] すべての入力がバリデーション・サニタイズ済み
- [ ] 文字列連結による SQL がない
- [ ] アプリタイプに応じた CSRF 設定が正しい
- [ ] シークレットが外部化され、コミットされていない
- [ ] セキュリティヘッダーが設定されている
- [ ] API にレートリミットが適用されている
- [ ] 依存関係がスキャン済みで最新
- [ ] ログに機密データが含まれていない

**注意**: デフォルトで拒否、入力をバリデーション、最小権限の原則、設定によるセキュリティ確保を最優先にすること。
