# ESET Manager 詳細ドキュメント

> **Note**: メインのドキュメントは [ESET_MANAGER_README.md](../ESET_MANAGER_README.md) を参照されたし。
> このファイルは補足的な技術情報を提供する。薬の成分表のようなものだ。

## 内部アーキテクチャ

### クラス構成

ふむ、内部構造を見てみよう。なかなか整理された処方だ。

```
┌─────────────────────────────────────────────────────────────┐
│                     eset_manager.py                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ESETAPIClient                                        │    │
│  │ ├─ __init__(config, dry_run)                        │    │
│  │ ├─ login() → session_token                          │    │
│  │ ├─ logout()                                         │    │
│  │ ├─ get_computers() → List[Dict]                     │    │
│  │ ├─ get_computer_details(uuid) → Dict                │    │
│  │ └─ create_client_task(uuids, task_type, ...) → str  │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ComputerInfoExtractor                               │    │
│  │ └─ extract_info(raw_data) → Dict                    │    │
│  │    ├─ av_version                                    │    │
│  │    ├─ definition_date                               │    │
│  │    ├─ windows_version                               │    │
│  │    ├─ last_boot                                     │    │
│  │    └─ connected                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ESETManager                                         │    │
│  │ ├─ __init__(config, dry_run)                        │    │
│  │ ├─ get_info(computer_names) → List[Dict]            │    │
│  │ └─ execute_task(computer_names, task_type, ...) → str│   │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ CLI (argparse)                                      │    │
│  │ ├─ info subcommand                                  │    │
│  │ └─ task subcommand                                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 処理フロー

#### 情報取得フロー

患者（PC）の状態を診断する流れだ。

```
1. CSVファイル読み込み
   │
   ▼
2. ESETAPIClient.login()
   │  JSON-RPC: RpcAuthLoginRequest
   │
   ▼
3. ESETAPIClient.get_computers()
   │  JSON-RPC: RpcGroupsGetGroupsStructure
   │  → 全PCの基本情報を取得
   │
   ▼
4. CSVのPC名とマッチング
   │  大文字小文字を無視して照合
   │
   ▼
5. 各PCについて詳細情報を取得
   │  ESETAPIClient.get_computer_details(uuid)
   │
   ▼
6. ComputerInfoExtractor.extract_info()
   │  APIレスポンスから必要な情報を抽出
   │
   ▼
7. 結果をCSVに出力
   │
   ▼
8. ESETAPIClient.logout()
```

#### タスク実行フロー

治療（タスク実行）の流れだ。

```
1. CSVファイル読み込み
   │
   ▼
2. ESETAPIClient.login()
   │
   ▼
3. PC名からUUIDを解決
   │  get_computers() でマッチング
   │
   ▼
4. ESETAPIClient.create_client_task()
   │  JSON-RPC: RpcTasksTriggerClientTrigger
   │  ├─ task_type: タスクタイプ番号
   │  ├─ target_uuids: 対象PCのUUID配列
   │  └─ parameters: タスク固有のパラメータ
   │
   ▼
5. タスクID返却
   │
   ▼
6. ESETAPIClient.logout()
```

## JSON-RPC API詳細

### 認証

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "Era.Common.NetworkMessage.ConsoleApi.SessionManagement.RpcAuthLoginRequest",
  "params": {
    "username": "Administrator",
    "password": "secret"
  },
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "session": {
      "token": "abc123...",
      "userId": 1,
      "permissions": [...]
    }
  },
  "id": 1
}
```

### コンピュータ一覧取得

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "Era.Common.NetworkMessage.ConsoleApi.Groups.RpcGroupsGetGroupsStructure",
  "params": {
    "parentGroupUuid": "00000000-0000-0000-0000-000000000000"
  },
  "id": 2
}

// Response (抜粋)
{
  "jsonrpc": "2.0",
  "result": {
    "groups": [...],
    "computers": [
      {
        "uuid": "abc123-def456-...",
        "name": "DESKTOP-ABC001",
        "connected": true,
        "lastSeen": "2025-11-30T09:45:00Z",
        ...
      }
    ]
  },
  "id": 2
}
```

### タスク作成

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "Era.Common.NetworkMessage.ConsoleApi.TasksTriggers.RpcTasksTriggerClientTrigger",
  "params": {
    "taskConfiguration": {
      "type": 11,  // SoftwareUninstallation
      "name": "Uninstall task",
      "description": "Created by eset_manager.py"
    },
    "targets": {
      "computerUuids": ["abc123-def456-...", "ghi789-jkl012-..."]
    },
    "trigger": {
      "type": "Immediately"
    }
  },
  "id": 3
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "taskId": "task-uuid-12345"
  },
  "id": 3
}
```

## エラーハンドリング

### リトライロジック

失敗しても諦めない。薬の効き目は一度では測れぬこともある。

```python
retry_strategy = Retry(
    total=config["retries"],        # デフォルト: 3回
    backoff_factor=0.5,             # 0.5秒, 1秒, 2秒...
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["POST"],
)
```

### エラー分類

| HTTPステータス | 意味 | 対応 |
|---------------|------|------|
| 401 | 認証失敗 | 認証情報確認、再ログイン |
| 403 | 権限不足 | ユーザー権限確認 |
| 404 | リソースなし | PC名/UUID確認 |
| 429 | レート制限 | 自動リトライ |
| 500-504 | サーバーエラー | 自動リトライ |

### 例外処理

```python
class ESETAPIError(Exception):
    """ESET API関連のエラー"""
    pass

class AuthenticationError(ESETAPIError):
    """認証エラー"""
    pass

class ComputerNotFoundError(ESETAPIError):
    """コンピュータが見つからない"""
    pass
```

## カスタマイズ

### ComputerInfoExtractor のカスタマイズ

環境によってAPIレスポンスの形式が異なる場合、`extract_info()`メソッドをカスタマイズする必要がある。薬の調合は環境に合わせて調整するものだ。

```python
class ComputerInfoExtractor:
    @staticmethod
    def extract_info(raw_data: Dict) -> Dict:
        """
        APIレスポンスから必要な情報を抽出する。
        環境に合わせてフィールド名を調整すること。
        """
        # デフォルトの実装
        return {
            "av_version": raw_data.get("productVersion", ""),
            "av_module_version": raw_data.get("moduleVersion", ""),
            "definition_date": raw_data.get("definitionDate", ""),
            "windows_version": raw_data.get("osName", ""),
            "last_boot": raw_data.get("lastBootTime", ""),
            "last_seen": raw_data.get("lastSeen", ""),
            "connected": raw_data.get("connected", False),
        }
```

フィールド名が異なる場合の対応例：

```python
# 例: 古いバージョンのAPIでフィールド名が異なる場合
return {
    "av_version": raw_data.get("product_version") or raw_data.get("productVersion", ""),
    "definition_date": raw_data.get("def_date") or raw_data.get("definitionDate", ""),
    # ...
}
```

### 新しいタスクタイプの追加

```python
# TASK_TYPES に追加
TASK_TYPES = {
    # ... 既存のタスク ...
    "CustomTask": 100,  # カスタムタスクタイプ番号
}

# タスク実行時のパラメータ
python3 eset_manager.py task --csv computers.csv --type CustomTask
```

## パフォーマンスチューニング

### 大量PCの処理

1000台以上のPCを処理する場合の推奨設定だ。大量の患者を診るには準備が必要である。

```bash
# タイムアウトを延長
export ESET_TIMEOUT="120"

# リトライを増やす
export ESET_RETRIES="5"
```

### バッチサイズ

一度のAPIコールで処理するPCの推奨数：
- 情報取得: 制限なし（内部で分割処理）
- タスク実行: 100台程度を推奨

```bash
# CSVを分割して処理
split -l 100 computers.csv batch_
for f in batch_*; do
    python3 eset_manager.py task --csv "$f" --type Update
    sleep 5
done
```

## テスト

### dry-runモード

本番環境で実行する前に、必ずdry-runで確認すること。薬を投与する前に効能を確認するのは当然のことだ。

```bash
# すべての操作をdry-runで確認
python3 eset_manager.py --dry-run info --csv test.csv
python3 eset_manager.py --dry-run task --csv test.csv --type Update
```

### 詳細ログ

```bash
# 詳細ログを有効化
python3 eset_manager.py -v info --csv test.csv 2>&1 | tee debug.log
```

### 単体テスト（例）

```python
import unittest
from eset_manager import ComputerInfoExtractor

class TestComputerInfoExtractor(unittest.TestCase):
    def test_extract_info(self):
        raw = {
            "productVersion": "10.1.2046.0",
            "connected": True,
        }
        result = ComputerInfoExtractor.extract_info(raw)
        self.assertEqual(result["av_version"], "10.1.2046.0")
        self.assertTrue(result["connected"])
```

## 関連ドキュメント

- [ESET_MANAGER_README.md](../ESET_MANAGER_README.md) - メインドキュメント
- [ESET PROTECT API Documentation](https://help.eset.com/protect_install/11.1/api/)
- [ClientTaskConfiguration_Type](https://help.eset.com/protect_install/12.1/api/Era/Common/DataDefinition/Task/ClientTaskConfiguration_Type.html)

ふむ、ここまで読んだか。なかなか勉強熱心だ。毒も薬も知識があってこそ使いこなせるというものだ。
