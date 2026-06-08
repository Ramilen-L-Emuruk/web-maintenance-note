---
name: springboot-tdd
description: Spring Boot 向けテスト駆動開発。JUnit 5、Mockito、MockMvc、Testcontainers、JaCoCo を使用。機能追加、バグ修正、リファクタリング時に使用。
origin: ECC
---

# Spring Boot TDD ワークフロー

> **参照**: テスト基準・カバレッジ要件・命名規約は [`rules/java/testing.md`](../../rules/java/testing.md) を参照。
> TDD ワークフロー（RED/GREEN/REFACTOR）の詳細は **`tdd-guide`** エージェントを使用。
> 本スキルは Spring Boot テスト実装パターンの参照用。

80% 以上のカバレッジ（ユニット + 統合）を目標とした Spring Boot サービスの TDD ガイダンス。

## 使用タイミング

- 新機能やエンドポイントの追加
- バグ修正やリファクタリング
- データアクセスロジックやセキュリティルールの追加

## ワークフロー

1) テストを先に書く（失敗することを確認）
2) テストを通す最小限のコードを実装
3) テストがグリーンの状態でリファクタリング
4) カバレッジを確認（JaCoCo）

## ユニットテスト（JUnit 5 + Mockito）

```java
@ExtendWith(MockitoExtension.class)
class MarketServiceTest {
  @Mock MarketRepository repo;
  @InjectMocks MarketService service;

  @Test
  @DisplayName("マーケットを作成する")
  void create_withValidRequest_savesAndReturnsMarket() {
    CreateMarketRequest req = new CreateMarketRequest("name", "desc", Instant.now(), List.of("cat"));
    when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

    Market result = service.create(req);

    assertThat(result.name()).isEqualTo("name");
    verify(repo).save(any());
  }
}
```

パターン:
- Arrange-Act-Assert（AAA）
- パーシャルモックを避け、明示的なスタブを使用
- バリエーションには `@ParameterizedTest` を使用

## Web 層テスト（MockMvc）

```java
@WebMvcTest(MarketController.class)
class MarketControllerTest {
  @Autowired MockMvc mockMvc;
  @MockBean MarketService marketService;

  @Test
  @DisplayName("マーケット一覧を返す")
  void list_returnsPagedMarkets() throws Exception {
    when(marketService.list(any())).thenReturn(Page.empty());

    mockMvc.perform(get("/api/markets"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content").isArray());
  }
}
```

## 統合テスト（SpringBootTest）

```java
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MarketIntegrationTest {
  @Autowired MockMvc mockMvc;

  @Test
  @DisplayName("マーケットを作成する")
  void createMarket_withValidPayload_returns201() throws Exception {
    mockMvc.perform(post("/api/markets")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
          {"name":"Test","description":"Desc","endDate":"2030-01-01T00:00:00Z","categories":["general"]}
        """))
      .andExpect(status().isCreated());
  }
}
```

## 永続化テスト（DataJpaTest）

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestContainersConfig.class)
class MarketRepositoryTest {
  @Autowired MarketRepository repo;

  @Test
  @DisplayName("保存して検索する")
  void findByName_afterSave_returnsEntity() {
    MarketEntity entity = new MarketEntity();
    entity.setName("Test");
    repo.save(entity);

    Optional<MarketEntity> found = repo.findByName("Test");
    assertThat(found).isPresent();
  }
}
```

## Testcontainers

- 本番環境を模倣するため Postgres/Redis の再利用可能コンテナを使用
- `@DynamicPropertySource` で JDBC URL を Spring コンテキストに注入

## カバレッジ（JaCoCo）

Maven 設定:
```xml
<plugin>
  <groupId>org.jacoco</groupId>
  <artifactId>jacoco-maven-plugin</artifactId>
  <version>0.8.14</version>
  <executions>
    <execution>
      <goals><goal>prepare-agent</goal></goals>
    </execution>
    <execution>
      <id>report</id>
      <phase>verify</phase>
      <goals><goal>report</goal></goals>
    </execution>
  </executions>
</plugin>
```

## アサーション

- 可読性のため AssertJ（`assertThat`）を優先
- JSON レスポンスには `jsonPath` を使用
- 例外には `assertThatThrownBy(...)` を使用

## テストデータビルダー

```java
class MarketBuilder {
  private String name = "Test";
  MarketBuilder withName(String name) { this.name = name; return this; }
  Market build() { return new Market(null, name, MarketStatus.ACTIVE); }
}
```

## CI コマンド

- Maven: `mvn -T 4 test` または `mvn verify`
- Gradle: `./gradlew test jacocoTestReport`

**注意**: テストは高速・独立・決定的に保つ。実装の詳細ではなく、振る舞いをテストすること。
