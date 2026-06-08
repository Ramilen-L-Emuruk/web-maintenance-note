---
name: security-review
description: 認証の実装、ユーザー入力の処理、シークレットの操作、API エンドポイントの作成、機密機能の実装時に使用。包括的なセキュリティチェックリストとパターンを提供。
origin: ECC
---

# セキュリティレビュースキル

コードがセキュリティのベストプラクティスに従い、潜在的な脆弱性を特定する。

> **スキル階層**: 本スキルは OWASP Top 10 ベースの汎用チェックリストを提供する。
> Spring Boot 固有のセキュリティパターン（JPA・Bean Validation・Spring Security 設定等）は **`/springboot-security` スキルを優先参照**。
> `security-reviewer` エージェントはこの両スキルを組み合わせて使用する。

## 起動タイミング

- 認証または認可の実装時
- ユーザー入力やファイルアップロードの処理時
- 新しい API エンドポイントの作成時
- シークレットや資格情報の操作時
- 決済機能の実装時
- 機密データの保存・送信時
- サードパーティ API の統合時

## セキュリティチェックリスト

### 1. シークレット管理

#### FAIL: 絶対にやってはいけない
```java
// ハードコードされたシークレット
private static final String API_KEY = "sk-proj-xxxxx";
private static final String DB_PASSWORD = "password123";
```

#### PASS: 常にこうする
```java
// application.yml で管理（環境変数から注入）
@ConfigurationProperties(prefix = "app.external-api")
public record ExternalApiProperties(
        String apiKey,
        String baseUrl
) {
    @PostConstruct
    void validate() {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("app.external-api.api-key が設定されていません");
        }
    }
}
```

```yaml
# application.yml
app:
  external-api:
    api-key: ${EXTERNAL_API_KEY}  # 環境変数から注入
    base-url: ${EXTERNAL_API_BASE_URL:https://api.example.com}
```

#### 検証ステップ
- [ ] ハードコードされた API キー、トークン、パスワードがない
- [ ] 全シークレットが環境変数または外部設定に格納
- [ ] `application-local.yml` が .gitignore に含まれている
- [ ] git 履歴にシークレットがない
- [ ] 本番シークレットがデプロイプラットフォームで管理されている

### 2. 入力バリデーション

#### ユーザー入力は常にバリデーション
```java
// Bean Validation でバリデーションスキーマを定義
public record CreateUserRequest(
        @NotBlank @Email
        String email,

        @NotBlank @Size(min = 1, max = 100)
        String name,

        @NotNull @Min(0) @Max(150)
        Integer age
) {}

// コントローラーでバリデーション実行
@RestController
@RequestMapping("/api/users")
public class UserController {

    @PostMapping
    public ResponseEntity<User> createUser(@Valid @RequestBody CreateUserRequest request) {
        // Bean Validation を通過した場合のみここに到達
        var user = userService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(user);
    }
}
```

#### ファイルアップロードのバリデーション
```java
@PostMapping("/upload")
public ResponseEntity<String> uploadFile(@RequestParam("file") MultipartFile file) {
    // サイズチェック（5MB 上限）
    long maxSize = 5 * 1024 * 1024;
    if (file.getSize() > maxSize) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "ファイルサイズが上限（5MB）を超えています");
    }

    // MIME タイプチェック
    Set<String> allowedTypes = Set.of("image/jpeg", "image/png", "image/gif");
    if (!allowedTypes.contains(file.getContentType())) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "許可されていないファイルタイプです");
    }

    // 拡張子チェック
    String filename = file.getOriginalFilename();
    Set<String> allowedExtensions = Set.of(".jpg", ".jpeg", ".png", ".gif");
    String extension = filename != null
            ? filename.substring(filename.lastIndexOf('.')).toLowerCase()
            : "";
    if (!allowedExtensions.contains(extension)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "許可されていないファイル拡張子です");
    }

    // 処理を続行
    return ResponseEntity.ok("アップロード成功");
}
```

#### 検証ステップ
- [ ] 全ユーザー入力が Bean Validation でバリデーション済み
- [ ] ファイルアップロードが制限されている（サイズ、タイプ、拡張子）
- [ ] ユーザー入力をクエリに直接使用していない
- [ ] ホワイトリストバリデーション（ブラックリストではない）
- [ ] エラーメッセージが機密情報を漏洩しない

### 3. SQL インジェクション防止

#### FAIL: SQL 文字列連結は絶対禁止
```java
// 危険 — SQL インジェクション脆弱性
String query = "SELECT * FROM users WHERE email = '" + userEmail + "'";
jdbcTemplate.queryForList(query);
```

#### PASS: 常にパラメータ化クエリを使用
```java
// 安全 — Spring Data JPA（パラメータ化済み）
Optional<User> findByEmail(String email);

// 安全 — @Query でパラメータバインド
@Query("SELECT u FROM User u WHERE u.email = :email")
Optional<User> findByEmailQuery(@Param("email") String email);

// 安全 — JdbcTemplate でパラメータバインド
jdbcTemplate.queryForObject(
        "SELECT * FROM users WHERE email = ?",
        new Object[]{userEmail},
        userRowMapper
);
```

#### 検証ステップ
- [ ] 全データベースクエリがパラメータ化されている
- [ ] SQL 内で文字列連結をしていない
- [ ] ORM/クエリビルダーが正しく使用されている
- [ ] ネイティブクエリのパラメータバインドが正しい

### 4. 認証・認可

#### トークン処理
```java
// FAIL: localStorage 相当（XSS に脆弱）— フロントエンドで生トークンを扱う

// PASS: httpOnly Cookie で管理
@PostMapping("/login")
public ResponseEntity<Void> login(@Valid @RequestBody LoginRequest request,
                                   HttpServletResponse response) {
    String token = authService.authenticate(request);

    ResponseCookie cookie = ResponseCookie.from("token", token)
            .httpOnly(true)
            .secure(true)
            .sameSite("Strict")
            .maxAge(Duration.ofHours(1))
            .path("/")
            .build();
    response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());

    return ResponseEntity.ok().build();
}
```

#### 認可チェック
```java
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserAdminController {

    private final UserService userService;

    // ADMIN ロールが必要
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }

    // リソース所有者のみ
    @GetMapping("/me")
    public ResponseEntity<UserDto> getMyProfile(
            @AuthenticationPrincipal UserDetails userDetails) {
        var user = userService.findByUsername(userDetails.getUsername());
        return ResponseEntity.ok(user);
    }
}
```

#### 検証ステップ
- [ ] トークンが httpOnly Cookie で管理されている
- [ ] 機密操作の前に認可チェックがある
- [ ] Spring Security のメソッドセキュリティが適切に設定されている
- [ ] ロールベースアクセス制御が実装されている
- [ ] セッション管理が安全

### 5. XSS 防止

#### HTML のサニタイズ
```java
// OWASP HTML Sanitizer を使用
import org.owasp.html.PolicyFactory;
import org.owasp.html.Sanitizers;

@Service
public class ContentSanitizer {

    private static final PolicyFactory POLICY = Sanitizers.FORMATTING
            .and(Sanitizers.BLOCKS);

    public String sanitize(String untrustedHtml) {
        return POLICY.sanitize(untrustedHtml);
    }
}
```

#### JSP でのエスケープ
```jsp
<%-- FAIL: エスケープなし — XSS 脆弱性 --%>
<div>${userInput}</div>

<%-- PASS: JSTL でエスケープ --%>
<div><c:out value="${userInput}" /></div>

<%-- PASS: fn:escapeXml でエスケープ --%>
<div>${fn:escapeXml(userInput)}</div>
```

#### セキュリティヘッダー
```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    return http
            .headers(headers -> headers
                    .contentSecurityPolicy(csp -> csp
                            .policyDirectives("default-src 'self'; " +
                                    "script-src 'self'; " +
                                    "style-src 'self' 'unsafe-inline'; " +
                                    "img-src 'self' data: https:;"))
                    .frameOptions(frame -> frame.deny())
                    .xssProtection(xss -> xss.headerValue(
                            XXssProtectionHeaderWriter.HeaderValue.ENABLED_MODE_BLOCK))
            )
            .build();
}
```

#### 検証ステップ
- [ ] ユーザー提供の HTML がサニタイズされている
- [ ] CSP ヘッダーが設定されている
- [ ] JSP で適切なエスケープ処理がされている
- [ ] 動的コンテンツの未検証レンダリングがない

### 6. CSRF 防止

#### Spring Security の CSRF 保護
```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    return http
            // REST API の場合は CSRF を無効化（ステートレストークン認証の場合）
            // .csrf(csrf -> csrf.disable())

            // サーバーレンダリング（JSP/Thymeleaf）の場合は CSRF を有効化
            .csrf(csrf -> csrf
                    .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()))
            .build();
}
```

#### 検証ステップ
- [ ] 状態変更操作に CSRF 保護がある
- [ ] SameSite=Strict が全 Cookie に設定されている
- [ ] REST API のステートレス認証の場合は CSRF 無効化が妥当

### 7. レートリミット

#### Bucket4j によるレートリミット
```java
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) throws Exception {
        String ip = request.getRemoteAddr();
        Bucket bucket = buckets.computeIfAbsent(ip, this::createStandardBucket);

        if (!bucket.tryConsume(1)) {
            response.setStatus(HttpServletResponse.SC_TOO_MANY_REQUESTS);
            response.getWriter().write("{\"error\": \"リクエスト数の上限を超えました\"}");
            return false;
        }
        return true;
    }

    private Bucket createStandardBucket(String key) {
        // 1分あたり 100 リクエスト
        return Bucket.builder()
                .addLimit(Bandwidth.classic(100, Refill.greedy(100, Duration.ofMinutes(1))))
                .build();
    }
}
```

#### 検証ステップ
- [ ] 全 API エンドポイントにレートリミットがある
- [ ] 高コスト操作にはより厳しい制限がある
- [ ] IP ベースのレートリミットがある
- [ ] ユーザーベースのレートリミット（認証済み）がある

### 8. 機密データの漏洩防止

#### ロギング
```java
// FAIL: 機密データをログに出力
log.info("ユーザーログイン: email={}, password={}", email, password);
log.info("決済処理: cardNumber={}", cardNumber);

// PASS: 機密データを除外
log.info("ユーザーログイン: email={}, userId={}", email, userId);
log.info("決済処理: last4={}, userId={}", card.getLast4(), userId);
```

#### エラーメッセージ
```java
// FAIL: 内部詳細を露出
@ExceptionHandler(Exception.class)
public ResponseEntity<Map<String, Object>> handleError(Exception e) {
    return ResponseEntity.status(500).body(Map.of(
            "error", e.getMessage(),
            "stack", Arrays.toString(e.getStackTrace())  // 危険
    ));
}

// PASS: 汎用エラーメッセージ
@ExceptionHandler(Exception.class)
public ResponseEntity<Map<String, String>> handleError(Exception e) {
    log.error("内部エラー", e);  // サーバーログにのみ詳細を出力
    return ResponseEntity.status(500).body(Map.of(
            "error", "エラーが発生しました。もう一度お試しください。"
    ));
}
```

#### 検証ステップ
- [ ] ログにパスワード、トークン、シークレットがない
- [ ] ユーザー向けエラーメッセージが汎用的
- [ ] 詳細エラーはサーバーログにのみ出力
- [ ] スタックトレースがユーザーに露出していない

### 9. 依存関係セキュリティ

#### 定期的な更新
```bash
# 脆弱性チェック（OWASP Dependency-Check）
mvn org.owasp:dependency-check-maven:check

# 依存関係の更新確認
mvn versions:display-dependency-updates
mvn versions:display-plugin-updates

# 依存関係ツリーの確認
mvn dependency:tree
```

#### Maven の設定
```xml
<!-- pom.xml に OWASP Dependency-Check プラグインを追加 -->
<plugin>
    <groupId>org.owasp</groupId>
    <artifactId>dependency-check-maven</artifactId>
    <version>10.0.0</version>
    <configuration>
        <failBuildOnCVSS>7</failBuildOnCVSS>
    </configuration>
</plugin>
```

#### 検証ステップ
- [ ] 依存関係が最新
- [ ] 既知の脆弱性がない（dependency-check クリーン）
- [ ] Dependabot が GitHub で有効化されている
- [ ] 定期的なセキュリティ更新が実施されている

## セキュリティテスト

### 自動セキュリティテスト（MockMvc）
```java
@SpringBootTest
@AutoConfigureMockMvc
class SecurityTest {

    @Autowired
    private MockMvc mockMvc;

    // 認証テスト
    @Test
    void 認証なしのアクセスは401を返す() throws Exception {
        mockMvc.perform(get("/api/protected"))
                .andExpect(status().isUnauthorized());
    }

    // 認可テスト
    @Test
    void 一般ユーザーは管理者APIにアクセスできない() throws Exception {
        mockMvc.perform(get("/api/admin")
                        .with(user("user").roles("USER")))
                .andExpect(status().isForbidden());
    }

    // 入力バリデーションテスト
    @Test
    void 不正な入力は400を返す() throws Exception {
        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\": \"not-an-email\"}"))
                .andExpect(status().isBadRequest());
    }
}
```

## デプロイ前セキュリティチェックリスト

本番デプロイの前に必ず確認:

- [ ] **シークレット**: ハードコードなし、全て環境変数に格納
- [ ] **入力バリデーション**: 全ユーザー入力がバリデーション済み
- [ ] **SQL インジェクション**: 全クエリがパラメータ化
- [ ] **XSS**: ユーザーコンテンツがサニタイズ済み
- [ ] **CSRF**: 保護が有効
- [ ] **認証**: 適切なトークン処理
- [ ] **認可**: ロールチェックが配置済み
- [ ] **レートリミット**: 全エンドポイントで有効
- [ ] **HTTPS**: 本番で強制
- [ ] **セキュリティヘッダー**: CSP、X-Frame-Options 設定済み
- [ ] **エラーハンドリング**: エラーに機密データなし
- [ ] **ロギング**: ログに機密データなし
- [ ] **依存関係**: 最新、脆弱性なし
- [ ] **CORS**: 適切に設定
- [ ] **ファイルアップロード**: バリデーション済み（サイズ、タイプ）

## リソース

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Spring Security リファレンス](https://docs.spring.io/spring-security/reference/)
- [Web Security Academy](https://portswigger.net/web-security)

---

**重要**: セキュリティは任意ではない。1 つの脆弱性がプラットフォーム全体を危険にさらす。迷ったときは慎重な側に倒す。
