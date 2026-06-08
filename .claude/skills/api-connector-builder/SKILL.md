---
name: api-connector-builder
description: ターゲットリポジトリの既存インテグレーションパターンに正確に合わせて新しい API コネクターやプロバイダーを構築する。二つ目のアーキテクチャを発明せずに統合を追加する際に使用。
origin: ECC direct-port adaptation
version: "1.0.0"
---

# API コネクタービルダー

汎用 HTTP クライアントではなく、リポジトリネイティブなインテグレーション面を追加するジョブに使用する。

ホストリポジトリのパターンに合わせることがポイント:

- コネクターレイアウト
- 設定スキーマ
- 認証モデル
- エラーハンドリング
- テストスタイル
- 登録 / ディスカバリー接続

## 使用タイミング

- 「このプロジェクトに Jira コネクターを構築して」
- 「既存のパターンに従って Slack プロバイダーを追加して」
- 「この API 用の新しいインテグレーションを作成して」
- 「リポジトリのコネクタースタイルに合わせたプラグインを構築して」

## ガードレール

- リポジトリに既存のインテグレーションアーキテクチャがある場合、新しいものを発明しない
- ベンダードキュメントだけから始めない。まずリポジトリ内の既存コネクターから始める
- リポジトリがレジストリ接続、テスト、ドキュメントを期待している場合、トランスポートコードで止めない
- リポジトリに新しい現行パターンがある場合、古いコネクターをカーゴカルトしない

## ワークフロー

### 1. ハウススタイルを学ぶ

最低2つの既存コネクター / プロバイダーを調査し、以下をマッピング:

- ファイルレイアウト
- 抽象化の境界
- 設定モデル
- リトライ / ページネーション規約
- レジストリフック
- テストフィクスチャと命名

### 2. ターゲットインテグレーションの範囲を絞る

リポジトリが実際に必要とする面のみを定義:

- 認証フロー
- 主要エンティティ
- コア CRUD 操作
- ページネーションとレート制限
- Webhook またはポーリングモデル

### 3. リポジトリネイティブなレイヤーで構築

Java/Spring Boot での典型的なスライス:

```text
src/main/java/com/example/integration/
  jira/
    JiraConfig.java           # 設定（@ConfigurationProperties）
    JiraClient.java           # HTTP クライアント（RestClient / WebClient）
    JiraMapper.java           # エンティティマッピング（DTO ↔ ドメイン）
    JiraConnector.java        # コネクターエントリポイント（@Service）
    JiraConnectorAutoConfig.java  # 自動登録（@Configuration）

src/test/java/com/example/integration/
  jira/
    JiraClientTest.java       # 単体テスト（Mockito）
    JiraConnectorIT.java      # 統合テスト（WireMock）
```

### 4. ソースパターンに対して検証

新しいコネクターはコードベース内で自然に見えるべきであり、別のエコシステムからインポートされたようには見えないこと。

## 参考構造

### Spring Boot コネクタースタイル

```text
src/main/java/com/example/connector/
  existing/
    ExistingConfig.java
    ExistingClient.java
    ExistingConnector.java
```

### Spring Boot プロバイダースタイル

```text
src/main/java/com/example/provider/
  existing/
    ExistingProviderConfig.java
    ExistingProvider.java
    ExistingProviderAutoConfiguration.java
```

## 品質チェックリスト

- [ ] リポジトリ内の既存インテグレーションパターンに一致
- [ ] 設定バリデーションが存在（`@Validated` + `@ConfigurationProperties`）
- [ ] 認証とエラーハンドリングが明示的
- [ ] ページネーション / リトライの動作がリポジトリ規約に従う
- [ ] レジストリ / ディスカバリー接続が完了（`@Configuration` / `@ConditionalOnProperty`）
- [ ] テストがホストリポジトリのスタイルに準拠（JUnit 5 + Mockito / WireMock）
- [ ] ドキュメント / サンプルがリポジトリの期待に従って更新

## 関連スキル

- `backend-patterns`
- `springboot-patterns`
