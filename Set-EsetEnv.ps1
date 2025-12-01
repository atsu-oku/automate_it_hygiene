<#
.SYNOPSIS
    ESET Manager用の環境変数を安全に設定するスクリプト

.DESCRIPTION
    パスワードをSecureStringとして入力し、環境変数に設定する。
    履歴やログにパスワードが残らないよう配慮している。

.EXAMPLE
    # 対話形式で設定
    .\Set-EsetEnv.ps1

.EXAMPLE
    # パラメータ指定で設定（パスワードは対話入力）
    .\Set-EsetEnv.ps1 -Host "eset-server.example.com" -Username "admin" -Domain "CONTOSO"

.EXAMPLE
    # 設定ファイルから読み込み
    .\Set-EsetEnv.ps1 -ConfigFile ".\eset_config.json"

.NOTES
    薬を調合する前に、材料を正しく準備することが肝要だ。
#>

[CmdletBinding(DefaultParameterSetName = 'Interactive')]
param(
    [Parameter(ParameterSetName = 'Manual')]
    [string]$EsetHost,

    [Parameter(ParameterSetName = 'Manual')]
    [int]$Port = 2223,

    [Parameter(ParameterSetName = 'Manual')]
    [string]$Username,

    [Parameter(ParameterSetName = 'Manual')]
    [string]$Domain,

    [Parameter(ParameterSetName = 'Manual')]
    [switch]$UseHttp,

    [Parameter(ParameterSetName = 'Manual')]
    [switch]$SkipSslVerify,

    [Parameter(ParameterSetName = 'ConfigFile')]
    [string]$ConfigFile,

    [Parameter()]
    [switch]$Persist,

    [Parameter()]
    [switch]$ShowCurrent
)

# 現在の設定を表示
if ($ShowCurrent) {
    Write-Host "`n=== 現在のESET環境変数 ===" -ForegroundColor Cyan
    @(
        "ESET_HOST",
        "ESET_PORT",
        "ESET_USERNAME",
        "ESET_DOMAIN",
        "ESET_USE_HTTP",
        "ESET_VERIFY_SSL",
        "ESET_TIMEOUT",
        "ESET_RETRIES"
    ) | ForEach-Object {
        $value = [Environment]::GetEnvironmentVariable($_, "Process")
        if ($_ -eq "ESET_PASSWORD" -and $value) {
            $value = "********"
        }
        Write-Host "${_}: $value"
    }
    # パスワードは別途確認（マスク表示）
    $pwdSet = [Environment]::GetEnvironmentVariable("ESET_PASSWORD", "Process")
    Write-Host "ESET_PASSWORD: $(if ($pwdSet) { '********' } else { '(未設定)' })"
    Write-Host ""
    return
}

function Set-EnvVar {
    param(
        [string]$Name,
        [string]$Value,
        [bool]$Persist
    )

    # プロセス環境変数に設定
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")

    # 永続化オプションが指定された場合はユーザー環境変数にも設定
    if ($Persist -and $Value) {
        [Environment]::SetEnvironmentVariable($Name, $Value, "User")
        Write-Host "  [永続化] $Name" -ForegroundColor DarkGray
    }
}

function Read-SecurePassword {
    param([string]$Prompt = "パスワード")

    $securePassword = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

# 設定ファイルから読み込み
if ($ConfigFile) {
    if (-not (Test-Path $ConfigFile)) {
        Write-Error "設定ファイルが見つからない: $ConfigFile"
        exit 1
    }

    try {
        $config = Get-Content $ConfigFile -Raw | ConvertFrom-Json

        Write-Host "`n=== 設定ファイルから読み込み ===" -ForegroundColor Cyan

        if ($config.host) { Set-EnvVar "ESET_HOST" $config.host $Persist }
        if ($config.port) { Set-EnvVar "ESET_PORT" $config.port.ToString() $Persist }
        if ($config.username) { Set-EnvVar "ESET_USERNAME" $config.username $Persist }
        if ($config.domain) { Set-EnvVar "ESET_DOMAIN" $config.domain $Persist }
        if ($null -ne $config.use_http) { Set-EnvVar "ESET_USE_HTTP" $config.use_http.ToString().ToLower() $Persist }
        if ($null -ne $config.verify_ssl) { Set-EnvVar "ESET_VERIFY_SSL" $config.verify_ssl.ToString().ToLower() $Persist }
        if ($config.timeout) { Set-EnvVar "ESET_TIMEOUT" $config.timeout.ToString() $Persist }
        if ($config.retries) { Set-EnvVar "ESET_RETRIES" $config.retries.ToString() $Persist }

        # パスワードは設定ファイルにあっても再入力を促す（セキュリティ上の理由）
        if ($config.password) {
            Write-Host "`n[警告] 設定ファイルにパスワードが含まれている。" -ForegroundColor Yellow
            Write-Host "セキュリティのため、ファイルからパスワードを削除することを推奨する。" -ForegroundColor Yellow
            $useFilePassword = Read-Host "ファイルのパスワードを使用するか? (y/N)"
            if ($useFilePassword -eq 'y' -or $useFilePassword -eq 'Y') {
                Set-EnvVar "ESET_PASSWORD" $config.password $false  # パスワードは永続化しない
            }
            else {
                $password = Read-SecurePassword "パスワードを入力"
                Set-EnvVar "ESET_PASSWORD" $password $false
            }
        }
        else {
            $password = Read-SecurePassword "パスワードを入力"
            Set-EnvVar "ESET_PASSWORD" $password $false
        }

        Write-Host "`n設定完了。" -ForegroundColor Green
    }
    catch {
        Write-Error "設定ファイルの読み込みに失敗: $_"
        exit 1
    }
}
# 手動パラメータ指定
elseif ($PSCmdlet.ParameterSetName -eq 'Manual' -and $EsetHost) {
    Write-Host "`n=== パラメータから設定 ===" -ForegroundColor Cyan

    Set-EnvVar "ESET_HOST" $EsetHost $Persist
    Set-EnvVar "ESET_PORT" $Port.ToString() $Persist
    if ($Username) { Set-EnvVar "ESET_USERNAME" $Username $Persist }
    if ($Domain) { Set-EnvVar "ESET_DOMAIN" $Domain $Persist }
    if ($UseHttp) { Set-EnvVar "ESET_USE_HTTP" "true" $Persist }
    if ($SkipSslVerify) { Set-EnvVar "ESET_VERIFY_SSL" "false" $Persist }

    # パスワードは常に対話入力
    $password = Read-SecurePassword "パスワードを入力"
    Set-EnvVar "ESET_PASSWORD" $password $false  # パスワードは永続化しない

    Write-Host "`n設定完了。" -ForegroundColor Green
}
# 対話形式
else {
    Write-Host "`n=== ESET Manager 環境変数設定 ===" -ForegroundColor Cyan
    Write-Host "薬の調合を始めよう。必要な材料を入力してくれ。`n" -ForegroundColor Gray

    # ホスト
    $currentHost = $env:ESET_HOST
    $inputHost = Read-Host "ESETサーバーホスト名$(if ($currentHost) { " [$currentHost]" })"
    if ($inputHost) { Set-EnvVar "ESET_HOST" $inputHost $Persist }
    elseif ($currentHost) { Write-Host "  (現在の値を維持)" -ForegroundColor DarkGray }

    # ポート
    $currentPort = $env:ESET_PORT
    if (-not $currentPort) { $currentPort = "2223" }
    $inputPort = Read-Host "ポート番号 [$currentPort]"
    if ($inputPort) { Set-EnvVar "ESET_PORT" $inputPort $Persist }
    else { Set-EnvVar "ESET_PORT" $currentPort $Persist }

    # 認証方式
    Write-Host "`n--- 認証設定 ---" -ForegroundColor Yellow
    $authType = Read-Host "認証方式 (1: ローカル, 2: AD/ドメイン) [2]"
    if ($authType -ne "1") {
        # AD認証
        $currentDomain = $env:ESET_DOMAIN
        $inputDomain = Read-Host "ドメイン名$(if ($currentDomain) { " [$currentDomain]" })"
        if ($inputDomain) { Set-EnvVar "ESET_DOMAIN" $inputDomain $Persist }
        elseif ($currentDomain) { Write-Host "  (現在の値を維持)" -ForegroundColor DarkGray }
    }
    else {
        # ローカル認証の場合はドメインをクリア
        Set-EnvVar "ESET_DOMAIN" "" $Persist
    }

    # ユーザー名
    $currentUser = $env:ESET_USERNAME
    $inputUser = Read-Host "ユーザー名$(if ($currentUser) { " [$currentUser]" })"
    if ($inputUser) { Set-EnvVar "ESET_USERNAME" $inputUser $Persist }
    elseif ($currentUser) { Write-Host "  (現在の値を維持)" -ForegroundColor DarkGray }

    # パスワード（常に入力、マスク表示）
    $password = Read-SecurePassword "パスワード"
    if ($password) {
        Set-EnvVar "ESET_PASSWORD" $password $false  # パスワードは永続化しない
    }

    # 接続オプション
    Write-Host "`n--- 接続オプション ---" -ForegroundColor Yellow
    $useHttp = Read-Host "HTTPを使用するか? (y/N)"
    if ($useHttp -eq 'y' -or $useHttp -eq 'Y') {
        Set-EnvVar "ESET_USE_HTTP" "true" $Persist
    }
    else {
        Set-EnvVar "ESET_USE_HTTP" "false" $Persist

        $skipSsl = Read-Host "SSL証明書検証をスキップするか? (y/N)"
        if ($skipSsl -eq 'y' -or $skipSsl -eq 'Y') {
            Set-EnvVar "ESET_VERIFY_SSL" "false" $Persist
        }
        else {
            Set-EnvVar "ESET_VERIFY_SSL" "true" $Persist
        }
    }

    Write-Host "`n設定完了。" -ForegroundColor Green
}

# 設定確認
Write-Host "`n=== 設定内容 ===" -ForegroundColor Cyan
Write-Host "ESET_HOST:       $env:ESET_HOST"
Write-Host "ESET_PORT:       $env:ESET_PORT"
Write-Host "ESET_USERNAME:   $env:ESET_USERNAME"
Write-Host "ESET_DOMAIN:     $env:ESET_DOMAIN"
Write-Host "ESET_PASSWORD:   ********"
Write-Host "ESET_USE_HTTP:   $env:ESET_USE_HTTP"
Write-Host "ESET_VERIFY_SSL: $env:ESET_VERIFY_SSL"

if ($Persist) {
    Write-Host "`n[注意] -Persist オプションにより、パスワード以外の設定がユーザー環境変数に保存された。" -ForegroundColor Yellow
    Write-Host "パスワードはセキュリティ上の理由で永続化されない。" -ForegroundColor Yellow
}

Write-Host "`nこのPowerShellセッションで eset_manager.py を実行できる。" -ForegroundColor Green
Write-Host "例: python eset_manager.py info --csv computers.csv --output results.csv`n" -ForegroundColor Gray
