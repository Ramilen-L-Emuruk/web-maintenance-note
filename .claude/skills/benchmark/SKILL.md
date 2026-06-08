---
name: benchmark
description: パフォーマンスベースラインの測定、PR 前後のリグレッション検出、スタック代替案の比較に使用。
origin: ECC
---

# Benchmark — パフォーマンスベースラインとリグレッション検出

## 使用タイミング

- PR の前後でパフォーマンスへの影響を測定する場合
- プロジェクトのパフォーマンスベースラインを設定する場合
- ユーザーから「遅く感じる」と報告を受けた場合
- リリース前 — パフォーマンス目標の達成を確認する場合
- スタックの代替案を比較する場合

## 仕組み

### モード 1: JVM パフォーマンス

JVM メトリクスを測定:

```
1. アプリケーション起動時間の計測
2. JVM メトリクスの計測:
   - ヒープ使用量 — 目標: 最大ヒープの 70% 以下
   - GC 停止時間 — 目標: p99 < 50ms
   - GC 頻度 — 目標: Full GC < 1回/時間
   - スレッドプール使用率 — 目標: 80% 以下
   - クラスロード数
3. リソースサイズの計測:
   - WAR/JAR サイズ
   - 依存関係の総サイズ
   - コネクションプール使用状況
4. メモリリークの検出
5. スレッドデッドロックのチェック
```

### モード 2: API パフォーマンス

API エンドポイントのベンチマーク:

```
1. 各エンドポイントに 100 回リクエスト
2. 計測: p50, p95, p99 レイテンシ
3. 追跡: レスポンスサイズ、ステータスコード
4. 負荷テスト: 10 並列リクエスト
5. SLA 目標との比較
```

### モード 3: ビルドパフォーマンス

開発フィードバックループの計測:

```
1. コールドビルド時間:       mvn clean compile
2. インクリメンタルビルド時間: mvn compile（変更後）
3. テストスイート実行時間:    mvn test
4. 静的解析時間:            mvn checkstyle:check && mvn spotbugs:check
5. パッケージング時間:       mvn package
6. Docker ビルド時間:       docker build .
```

### モード 4: 前後比較

変更の前後で実行し影響を測定:

```
/benchmark baseline    # 現在のメトリクスを保存
# ... 変更を実施 ...
/benchmark compare     # ベースラインと比較
```

出力:
```
| メトリクス | 変更前 | 変更後 | 差分 | 判定 |
|-----------|--------|--------|------|------|
| API p95 | 120ms | 140ms | +20ms | ⚠ WARNING |
| JAR サイズ | 45MB | 43MB | -2MB | ✓ 改善 |
| mvn compile | 12s | 14s | +2s | ⚠ WARNING |
| GC 停止 p99 | 30ms | 28ms | -2ms | ✓ 改善 |
```

### モード 5: JMH マイクロベンチマーク

クリティカルなメソッドのパフォーマンスを精密に計測:

```java
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@Warmup(iterations = 3, time = 1)
@Measurement(iterations = 5, time = 1)
@Fork(1)
public class NormalizeCharacterBenchmark {

    @Benchmark
    public String testFullWidthToHalfWidth() {
        return NormalizeCharacter.toHalfWidth("アイウエオ");
    }

    @Benchmark
    public String testHalfWidthToFullWidth() {
        return NormalizeCharacter.toFullWidth("ｱｲｳｴｵ");
    }
}
```

```bash
# JMH ベンチマーク実行
mvn clean install -DskipTests
java -jar target/benchmarks.jar
```

## 出力

ベースラインを `.ecc/benchmarks/` に JSON として保存。Git 追跡によりチームでベースラインを共有。

## 統合

- CI: 全 PR で `/benchmark compare` を実行
- `springboot-verification` スキルと組み合わせてリリース前の総合チェック
- `springboot-patterns` スキルのパフォーマンス最適化パターンを参照
