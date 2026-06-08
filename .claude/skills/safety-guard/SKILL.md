---
name: safety-guard
description: 本番システムでの作業やエージェントの自律実行時に、破壊的操作を防止するスキル。
origin: ECC
---

# Safety Guard — 破壊的操作の防止

## 使用タイミング

- 本番システムでの作業時
- エージェントが自律的に実行されている場合（フルオートモード）
- 特定のディレクトリに編集を制限したい場合
- 機密操作時（マイグレーション、デプロイ、データ変更）

## 仕組み

3つの保護モード:

### モード 1: Careful モード

破壊的コマンドの実行前にインターセプトして警告:

```
監視パターン:
- rm -rf（特に /, ~, またはプロジェクトルート）
- git push --force
- git reset --hard
- git checkout .（全変更を破棄）
- DROP TABLE / DROP DATABASE
- docker system prune
- kubectl delete
- chmod 777
- sudo rm
- npm publish（誤発行）
- --no-verify を含むコマンド
```

検出時: コマンドの動作を表示し、確認を求め、安全な代替案を提案。

### モード 2: Freeze モード

ファイル編集を特定のディレクトリツリーにロック:

```
/safety-guard freeze src/components/
```

`src/components/` 以外への Write/Edit は説明付きでブロック。エージェントを1つのエリアに集中させ、無関係なコードに触れないようにする場合に有用。

### モード 3: Guard モード（Careful + Freeze の組み合わせ）

両方の保護がアクティブ。自律エージェントの最大安全性。

```
/safety-guard guard --dir src/api/ --allow-read-all
```

エージェントは何でも読めるが、書き込みは `src/api/` のみ。破壊的コマンドは全域でブロック。

### ロック解除

```
/safety-guard off
```

## 実装

PreToolUse フックを使用して Bash、Write、Edit、MultiEdit のツール呼び出しをインターセプト。実行を許可する前に、コマンド/パスをアクティブなルールに照合。

## 統合

- `codex -a never` セッションではデフォルトで有効化
- 可観測性リスクスコアリングと組み合わせ
- ブロックされたすべてのアクションを `~/.claude/safety-guard.log` に記録
