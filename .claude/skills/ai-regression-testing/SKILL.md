---
name: ai-regression-testing
description: AI 支援開発のためのリグレッションテスト戦略。サンドボックスモードの API テスト、自動バグチェックワークフロー、同一モデルがコードの記述とレビューを行う際の AI ブラインドスポットを捕捉するパターン。
origin: ECC
---

# AI リグレッションテスト

AI 支援開発に特化したテストパターン。同一モデルがコードの記述とレビューを行うことで、自動テストでしか捕捉できない体系的なブラインドスポットが発生する。

## 起動タイミング

- AI エージェント（Claude Code、Cursor、Codex）が API ルートやバックエンドロジックを変更した場合
- バグが発見・修正され、再発を防止する必要がある場合
- プロジェクトにサンドボックス/モックモードがあり、DB 不要のテストに活用できる場合
- コード変更後のバグチェックコマンド実行時
- 複数のコードパスが存在する場合（サンドボックス vs 本番、フィーチャーフラグ等）

## 核心的な問題

AI がコードを書き、自分自身の作業をレビューすると、両方のステップで同じ仮定を持ち込む。これが予測可能な失敗パターンを生む:

```
AI が修正を書く → AI が修正をレビュー → AI が「正しそう」と言う → バグは残ったまま
```

**本番で観測された実例:**

```
修正1: API レスポンスに notification_settings を追加
  → SELECT クエリへの追加を忘れた
  → AI がレビューしたが見落とした（同じブラインドスポット）

修正2: SELECT クエリに追加
  → ビルドエラー（カラムが生成された型にない）
  → AI が修正1をレビューしたが SELECT の問題を捕捉できなかった

修正3: SELECT * に変更
  → 本番パスは修正、サンドボックスパスを忘れた
  → AI がレビューして再び見落とした（4回目の発生）

修正4: テストが初回実行で即座に捕捉 → PASS
```

パターン: **サンドボックス/本番パスの不整合** が AI が導入するリグレッションの第1位。

## サンドボックスモード API テスト

AI フレンドリーなアーキテクチャを持つ多くのプロジェクトにはサンドボックス/モックモードがある。これが高速な DB 不要の API テストの鍵。

### セットアップ（JUnit 5 + Spring Boot）

```java
// src/test/java/com/example/config/SandboxTestConfig.java
@TestConfiguration
@ActiveProfiles("sandbox")
public class SandboxTestConfig {
    // サンドボックスモード — データベース不要
}
```

```yaml
# src/test/resources/application-sandbox.yml
app:
  sandbox-mode: true
spring:
  datasource:
    url: jdbc:h2:mem:testdb
```

### テストヘルパー（MockMvc）

```java
// src/test/java/com/example/support/ApiTestSupport.java
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("sandbox")
public abstract class ApiTestSupport {

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    protected ResultActions performGet(String url) throws Exception {
        return mockMvc.perform(get(url)
                .contentType(MediaType.APPLICATION_JSON));
    }

    protected ResultActions performGet(String url, String sandboxUserId) throws Exception {
        return mockMvc.perform(get(url)
                .header("X-Sandbox-User-Id", sandboxUserId)
                .contentType(MediaType.APPLICATION_JSON));
    }

    protected ResultActions performPost(String url, Object body) throws Exception {
        return mockMvc.perform(post(url)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    protected <T> T parseResponse(MvcResult result, Class<T> type) throws Exception {
        return objectMapper.readValue(
                result.getResponse().getContentAsString(), type);
    }
}
```

### リグレッションテストの作成

重要な原則: **動作するコードではなく、バグが見つかったコードに対してテストを書く。**

```java
// src/test/java/com/example/api/UserProfileApiTest.java
class UserProfileApiTest extends ApiTestSupport {

    // レスポンスに必ず含まれるべきフィールドの契約
    private static final List<String> REQUIRED_FIELDS = List.of(
            "id", "email", "fullName", "phone", "role",
            "createdAt", "avatarUrl", "notificationSettings"  // ← バグ発見後に追加
    );

    @Test
    void 全必須フィールドが返される() throws Exception {
        MvcResult result = performGet("/api/user/profile")
                .andExpect(status().isOk())
                .andReturn();

        Map<String, Object> data = parseResponse(result, Map.class);

        for (String field : REQUIRED_FIELDS) {
            assertThat(data).containsKey(field);
        }
    }

    // リグレッションテスト — AI が4回導入した同じバグ
    @Test
    void notificationSettingsがundefinedでない_BUG_R1リグレッション() throws Exception {
        MvcResult result = performGet("/api/user/profile")
                .andExpect(status().isOk())
                .andReturn();

        Map<String, Object> data = parseResponse(result, Map.class);

        assertThat(data).containsKey("notificationSettings");
        Object ns = data.get("notificationSettings");
        assertThat(ns == null || ns instanceof Map).isTrue();
    }
}
```

### サンドボックス/本番パリティのテスト

最も一般的な AI リグレッション: 本番パスを修正したがサンドボックスパスを忘れる（またはその逆）。

```java
@Test
void サンドボックスモードでpartnerNameが含まれる() throws Exception {
    MvcResult result = performGet("/api/user/messages", "user-001")
            .andExpect(status().isOk())
            .andReturn();

    List<Map<String, Object>> data = parseResponse(result, List.class);

    // 本番パスには追加されたが
    // サンドボックスパスには追加されていないバグを捕捉
    if (!data.isEmpty()) {
        for (Map<String, Object> conv : data) {
            assertThat(conv).containsKey("partnerName");
        }
    }
}
```

## バグチェックワークフローへの統合

### カスタムコマンド定義

```markdown
<!-- .claude/commands/bug-check.md -->
# バグチェック

## ステップ 1: 自動テスト（必須、スキップ不可）

コードレビューの前にまずこれらのコマンドを実行:

    mvn test           # JUnit テストスイート
    mvn clean compile  # コンパイルチェック

- テスト失敗 → 最優先バグとして報告
- ビルド失敗 → コンパイルエラーを最優先として報告
- 両方パスした場合のみステップ 2 に進む

## ステップ 2: コードレビュー（AI レビュー）

1. サンドボックス/本番パスの一貫性
2. API レスポンス形状がフロントエンドの期待に一致
3. SELECT 句の完全性（JPA クエリ、@Query アノテーション）
4. ロールバック付きのエラーハンドリング
5. 楽観的更新の競合状態

## ステップ 3: 修正されたバグごとにリグレッションテストを提案
```

### ワークフロー

```
ユーザー: 「バグチェックして」（または "/bug-check"）
  │
  ├─ ステップ 1: mvn test
  │   ├─ FAIL → 機械的にバグ発見（AI の判断不要）
  │   └─ PASS → 続行
  │
  ├─ ステップ 2: mvn clean compile
  │   ├─ FAIL → 機械的にコンパイルエラー発見
  │   └─ PASS → 続行
  │
  ├─ ステップ 3: AI コードレビュー（既知のブラインドスポットを意識）
  │   └─ 発見事項を報告
  │
  └─ ステップ 4: 各修正に対してリグレッションテストを作成
      └─ 次のバグチェックで修正の破壊を捕捉
```

## 一般的な AI リグレッションパターン

### パターン 1: サンドボックス/本番パスの不一致

**頻度**: 最も一般的（4回のリグレッション中3回で観測）

```java
// FAIL: AI が本番パスにのみフィールドを追加
if (sandboxMode) {
    return new UserProfile(id, email, name);  // 新しいフィールドが欠落
}
// 本番パス
return new UserProfile(id, email, name, notificationSettings);

// PASS: 両方のパスが同じ形状を返す必要がある
if (sandboxMode) {
    return new UserProfile(id, email, name, null);  // null で統一
}
return new UserProfile(id, email, name, notificationSettings);
```

### パターン 2: SELECT 句の脱落

**頻度**: JPA/Spring Data で新しいカラムを追加する際に一般的

```java
// FAIL: 新しいカラムがレスポンスに追加されたが SELECT に含まれていない
@Query("SELECT u.id, u.email, u.name FROM User u WHERE u.id = :id")
Optional<UserProjection> findUserProfile(@Param("id") Long id);
// → notificationSettings は常に null

// PASS: 新しいカラムを明示的に含める、または Entity をそのまま返す
@EntityGraph(attributePaths = {"notificationSettings"})
Optional<User> findById(Long id);
```

### パターン 3: エラー状態のリーク

**頻度**: 中程度 — 既存コンポーネントにエラーハンドリングを追加する際

```java
// FAIL: エラー状態が設定されるが古いデータがクリアされない
catch (Exception e) {
    model.addAttribute("error", "読み込みに失敗しました");
    // reservations にまだ前のタブのデータが表示される！
}

// PASS: エラー時に関連する状態をクリア
catch (Exception e) {
    model.addAttribute("reservations", Collections.emptyList());  // 古いデータをクリア
    model.addAttribute("error", "読み込みに失敗しました");
}
```

### パターン 4: ロールバックなしの楽観的更新

```java
// FAIL: 失敗時にロールバックがない
@Transactional
public void removeItem(Long id) {
    itemRepository.deleteById(id);
    // 外部 API 呼び出しが失敗した場合、DB からは削除済みだが外部システムは不整合
    externalApi.notifyDeletion(id);
}

// PASS: 適切なトランザクション管理とエラーハンドリング
@Transactional
public void removeItem(Long id) {
    Item item = itemRepository.findById(id)
            .orElseThrow(() -> new NotFoundException("アイテムが見つかりません"));
    try {
        externalApi.notifyDeletion(id);
        itemRepository.delete(item);
    } catch (ExternalApiException e) {
        throw new RuntimeException("削除に失敗しました", e);  // トランザクションロールバック
    }
}
```

## 戦略: バグが見つかった場所にテストを書く

100% カバレッジを目指さない。代わりに:

```
/api/user/profile でバグ発見     → profile API のテストを作成
/api/user/messages でバグ発見    → messages API のテストを作成
/api/user/favorites でバグ発見   → favorites API のテストを作成
/api/user/notifications にバグなし → テストは（まだ）書かない
```

**AI 開発でこれが有効な理由:**

1. AI は**同じカテゴリのミス**を繰り返す傾向がある
2. バグは複雑な領域に集中する（認証、マルチパスロジック、状態管理）
3. テスト済みの場合、その正確なリグレッションは**二度と発生しない**
4. テスト数はバグ修正とともに有機的に増加 — 無駄な工数なし

## クイックリファレンス

| AI リグレッションパターン | テスト戦略 | 優先度 |
|---|---|---|
| サンドボックス/本番の不一致 | サンドボックスモードで同じレスポンス形状を検証 | 高 |
| SELECT 句の脱落 | レスポンスの全必須フィールドを検証 | 高 |
| エラー状態のリーク | エラー時の状態クリーンアップを検証 | 中 |
| ロールバックの欠如 | API 失敗時の状態復元を検証 | 中 |
| 型キャストによる null マスク | フィールドが null でないことを検証 | 中 |

## DO / DON'T

**DO:**
- バグ発見直後にテストを書く（可能なら修正前に）
- 実装ではなく API レスポンスの形状をテストする
- 全バグチェックの最初のステップとしてテストを実行する
- テストを高速に保つ（サンドボックスモードで合計 1 秒未満）
- テストに防止するバグの名前を付ける（例: "BUG-R1 リグレッション"）

**DON'T:**
- バグが一度もなかったコードにテストを書く
- 自動テストの代替として AI のセルフレビューを信頼する
- 「モックデータだから」とサンドボックスパスのテストをスキップする
- 単体テストで十分な場合に統合テストを書く
- カバレッジパーセントではなく、リグレッション防止を目指す
