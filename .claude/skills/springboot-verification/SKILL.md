---
name: springboot-verification
description: Spring Boot プロジェクトの検証ループ。ビルド、静的解析、カバレッジ付きテスト、セキュリティスキャン、差分レビューをリリースや PR 前に実施。
origin: ECC
---

# Spring Boot 検証ループ

PR 作成前、大規模変更後、デプロイ前に実行する。

## 発動タイミング

- Spring Boot サービスのプルリクエスト作成前
- 大規模リファクタリングや依存関係アップグレード後
- ステージングまたはプロダクションへのデプロイ前検証
- ビルド → リント → テスト → セキュリティスキャンのフルパイプライン実行
- テストカバレッジが閾値を満たしているかの確認

## フェーズ 1: ビルド

```bash
mvn -T 4 clean verify -DskipTests
# または
./gradlew clean assemble -x test
```

ビルド失敗時は停止して修正する。

## フェーズ 2: 静的解析

Maven（一般的なプラグイン）:
```bash
mvn -T 4 spotbugs:check pmd:check checkstyle:check
```

Gradle（設定済みの場合）:
```bash
./gradlew checkstyleMain pmdMain spotbugsMain
```

## フェーズ 3: テスト + カバレッジ

```bash
mvn -T 4 test
mvn jacoco:report   # 80% 以上のカバレッジを確認
# または
./gradlew test jacocoTestReport
```

レポート:
- テスト総数、通過/失敗数
- カバレッジ %（行/ブランチ）

### ユニットテスト

モック化した依存関係でサービスロジックを独立してテスト:

```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

  @Mock private UserRepository userRepository;
  @InjectMocks private UserService userService;

  @Test
  void 有効な入力でユーザーを作成する() {
    var dto = new CreateUserDto("Alice", "alice@example.com");
    var expected = new User(1L, "Alice", "alice@example.com");
    when(userRepository.save(any(User.class))).thenReturn(expected);

    var result = userService.create(dto);

    assertThat(result.name()).isEqualTo("Alice");
    verify(userRepository).save(any(User.class));
  }

  @Test
  void 重複メールの場合に例外をスローする() {
    var dto = new CreateUserDto("Alice", "existing@example.com");
    when(userRepository.existsByEmail(dto.email())).thenReturn(true);

    assertThatThrownBy(() -> userService.create(dto))
        .isInstanceOf(DuplicateEmailException.class);
  }
}
```

### Testcontainers による統合テスト

H2 の代わりに実データベースでテスト:

```java
@SpringBootTest
@Testcontainers
class UserRepositoryIntegrationTest {

  @Container
  static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
      .withDatabaseName("testdb");

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired private UserRepository userRepository;

  @Test
  void 既存ユーザーをメールで検索する() {
    userRepository.save(new User("Alice", "alice@example.com"));

    var found = userRepository.findByEmail("alice@example.com");

    assertThat(found).isPresent();
    assertThat(found.get().getName()).isEqualTo("Alice");
  }
}
```

### MockMvc による API テスト

Spring コンテキスト全体で Controller 層をテスト:

```java
@WebMvcTest(UserController.class)
class UserControllerTest {

  @Autowired private MockMvc mockMvc;
  @MockBean private UserService userService;

  @Test
  void 有効な入力で201を返す() throws Exception {
    var user = new UserDto(1L, "Alice", "alice@example.com");
    when(userService.create(any())).thenReturn(user);

    mockMvc.perform(post("/api/users")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"name": "Alice", "email": "alice@example.com"}
                """))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.name").value("Alice"));
  }

  @Test
  void 不正なメールで400を返す() throws Exception {
    mockMvc.perform(post("/api/users")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"name": "Alice", "email": "not-an-email"}
                """))
        .andExpect(status().isBadRequest());
  }
}
```

## フェーズ 4: セキュリティスキャン

```bash
# 依存関係の CVE
mvn org.owasp:dependency-check-maven:check
# または
./gradlew dependencyCheckAnalyze

# ソースコード内のシークレット
grep -rn "password\s*=\s*\"" src/ --include="*.java" --include="*.yml" --include="*.properties"
grep -rn "sk-\|api_key\|secret" src/ --include="*.java" --include="*.yml"

# シークレット（git 履歴）
git secrets --scan  # 設定済みの場合
```

### よくあるセキュリティ指摘事項

```
# System.out.println の検出（ロガーを使用すべき）
grep -rn "System\.out\.print" src/main/ --include="*.java"

# レスポンスに生の例外メッセージを含めていないか
grep -rn "e\.getMessage()" src/main/ --include="*.java"

# ワイルドカード CORS の検出
grep -rn "allowedOrigins.*\*" src/main/ --include="*.java"
```

## フェーズ 5: リント/フォーマット（任意のゲート）

```bash
mvn spotless:apply   # Spotless プラグイン使用時
./gradlew spotlessApply
```

## フェーズ 6: 差分レビュー

```bash
git diff --stat
git diff
```

チェックリスト:
- デバッグ用ログが残っていないか（`System.out`、ガードなしの `log.debug`）
- エラーメッセージと HTTP ステータスが適切か
- 必要な箇所にトランザクションとバリデーションがあるか
- 設定変更がドキュメント化されているか

## 出力テンプレート

```
検証レポート
===================
ビルド:     [PASS/FAIL]
静的解析:   [PASS/FAIL] (spotbugs/pmd/checkstyle)
テスト:     [PASS/FAIL] (X/Y 通過, Z% カバレッジ)
セキュリティ: [PASS/FAIL] (CVE 検出数: N)
差分:       [X ファイル変更]

総合判定:   [リリース可 / 要修正]

修正すべき問題:
1. ...
2. ...
```

## 継続モード

- 大きな変更時や長いセッション中は 30〜60 分ごとにフェーズを再実行
- 高速フィードバックループを維持: `mvn -T 4 test` + spotbugs

**注意**: 早期のフィードバックは遅い驚きに勝る。ゲートを厳格に保つこと — プロダクションシステムでは警告を欠陥として扱う。
