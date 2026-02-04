# 🚀 GETTING_STARTED.md

このガイドでは、「小人の靴屋」をあなたの PC に迎え入れ、最初の仕事を頼むまでの手順を説明します。

## ⚠️ 安全のための重要事項
本エージェントは、指示を遂行するために **「任意のシェルコマンド実行」** や **「ファイルの読み書き・削除」** を行います。
万が一の誤操作（``rm -rf /`` など）からあなたのメイン環境を守るため、以下の環境での実行を強く推奨します。

1. **WSL2 (Ubuntu 等) の利用**: Windows 環境の方は、必ず WSL2 上の隔離されたディレクトリで動かしてください。
2. **Git 管理**: 作業対象のプロジェクトは必ず Git 管理下におき、実行前にコミットしておいてください。いつでも差し戻せる状態が必須です。

---

## 1. 動作環境の準備

### ツールチェインのインストール
プロジェクトのツールバージョンを固定するため、[Volta](https://volta.sh/) を使用します。

1. Volta をインストール
2. プロジェクトルートで以下を実行：
   ```bash
   volta install node
   volta install pnpm
   pnpm install
   ```

### 外部ツールの準備（MCPサーバー）
小人が「検索」や「GitHub操作」をするためには、外部のMCPサーバープログラムを利用します。
これらは **自分でサーバーを構築する必要はなく**、起動時にシステムが自動的に呼び出します。

以下のコマンドがあなたの環境で実行できることだけ確認しておいてください。

1. **GitHub操作**: `npx -y @modelcontextprotocol/server-github`
2. **Web検索**: `npx -y @modelcontextprotocol/server-duckduckgo`

※ 初回起動時に `npx` が必要なパッケージを自動でダウンロードします。

---

## 2. 環境設定 (``.env``)

プロジェクトルートに ``.env`` ファイルを作成し、以下の情報を記入してください。

```env
# 小人が作業して良いディレクトリ（絶対パス推奨）
BASE_DIR=/home/user/workspace/my-project

# LLM 接続設定 (LM Studio 等)
LLM_URL=http://localhost:1234/v1/chat/completions
LLM_KEY=not-needed
LLM_MODEL=local-model

# 通知設定 (進捗や相談が届きます)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# GitHub 連携 (PR作成等)
GITHUB_TOKEN=ghp_your_token_here
GITHUB_TARGET_REPO=owner/repo

# MCPサーバーの起動コマンド
GITHUB_MCP_COMMAND=npx -y @modelcontextprotocol/server-github
DUCKDUCKGO_MCP_COMMAND=npx -y @modelcontextprotocol/server-duckduckgo
```

---

## 3. 疎通確認 (Health Check)

小人を本格的に動かす前に、各パーツが正しく接続されているか確認しましょう。
以下のコマンドで、LLMや外部ツールへの接続テストを一括実行できます。

``bash
pnpm test:all
``

個別に確認したい場合は、以下のコマンドを利用してください：

* **Discord疎通確認**: ``pnpm test:discord``
* **LLM接続**: ``pnpm test:llm`` (API応答とJSONパースの確認)
* **シェル実行**: ``pnpm test:shell`` (コマンド実行権限の確認)
* **Web検索**: ``pnpm test:duckduckgo`` (DuckDuckGo MCPの起動確認)
* **GitHub連携**: ``pnpm test:github`` (Tokenとリポジトリ権限の確認)
* **ブラウザ/Wiki**: ``pnpm test:fetch`` / ``pnpm test:wikipedia`` (直接のWeb取得確認)

---

## 4. 小人に仕事を頼む (``GOAL.md``)

小人はデスク（プロジェクトルート）に置かれた ``GOAL.md`` を見て、その日の仕事を理解します。
リポジトリにある **``GOAL.md`` を直接書き換えて**、以下の3つのセクションを記入してください。

> [!IMPORTANT]
> **英語での記述を強く推奨します（推奨理由：精度とリソース限界）**
> 1. **内部プロンプトとの整合性**: 小人の「脳（内部プロンプト）」はすべて英語で構成されています。指示も英語で統一することで、AIが文脈を正確に解釈でき、誤作動のリスクを最小限に抑えられます。
> 2. **トークン効率とリソース管理**: 日本語は英語に比べ、同じ意味を伝えるのにより多くのトークンを消費します。vRAM 16GB環境で大型モデル（12Bクラスなど）を動かす場合、日本語による長大なコンテキストは**メモリー不足（OOM）を引き起こし、システムを停止させる原因**になります。英語で記述することで、物理的な限界を守りつつ、より多くの情報をAIに渡すことができます。
>
> 以下の日本語例は、あくまで「3つのセクションに分ける」という構成を分かりやすく示すためのものです。

```markdown
挨拶スクリプトの作成（※実際は英語で記述してください）
---
srcディレクトリにhello.tsを作成してください。
"Hello, Elves!"という文字列を返す関数をエクスポートし、コンソールにも出力してください。
---
1. src/hello.tsが存在すること
2. 関数が正しい文字列を返すこと
3. 実行時に"Hello, Elves!"と出力されること
```

※ セパレーター（``---``）を消さないように注意してください。

---

## 5. 実行

準備ができたら、小人を呼び出しましょう。

```bash
pnpm start
```

小人は ``GOAL.md`` を読み込み、スタックにタスクを積み、一歩ずつ作業を開始します。
進捗はコンソール、および設定した Discord で確認できます。
