# ESET PROTECT On-Prem 11.1 Manager

ふむ、ESET PROTECT On-Prem 11.1のJSON-RPC APIを使って、クライアントPCのモニタリングとリモート操作を行うPythonツールか。ウイルスという毒を検知し、駆除する...薬師としてはなかなか興味深い仕事だ。

## 目次

- [機能概要](#機能概要)
- [動作環境](#動作環境)
- [インストール](#インストール)
- [設定](#設定)
- [使い方](#使い方)
- [実践的なワークフロー](#実践的なワークフロー)
- [CSVフォーマット](#csvフォーマット)
- [TaskType一覧](#tasktype一覧)
- [トラブルシューティング](#トラブルシューティング)
- [セキュリティ](#セキュリティ)
- [API詳細](#api詳細)

## 機能概要

### できること

| 機能 | 説明 | ユースケース |
|------|------|-------------|
| 情報取得 | PCのESET状態を一括取得 | 定期的な健全性診断 |
| アンインストール | ESETをサイレントアンインストール | 問題のあるインストールの処置 |
| インストール | ESETをサイレントインストール | 新規展開、再インストール |
| コマンド実行 | 任意のコマンドを実行 | トラブルシュート、情報収集 |
| 定義更新 | ウイルス定義を更新 | 緊急の解毒剤配布 |
| スキャン | オンデマンドスキャン | セキュリティ監査 |

### 取得できる情報

```
┌─────────────────────────────────────────────────────────────┐
│                    PC Status Information                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📡 接続状態        : Connected / Disconnected               │
│  🛡️ AVバージョン    : ESET Endpoint Security 10.1.2046.0    │
│  📦 モジュール版    : 1234                                   │
│  🦠 定義ファイル    : 2025-11-30 (modules_update)           │
│  💻 Windows版       : Windows 10 Pro 22H2                    │
│  🕐 最終起動        : 2025-11-30 08:30:00                    │
│  📶 最終接続        : 2025-11-30 09:45:00                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### dry-run機能

実際のAPI呼び出しを行わずに動作確認できる。本番環境で実行する前に必ずdry-runで確認することを推奨する。薬を処方する前に効能を確認するのは当然のことだ。

```bash
# dry-runモード（実際には何も実行しない）
python3 eset_manager.py --dry-run task --csv computers.csv --type SoftwareUninstallation

# 出力例
[DRY-RUN] Would execute task 'SoftwareUninstallation' on 5 computers
[DRY-RUN] Target computers: DESKTOP-ABC001, DESKTOP-ABC002, LAPTOP-XYZ001, ...
[DRY-RUN] No API calls were made
```

## 動作環境

| 項目 | 要件 |
|------|------|
| Python | 3.7以上 |
| OS | Linux / Windows |
| ESET | ESET PROTECT On-Prem 11.1 |
| ネットワーク | ESET PROTECTサーバーへのアクセス（ポート2223） |

## インストール

### 1. リポジトリをクローン

```bash
git clone https://github.com/wombat2006/automate_it_hygiene.git
cd automate_it_hygiene
```

### 2. 依存関係をインストール

```bash
pip install -r eset_requirements.txt
```

これだけだ。簡単であろう。

### 依存関係

```
requests>=2.28.0
```

`requests`ライブラリだけで動く。軽量な処方だ。

## 設定

### 方法1: 環境変数（推奨）

環境変数で設定するのが最も安全だ。パスワードを直接ファイルに書くのは毒を放置するようなものである。

```bash
# 必須項目
export ESET_HOST="eset-server.example.com"
export ESET_PORT="2223"
export ESET_USERNAME="Administrator"
export ESET_PASSWORD="your_password"

# オプション項目
export ESET_VERIFY_SSL="false"    # 自己署名証明書の場合
export ESET_USE_HTTP="true"       # HTTPを使用する場合
export ESET_TIMEOUT="30"          # タイムアウト（秒）
export ESET_RETRIES="3"           # リトライ回数
```

#### シェルスクリプトで設定を読み込む例

```bash
# eset_env.sh
#!/bin/bash
export ESET_HOST="eset-server.example.com"
export ESET_PORT="2223"
export ESET_USERNAME="Administrator"
export ESET_PASSWORD="$(cat /secure/path/to/password)"
export ESET_USE_HTTP="true"

# 使い方
source eset_env.sh
python3 eset_manager.py info --csv computers.csv
```

### 方法2: 設定ファイル

設定ファイルを使う場合は、パーミッションに細心の注意を払うこと。

**Linux**: `~/.config/eset_manager/config.json`
**Windows**: `%APPDATA%\eset_manager\config.json`

```json
{
    "host": "eset-server.example.com",
    "port": 2223,
    "username": "Administrator",
    "password": "your_password",
    "verify_ssl": false,
    "use_http": true,
    "timeout": 30,
    "retries": 3
}
```

```bash
# Linuxの場合、パーミッションを設定すること
chmod 600 ~/.config/eset_manager/config.json
```

### 設定項目一覧

| 項目 | 環境変数 | 設定ファイル | デフォルト | 説明 |
|------|----------|-------------|-----------|------|
| ホスト | `ESET_HOST` | `host` | (必須) | ESETサーバーのホスト名 |
| ポート | `ESET_PORT` | `port` | `2223` | APIポート |
| ユーザー名 | `ESET_USERNAME` | `username` | (必須) | 管理者ユーザー名 |
| パスワード | `ESET_PASSWORD` | `password` | (必須) | パスワード |
| SSL検証 | `ESET_VERIFY_SSL` | `verify_ssl` | `true` | SSL証明書を検証するか |
| HTTP使用 | `ESET_USE_HTTP` | `use_http` | `false` | HTTPSの代わりにHTTPを使用 |
| タイムアウト | `ESET_TIMEOUT` | `timeout` | `30` | リクエストタイムアウト（秒） |
| リトライ | `ESET_RETRIES` | `retries` | `3` | 失敗時のリトライ回数 |

## 使い方

### 基本的なコマンド構造

```bash
python3 eset_manager.py [オプション] <サブコマンド> [サブコマンドオプション]

# グローバルオプション
#   -v, --verbose    詳細ログを出力
#   --dry-run        実際のAPI呼び出しを行わない
#   --config FILE    設定ファイルを指定

# サブコマンド
#   info             PC情報を取得
#   task             タスクを実行
```

### 情報取得 (info)

```bash
# 基本的な使い方
python3 eset_manager.py info --csv computers.csv --output results.csv

# 詳細ログ付き
python3 eset_manager.py -v info --csv computers.csv --output results.csv

# dry-runモード
python3 eset_manager.py --dry-run info --csv computers.csv --output results.csv

# 標準出力に表示（ファイル出力なし）
python3 eset_manager.py info --csv computers.csv
```

### タスク実行 (task)

```bash
# アンインストール
python3 eset_manager.py task --csv computers.csv --type SoftwareUninstallation

# インストール
python3 eset_manager.py task --csv computers.csv --type SoftwareInstallation \
    --package "\\\\server\\share\\eset_installer.msi"

# コマンド実行
python3 eset_manager.py task --csv computers.csv --type RunCommand \
    --command "ipconfig /all"

# ウイルス定義更新
python3 eset_manager.py task --csv computers.csv --type Update

# オンデマンドスキャン
python3 eset_manager.py task --csv computers.csv --type OnDemandScan
```

#### タスクオプション

| オプション | 説明 | 対象タスク |
|-----------|------|-----------|
| `--package` | インストーラーのパス | SoftwareInstallation |
| `--command` | 実行するコマンド | RunCommand |

## 実践的なワークフロー

### ワークフロー1: 日次ヘルスチェック

毎朝、ESETの健全性をチェックするワークフローだ。予防は治療に勝る。

```bash
#!/bin/bash
# daily_health_check.sh

DATE=$(date +%Y%m%d)
OUTPUT_DIR="/var/log/eset_manager"
mkdir -p "$OUTPUT_DIR"

# 設定を読み込む
source /etc/eset_manager/env.sh

# 全PCの状態を取得
python3 /opt/eset_manager/eset_manager.py info \
    --csv /etc/eset_manager/all_computers.csv \
    --output "$OUTPUT_DIR/health_$DATE.csv"

# 問題のあるPCを抽出（例：接続していないPC）
echo "=== Disconnected PCs ==="
grep -i "false" "$OUTPUT_DIR/health_$DATE.csv" | cut -d',' -f1

# 古い定義ファイルを持つPCを抽出（7日以上前）
echo "=== Outdated Definitions ==="
# ... 日付比較のロジック
```

### ワークフロー2: 問題PCの処置

ESETが正常に動作していないPCを処置するワークフローだ。

```bash
#!/bin/bash
# repair_pc.sh

if [ -z "$1" ]; then
    echo "Usage: $0 <pc_name>"
    exit 1
fi

PC_NAME="$1"
TEMP_CSV=$(mktemp)
echo "name" > "$TEMP_CSV"
echo "$PC_NAME" >> "$TEMP_CSV"

source /etc/eset_manager/env.sh

echo "Step 1: Checking current status..."
python3 eset_manager.py info --csv "$TEMP_CSV"

echo "Step 2: Uninstalling ESET..."
python3 eset_manager.py task --csv "$TEMP_CSV" --type SoftwareUninstallation

echo "Waiting 5 minutes for uninstall to complete..."
sleep 300

echo "Step 3: Installing ESET..."
python3 eset_manager.py task --csv "$TEMP_CSV" \
    --type SoftwareInstallation \
    --package "\\\\fileserver\\eset\\eset_installer.msi"

echo "Step 4: Verifying installation..."
sleep 300
python3 eset_manager.py info --csv "$TEMP_CSV"

rm "$TEMP_CSV"
echo "Done!"
```

### ワークフロー3: 緊急ウイルス定義更新

新しいマルウェアが発見されたときに、全PCの定義を緊急更新するワークフローだ。新たな毒が発見されたら、直ちに解毒剤を配布せねばならぬ。

```bash
#!/bin/bash
# emergency_update.sh

source /etc/eset_manager/env.sh

echo "=== Emergency Virus Definition Update ==="
echo "Starting at $(date)"

# まずdry-runで確認
echo "Dry-run check..."
python3 eset_manager.py --dry-run task \
    --csv /etc/eset_manager/all_computers.csv \
    --type Update

read -p "Proceed with actual update? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python3 eset_manager.py -v task \
        --csv /etc/eset_manager/all_computers.csv \
        --type Update
    echo "Update task submitted at $(date)"
else
    echo "Cancelled"
fi
```

### ワークフロー4: バッチ処理（大量PC）

1000台以上のPCを処理する場合は、CSVを分割して処理することを推奨する。一度に大量の薬を投与すると副作用が出かねない。

```bash
#!/bin/bash
# batch_process.sh

BATCH_SIZE=100
INPUT_CSV="all_computers.csv"
TASK_TYPE="Update"

# ヘッダーを取得
head -1 "$INPUT_CSV" > header.csv

# データ行を分割
tail -n +2 "$INPUT_CSV" | split -l $BATCH_SIZE - batch_

# 各バッチを処理
for batch in batch_*; do
    echo "Processing $batch..."
    cat header.csv "$batch" > "temp_$batch.csv"

    python3 eset_manager.py task \
        --csv "temp_$batch.csv" \
        --type "$TASK_TYPE"

    rm "temp_$batch.csv" "$batch"

    # API負荷を避けるため少し待つ
    sleep 10
done

rm header.csv
echo "All batches processed!"
```

## CSVフォーマット

### 入力CSV

```csv
name
DESKTOP-ABC001
DESKTOP-ABC002
LAPTOP-XYZ001
SERVER-PROD01
WORKSTATION-DEV
```

対応するカラム名（大文字小文字不問）:
- `name`
- `computer`
- `hostname`
- `pc`

どれを使っても問題ない。柔軟に対応している。

### 出力CSV

| カラム | 型 | 説明 | 例 |
|--------|-----|------|-----|
| `name` | string | コンピュータ名 | `DESKTOP-ABC001` |
| `uuid` | string | ESET内部UUID | `abc123-def456-...` |
| `connected` | boolean | 疎通状態 | `True` / `False` |
| `av_version` | string | AVバージョン | `10.1.2046.0` |
| `av_module_version` | string | モジュール版 | `1234` |
| `definition_date` | datetime | 定義更新日 | `2025-11-30T12:00:00` |
| `windows_version` | string | Windows版 | `Windows 10 Pro` |
| `last_boot` | datetime | 最終起動 | `2025-11-30T08:30:00` |
| `last_seen` | datetime | 最終接続 | `2025-11-30T09:45:00` |
| `error` | string | エラー | (空欄またはエラーメッセージ) |

## TaskType一覧

ESET PROTECT On-Prem 11.1で使用できるタスクタイプだ。

| 番号 | 名称 | 説明 | よく使う |
|------|------|------|---------|
| 1 | `ExportConfiguration` | 設定エクスポート | |
| 2 | `OnDemandScan` | オンデマンドスキャン | ✅ |
| 3 | `QuarantineManagement` | 隔離管理 | |
| 4 | `QuarantineUpload` | 隔離ファイルアップロード | |
| 5 | `Update` | ウイルス定義更新 | ✅ |
| 6 | `UpdateRollback` | 更新ロールバック | |
| 7 | `SysInspectorScript` | SysInspectorスクリプト | |
| 8 | `SysInspectorLogRequest` | SysInspectorログ要求 | |
| 9 | `RunCommand` | コマンド実行 | ✅ |
| 10 | `SoftwareInstallation` | ソフトウェアインストール | ✅ |
| 11 | `SoftwareUninstallation` | ソフトウェアアンインストール | ✅ |
| 12 | `SystemUpdate` | OSアップデート | |

## トラブルシューティング

### 接続できない

```
ERROR: Connection refused to eset-server.example.com:2223
```

**確認ポイント:**
1. ホスト名/IPアドレスが正しいか
2. ポート2223が開放されているか (`telnet eset-server 2223`)
3. ファイアウォールで許可されているか
4. ESET PROTECTサービスが起動しているか

### SSL証明書エラー

```
ERROR: SSL: CERTIFICATE_VERIFY_FAILED
```

**処方箋:**

```bash
# 方法1: SSL検証を無効化（自己署名証明書の場合）
export ESET_VERIFY_SSL="false"

# 方法2: HTTPを使用（社内ネットワークのみ）
export ESET_USE_HTTP="true"
```

### 認証エラー

```
ERROR: Authentication failed
```

**確認ポイント:**
1. ユーザー名/パスワードが正しいか
2. ユーザーにESET PROTECT管理者権限があるか
3. アカウントがロックされていないか

### コンピュータが見つからない

```
WARNING: Computer 'DESKTOP-XYZ999' not found in ESET PROTECT
```

**確認ポイント:**
1. ESET PROTECTコンソールでPCが登録されているか確認
2. PC名のスペルミス（大文字小文字は無視される）
3. PCがESET PROTECTに接続したことがあるか

### タイムアウト

```
ERROR: Request timed out after 30 seconds
```

**処方箋:**

```bash
# タイムアウトを延長
export ESET_TIMEOUT="60"

# またはリトライ回数を増やす
export ESET_RETRIES="5"
```

### APIレスポンスのフィールド名が異なる

環境によってAPIレスポンスの形式が異なることがある。

```bash
# 詳細ログでレスポンスを確認
python3 eset_manager.py -v info --csv computers.csv 2>&1 | grep -A 50 "API Response"
```

必要に応じて `ComputerInfoExtractor.extract_info()` メソッドを調整すること。

## セキュリティ

### パスワード管理

**やってはいけないこと（毒を放置するようなものだ）:**
```bash
# ❌ コマンドライン引数でパスワードを渡す（履歴に残る）
python3 eset_manager.py --password "secret123" info ...

# ❌ スクリプトに直接パスワードを書く
ESET_PASSWORD="secret123"
```

**やるべきこと:**
```bash
# ✅ 環境変数で渡す（ファイルから読み込む）
export ESET_PASSWORD="$(cat /secure/path/password.txt)"

# ✅ 設定ファイルを使う（パーミッション600）
chmod 600 ~/.config/eset_manager/config.json

# ✅ シークレット管理ツールを使う
export ESET_PASSWORD="$(vault kv get -field=password secret/eset)"
```

### ログのマスキング

パスワードはログ出力時に自動的にマスクされる。

```
DEBUG: API Request: {"username": "Administrator", "password": "********"}
```

### ネットワークセキュリティ

- 可能な限りHTTPSを使用すること
- HTTPを使う場合は、社内ネットワーク内に限定すること
- ファイアウォールでESETサーバーへのアクセスを制限すること

## API詳細

### 使用しているAPI

このツールはESET PROTECT On-Prem 11.1のJSON-RPC APIを使用している。

```
Base URL: http(s)://{host}:{port}/api
Method: POST
Content-Type: application/json
```

### 主要なAPIメソッド

| メソッド | 説明 |
|---------|------|
| `Era.Common.NetworkMessage.ConsoleApi.SessionManagement.RpcAuthLoginRequest` | ログイン |
| `Era.Common.NetworkMessage.ConsoleApi.Groups.RpcGroupsGetGroupsStructure` | グループ構造取得 |
| `Era.Common.NetworkMessage.ConsoleApi.TasksTriggers.RpcTasksTriggerClientTrigger` | タスク実行 |

### セッション管理

APIはセッションベースで動作する。

```
1. ログイン → セッショントークン取得
2. 各API呼び出し時にトークンをCookieで送信
3. 処理完了後、自動的にセッション終了
```

## ライセンス

MIT License

## 参考資料

- [ESET PROTECT On-Prem API Documentation](https://help.eset.com/protect_install/11.1/api/)
- [ESET PROTECT On-Prem 11.1 API Examples](https://help.eset.com/protect_install/11.1/api_examples/)
- [ClientTaskConfiguration_Type Enum](https://help.eset.com/protect_install/12.1/api/Era/Common/DataDefinition/Task/ClientTaskConfiguration_Type.html)

何かわからないことがあれば、これらのドキュメントを参照するといい。それでもわからなければ、GitHubのIssuesで聞くがよい。私も暇ではないが、薬の調合くらいなら教えてやれる。
