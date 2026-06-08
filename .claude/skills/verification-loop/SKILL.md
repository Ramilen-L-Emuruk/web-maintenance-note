---
name: verification-loop
description: Claude Code セッションの包括的な検証システム。ビルド、型チェック、静的解析、テスト、セキュリティスキャン、差分レビューを実施。
origin: ECC
---

# Verification Loop スキル

Claude Code セッションのための包括的な検証システム。

> ※ Spring Boot 固有の検証パターンについては `springboot-verification` スキルも参照。本スキルはフレームワーク非依存のワークフローと Java/Maven での実行例を示す。

## 使用タイミング

以下の場合にこのスキルを呼び出す:
- 機能や重要なコード変更の完了後
- PR 作成前
- 品質ゲートの通過を確認したい場合
- リファクタリング後

## 検証フェーズ

### フェーズ 1: ビルド検証
```bash
# プロジェクトがビルドできるか確認
mvn clean compile 2>&1 | tail -20
```

ビルドが失敗した場合、**停止して修正してから**続行する。

### フェーズ 2: 型チェック（コンパイル検証）
```bash
# Java コンパイラが型エラーを検出（mvn compile に含まれる）
# 追加の静的型チェック
mvn clean compile -Dmaven.compiler.showWarnings=true 2>&1 | head -30
```

全コンパイルエラーを報告。重要なエラーは続行前に修正する。

### フェーズ 3: 静的解析
```bash
# Checkstyle — コーディング規約チェック
mvn checkstyle:check 2>&1 | head -30

# SpotBugs — バグパターン検出
mvn spotbugs:check 2>&1 | head -30

# PMD — コード品質チェック（設定がある場合）
mvn pmd:check 2>&1 | head -30
```

### フェーズ 4: テストスイート
```bash
# カバレッジ付きテスト実行
mvn test jacoco:report 2>&1 | tail -50

# カバレッジ閾値の確認
# 目標: 80% 以上
```

レポート:
- 総テスト数: X
- 成功: X
- 失敗: X
- カバレッジ: X%

### フェーズ 5: セキュリティスキャン
```bash
# シークレットの検出
grep -rn "sk-" --include="*.java" --include="*.properties" --include="*.yml" . 2>/dev/null | head -10
grep -rn "api_key\|apiKey\|password\s*=" --include="*.java" . 2>/dev/null | head -10

# System.out.println の残存チェック
grep -rn "System\.out\.println" --include="*.java" src/ 2>/dev/null | head -10

# 依存関係の脆弱性チェック（設定がある場合）
mvn org.owasp:dependency-check-maven:check 2>&1 | tail -20
```

### フェーズ 6: 差分レビュー
```bash
# 変更内容を確認
git diff --stat
git diff HEAD~1 --name-only
```

変更された各ファイルをレビュー:
- 意図しない変更がないか
- エラーハンドリングの欠如がないか
- 潜在的なエッジケースがないか

## 出力フォーマット

全フェーズの実行後、検証レポートを生成:

```
検証レポート
==================

ビルド:     [PASS/FAIL]
コンパイル:  [PASS/FAIL] (X エラー)
静的解析:   [PASS/FAIL] (X 警告)
テスト:     [PASS/FAIL] (X/Y 成功, Z% カバレッジ)
セキュリティ: [PASS/FAIL] (X 件の問題)
差分:       [X ファイル変更]

総合判定:   [PR 準備完了/未完了]

修正すべき問題:
1. ...
2. ...
```

## 継続モード

長いセッションでは、15分ごとまたは大きな変更後に検証を実行:

```markdown
メンタルチェックポイントを設定:
- 各メソッドの完成後
- コンポーネントの完了後
- 次のタスクに移る前

実行: /verify
```

## フックとの統合

このスキルは PostToolUse フックを補完するが、より深い検証を提供する。
フックは問題を即座に捕捉し、このスキルは包括的なレビューを提供する。
