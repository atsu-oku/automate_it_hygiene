# Code Expert

ふむ、AIの力を借りてコードレビューやリファクタリングをするツールか。Wall-Bounceという複数のLLMを使った分析システムを採用している。なかなか興味深い処方だ。

> このツールは[Scripter](https://github.com/wombat2006/scripter)というプロジェクトのWall-Bounce技術を受け継いでいるらしい。血筋というものは侮れぬ。

## 目次

- [できること](#できること)
- [クイックスタート](#クイックスタート)
- [詳細な使い方](#詳細な使い方)
- [ESET Manager](#eset-manager)
- [Wall-Bounce技術について](#wall-bounce技術について)
- [アーキテクチャ](#アーキテクチャ)
- [開発者向け情報](#開発者向け情報)
- [FAQ](#faq)

## できること

### コード分析機能

| 機能 | 説明 | コマンド例 |
|------|------|-----------|
| コードレビュー | セキュリティ、パフォーマンス、可読性、ベストプラクティスを診断 | `code-expert review file.ts` |
| リファクタリング | コードの動作を変えずに品質を向上させる | `code-expert refactor file.ts` |
| デバッグ | バグを特定し、処方箋を提示 | `code-expert debug file.ts` |
| 最適化 | パフォーマンスと効率を改善 | `code-expert optimize file.ts` |
| コード解説 | 複雑なコードの仕組みを解明 | `code-expert explain file.ts` |
| テスト生成 | 包括的なテストケースを調合 | `code-expert test file.ts` |

### マルチLLM分析

3つのLLMが順番に分析を行う仕組みだ。それぞれの得意分野を活かすことで、単体では見落としがちな問題も発見できる。毒を以て毒を制す...いや、これは少し違うか。

```
Round 1: GPT-5 Codex / Qwen3 Coder  → コード構造理解と初期診断
Round 2: Claude Sonnet 4            → 深い洞察と改善処方
Round 3: Gemini 2.5 Pro             → 最終検証と統合
```

## クイックスタート

### 1. インストール

```bash
# グローバルインストール
npm install -g code-expert

# または、ローカルで使う場合
git clone https://github.com/wombat2006/automate_it_hygiene.git
cd automate_it_hygiene
npm install
npm run build
```

### 2. 設定

```bash
# 対話形式で設定
code-expert config

# または、設定ファイルを直接作成
cat > ~/.code-expert-config.json << 'EOF'
{
  "apiEndpoint": "https://techsapo.com/api/v1/wall-bounce",
  "auth": {
    "username": "your-username",
    "password": "your-password"
  }
}
EOF
```

### 3. 使ってみる

```bash
# コードレビュー
code-expert review src/main.ts

# リファクタリング
code-expert refactor src/utils.ts --goals readability

# インタラクティブモード
code-expert interactive
```

## 詳細な使い方

### コードレビュー

セキュリティ、パフォーマンス、ベストプラクティスの観点から診断を行う：

```bash
# 基本的な使い方
code-expert review myfile.ts

# 特定の分野に絞る場合
code-expert review myfile.ts --focus security,performance

# 重要度でフィルター
code-expert review myfile.ts --severity high

# 結果を保存する場合
code-expert review myfile.ts -o review-results.md

# 標準入力から
cat myfile.ts | code-expert review --language typescript

# ディレクトリ全体をレビュー
code-expert review src/ --recursive
```

#### レビュー観点一覧

| 観点 | 説明 | 診断内容 |
|------|------|-------------|
| `security` | セキュリティ | SQLインジェクション、XSS、認証の欠陥、機密情報の露出 |
| `performance` | パフォーマンス | 非効率な処理、N+1クエリ、メモリリーク、最適化の余地 |
| `readability` | 可読性 | 命名規則、関数の長さ、複雑さ、コメントの適切さ |
| `best-practices` | ベストプラクティス | 言語固有のパターン、規約、アンチパターンの検出 |
| `bugs` | バグ | ロジックエラー、エッジケース、null/undefined処理 |
| `style` | スタイル | コードフォーマット、一貫性、インデント |
| `architecture` | アーキテクチャ | デザインパターン、モジュール性、依存関係 |

#### 出力例

```
Code Review Results
═══════════════════════════════════════════════════════════════

📊 Summary
   Total Issues: 5
   High: 2 | Medium: 2 | Low: 1

🔴 [HIGH] security (Line 45)
   SQL injection vulnerability in user query

   問題のコード:
   const query = `SELECT * FROM users WHERE id = ${userId}`;

   処方箋:
   const query = 'SELECT * FROM users WHERE id = ?';
   db.query(query, [userId]);

   所見: ユーザー入力を直接SQLに埋め込むのは毒を盛られるようなものだ。
   パラメータ化クエリで解毒すべきである。

🔴 [HIGH] security (Line 78)
   Weak password validation

   問題のコード:
   if (password.length >= 6) { ... }

   処方箋:
   const isValid = password.length >= 12 &&
                   /[A-Z]/.test(password) &&
                   /[a-z]/.test(password) &&
                   /[0-9]/.test(password) &&
                   /[!@#$%^&*]/.test(password);

   所見: 6文字では薬効が足りぬ。現代のセキュリティ基準では最低12文字、
   大文字小文字数字記号を含める必要がある。

🟡 [MEDIUM] performance (Line 120)
   N+1 query detected in loop
   ...

═══════════════════════════════════════════════════════════════
Wall-Bounce Analysis: 3 rounds completed
Models: GPT-5 Codex → Claude Sonnet 4 → Gemini 2.5 Pro
```

### コードリファクタリング

コードの体質改善を行う：

```bash
# 基本的な使い方
code-expert refactor myfile.ts

# 特定の目標がある場合
code-expert refactor myfile.ts --goals readability,performance

# リファクタリング後のコードを保存
code-expert refactor myfile.ts -o refactored.ts

# 差分だけを表示
code-expert refactor myfile.ts --diff-only

# ドライラン（変更を適用しない）
code-expert refactor myfile.ts --dry-run
```

#### リファクタリング目標一覧

| 目標 | 説明 | 適用される処方 |
|------|------|---------------|
| `readability` | 可読性向上 | 明確な命名、関数の分割、コメント追加 |
| `performance` | 性能改善 | アルゴリズム最適化、キャッシュ導入、データ構造改善 |
| `maintainability` | 保守性向上 | DRY原則、モジュール化、テスト容易性 |
| `dry` | 重複排除 | 共通処理の抽出、ユーティリティ関数化 |
| `solid` | SOLID原則適用 | 単一責任、開放閉鎖、依存性逆転など |
| `simplify` | 簡素化 | 複雑さ軽減、不要コード削除、条件式の簡略化 |
| `modernize` | 最新化 | 新しい言語機能の活用、非推奨APIの置換 |

#### 出力例

```
Refactoring Results
═══════════════════════════════════════════════════════════════

📊 Summary
   Optimized algorithm from O(n²) to O(n log n)
   Improvements: 3 | Lines changed: 45

✨ Improvement 1: Hash map lookup (Impact: 9/10)

   Before:
   for (const item of items) {
     for (const other of items) {
       if (item.id === other.parentId) { ... }
     }
   }

   After:
   const itemMap = new Map(items.map(i => [i.id, i]));
   for (const item of items) {
     const parent = itemMap.get(item.parentId);
     if (parent) { ... }
   }

   所見: ネストしたループをハッシュマップに置き換えた。
   O(n²) → O(n) となり、1000件のデータで約100倍速くなる。
   薬の効き目は配合次第というわけだ。

✨ Improvement 2: Memoization (Impact: 8/10)
   ...

═══════════════════════════════════════════════════════════════
```

### インタラクティブモード

複数の操作を連続で行いたいときに便利だ：

```bash
code-expert interactive
# または
code-expert i
```

```
🤖 Code Expert Interactive Mode
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commands:
  review <file>     - コードレビュー
  refactor <file>   - リファクタリング
  explain <file>    - コード解説
  debug <file>      - デバッグ支援
  optimize <file>   - 最適化
  test <file>       - テスト生成
  help              - ヘルプ表示
  exit              - 終了

> review src/auth.ts --focus security
[レビュー結果が表示される]

> refactor src/auth.ts
[リファクタリング提案が表示される]

> exit
ふむ、また何かあれば呼ぶといい。
```

## ESET Manager

このリポジトリには、ESET PROTECT On-Prem 11.1を管理するPythonツールも含まれている。

### 概要

社内PCにインストールされているESETアンチウイルスの状態を監視し、問題があればリモートで処置できる。毒（ウイルス）を検知して解毒（駆除）する...まさに薬師の仕事に通じるものがある。

### 主な機能

- **情報取得**: CSVファイルに記載されたPC名のESET状態を一括取得
- **リモートタスク**: アンインストール、インストール、ウイルス定義更新など
- **dry-run**: 実際のAPI呼び出しなしで動作確認

### クイックスタート

```bash
# 依存関係インストール
pip install -r eset_requirements.txt

# 設定
export ESET_HOST="eset-server.example.com"
export ESET_PORT="2223"
export ESET_USERNAME="Administrator"
export ESET_PASSWORD="your_password"
export ESET_USE_HTTP="true"  # HTTPを使用する場合

# 情報取得
python3 eset_manager.py info --csv computers.csv --output results.csv

# タスク実行（dry-run）
python3 eset_manager.py --dry-run task --csv computers.csv --type SoftwareUninstallation
```

詳しくは [ESET_MANAGER_README.md](ESET_MANAGER_README.md) を参照されたし。

## Wall-Bounce技術について

Wall-Bounceは、複数のLLMを順番に使って分析精度を高める技術だ。壁にボールを跳ね返すように、各LLMの結果を次のLLMに渡して、より深い分析を行う。

### 仕組み

```
┌─────────────────────────────────────────────────────────────┐
│                    Wall-Bounce System                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [User Query]                                                │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────┐                                            │
│  │ Round 1     │  GPT-5 Codex / Qwen3 Coder                │
│  │ 初期診断    │  → コード構造理解、基本的な問題検出        │
│  └─────────────┘                                            │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────┐                                            │
│  │ Round 2     │  Claude Sonnet 4                           │
│  │ 精密検査    │  → 詳細な洞察、改善処方、エッジケース検討  │
│  └─────────────┘                                            │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────┐                                            │
│  │ Round 3     │  Gemini 2.5 Pro                            │
│  │ 最終診断    │  → 結果統合、矛盾解消、最終レポート生成    │
│  └─────────────┘                                            │
│       │                                                      │
│       ▼                                                      │
│  [Final Report]                                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### なぜ複数のLLMを使うのか

1. **多角的な視点**: 各LLMには得意分野がある。複数を組み合わせることで、見落としを減らせる。異なる生薬を配合して効能を高めるようなものだ。

2. **相互検証**: 1つのLLMが見逃した問題を、別のLLMが発見することがある。毒見役を複数置くのと同じ理屈である。

3. **深い分析**: 前のラウンドの結果を踏まえて、次のラウンドでより深く掘り下げられる。

4. **信頼性向上**: 複数のLLMが同じ問題を指摘すれば、その問題は確実に対処すべきだと判断できる。

## アーキテクチャ

```
automate_it_hygiene/
├── src/                          # TypeScript ソースコード
│   ├── cli.ts                    # CLIエントリーポイント
│   ├── core/
│   │   ├── types.ts              # 型定義
│   │   └── wall-bounce-client.ts # Wall-Bounce APIクライアント
│   └── features/
│       ├── code-reviewer.ts      # コードレビュー
│       ├── code-refactorer.ts    # リファクタリング
│       ├── code-debugger.ts      # デバッグ支援
│       ├── code-optimizer.ts     # 最適化
│       ├── code-explainer.ts     # コード解説
│       └── test-generator.ts     # テスト生成
│
├── eset_manager.py               # ESET管理ツール（Python）
├── eset_requirements.txt         # Python依存関係
├── eset_config.json.example      # ESET設定サンプル
├── eset_computers.csv.example    # 入力CSVサンプル
│
├── docs/
│   └── ESET_MANAGER.md           # ESET Manager詳細ドキュメント
│
├── ESET_MANAGER_README.md        # ESET Manager README
├── CLAUDE.md                     # Claude Code ガイド
└── package.json
```

## 開発者向け情報

### セットアップ

```bash
git clone https://github.com/wombat2006/automate_it_hygiene.git
cd automate_it_hygiene
npm install
npm run build
```

### コマンド一覧

```bash
# 開発
npm run dev          # 開発モードで実行
npm run build        # TypeScriptをビルド
npm run watch        # ファイル変更を監視してビルド

# テスト
npm test             # テスト実行
npm run test:watch   # テストをwatchモードで実行
npm run test:coverage # カバレッジレポート生成

# 品質チェック
npm run lint         # ESLintチェック
npm run lint:fix     # ESLint自動修正
npm run type-check   # 型チェック
npm run validate     # 全チェック実行
```

### 対応言語

| 言語 | 拡張子 | サポートレベル |
|------|--------|---------------|
| TypeScript | `.ts`, `.tsx` | 完全サポート |
| JavaScript | `.js`, `.jsx` | 完全サポート |
| Python | `.py` | 完全サポート |
| Java | `.java` | 完全サポート |
| Go | `.go` | 完全サポート |
| Rust | `.rs` | 完全サポート |
| C++ | `.cpp`, `.hpp`, `.h` | 完全サポート |
| C# | `.cs` | 完全サポート |
| Ruby | `.rb` | 基本サポート |
| PHP | `.php` | 基本サポート |

## FAQ

### Q: 無料で使えるのか？

A: Wall-Bounce APIの利用には認証情報が必要だ。TechSapoのアカウントを作成し、API認証情報を取得する必要がある。

### Q: オフラインで使えるのか？

A: 残念ながら、LLM分析にはインターネット接続が必要だ。ただし、ESET Managerは社内ネットワークのみで動作する。

### Q: 自分のコードがどこかに保存されるのか？

A: 分析のためにWall-Bounce APIにコードが送信されるが、分析後は保存されない。詳細はTechSapoのプライバシーポリシーを確認されたし。

### Q: どのくらいの精度があるのか？

A: 3つのLLMを組み合わせることで、単一のLLMよりも高い精度を達成している。ただし、最終的な判断は人間がすべきだ。AIの提案は参考として使うこと。毒も薬も使い方次第というものだ。

### Q: 大きなファイルでも使えるのか？

A: ファイルサイズには制限がある（詳細はAPIドキュメント参照）。大きなファイルは分割して分析することを推奨する。

### Q: エラーが出たらどうすればいいのか？

A: まず `--verbose` オプションで詳細なログを確認するといい。それでも解決しない場合は、GitHub Issuesに報告されたし。

## ライセンス

MIT License - 詳細は[LICENSE](LICENSE)を参照。

## 関連プロジェクト

- [Scripter](https://github.com/wombat2006/scripter) - AIスクリプトジェネレーター（親プロジェクト）
- [TechSapo](https://techsapo.com) - Wall-Bounce APIプラットフォーム

## サポート

- GitHub Issues: [automate_it_hygiene/issues](https://github.com/wombat2006/automate_it_hygiene/issues)
- Email: support@techsapo.com
- ドキュメント: [techsapo.com/docs](https://techsapo.com/docs)

困ったことがあれば遠慮なく聞くといい。私も暇ではないが、薬の調合くらいなら教えてやれる。

---

**TechSapo Wall-Bounce Technology搭載**

ふむ、なかなか贅沢な処方だ。試してみるといい。
