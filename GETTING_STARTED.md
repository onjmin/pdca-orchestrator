# 🚀 GETTING_STARTED.md

このガイドでは、「小人の靴屋」をあなたの PC に迎え入れ、最初の仕事を頼むまでの手順を説明します。

## ⚠️ 安全のための重要事項
本エージェントは、指示を遂行するために **「任意のシェルコマンド実行」** や **「ファイルの読み書き・削除」** を行います。
万が一の誤操作（``rm -rf /`` など）からあなたのメイン環境を守るため、以下の環境での実行を強く推奨します。

1. **WSL2 (Ubuntu 等) の利用**: Windows 環境の方は、必ず WSL2 上の隔離されたディレクトリで動かしてください。
2. **Git 管理**: 作業対象のプロジェクトは必ず Git 管理下におき、実行前にコミットしておいてください。いつでも差し戻せる状態が必須です。

---

## 🧩 環境構成の概要

以降の手順では、安全性と再現性を最優先し、実行環境を明確に分離しています。

* **Windows（ホスト）**

  * LM Studio / Ollama を実行
  * GPU・モデル管理のみ担当
  * AI エージェントからの直接操作は禁止

* **WSL2（Ubuntu）**

  * リポジトリの `git clone`
  * `.env` の作成・管理
  * Docker のビルド・起動
  * Windows ファイルシステム（`C:\`, `/mnt/c`）は使用しない

* **Docker（AI エージェント実行環境）**

  * Node / pnpm / git / shell を内包
  * 任意コマンド実行・ファイル書き換えを許可
  * 破壊前提のサンドボックス（read-only ルート / 実行後破棄）

> **原則**
> 設定と実体は WSL2、実行は Docker、LLM は Windows。
> AI が暴走しても、ホスト環境は守られます。

---

## 1. WSL2 & Docker 環境の構築

> [!WARNING]
> 本プロジェクトは **任意コード実行を伴う AI エージェント**を含みます。
> **Windows ホスト環境を保護するため、WSL2 上での実行を必須**とします。
> 以下の手順を **必ず最初に** 実施してください。

---

### 1.1 WSL2 のインストール

管理者権限の PowerShell または コマンドプロンプトで実行：

```powershell
wsl --install
```

インストール完了後、**Windowsを必ず再起動**してください。

> [!WARNING]
> 再起動せずに次の確認コマンドを実行すると、
> 「WSL2 は、現在のマシン構成ではサポートされていません。」
> 「"仮想マシン プラットフォーム" オプション コンポーネントを有効にし、さらに、BIOS で仮想化を有効にしてください。」などのエラーが表示されることがあります。
> これは Windows の仮想化機能が **まだ再起動によって反映されていないために発生する一時的なエラー** です。
> 近年の PC では仮想化は出荷時点で有効になっていることがほとんどなので、**まず再起動してください。**
> 手順をちゃんと守らないせっかちなホモは†悔い改めて†

再起動後、状態を確認：

```powershell
wsl --status
```

以下のように表示されれば OK です：

```
既定のバージョン: 2
WSL1 は、現在のマシン構成ではサポートされていません。
WSL1 を使用するには、"Linux 用 Windows サブシステム" オプション コンポーネントを有効にしてください。
```

---

### 1.2 Ubuntu のインストール

WSL2 上で使用する Linux ディストリビューションとして Ubuntu を導入します。

```powershell
wsl --install -d Ubuntu
```

初回起動時に：

* Linux ユーザー名
* パスワード

を設定してください。

以降の作業は **Ubuntu（WSL2）内のターミナル**で行います。

---

### 1.3 Docker Engine のインストール

本プロジェクトでは **WSL2 内に直接 Docker Engine をインストール**します。
（Docker Desktop は不要・非推奨）

Ubuntu ターミナルで以下を実行：

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
```

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io
```

---

### 1.4 Docker を sudo なしで使えるようにする

#### 1.4.1 Ubuntu 内

```bash
sudo usermod -aG docker $USER
exit   # ここでシェルを抜ける
```

#### 1.4.2 PowerShell / CMD 側

```powershell
wsl --shutdown
```

#### 1.4.3 Ubuntu を再起動

```powershell
wsl
```

#### 1.4.4 動作確認

```bash
docker ps
```

出力例：

```
CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES
```

WSL に Docker をインストールした直後は、
まだコンテナが存在しないため、この出力になるのが正しい挙動です。

エラーが出なければ、**sudo なしで Docker コマンドを実行できています。**

---

### 1.5 ネットワークについて（LM Studio との疎通）

WSL2 からは **Windows の `localhost` に直接アクセス可能**です。

そのため、Docker コンテナやエージェントから：

```
http://localhost:1234
```

で **Windows 側の LM Studio (OpenAI互換API)** に接続できます。

特別なポートフォワード設定は不要です。

---

## 1.6 プロジェクトのクローン

> [!IMPORTANT]
> **この操作は必ず WSL2（Ubuntu）内で行ってください。**
> Windows ファイルシステム（`C:\` や `/mnt/c`）上での clone は禁止します。

Ubuntu ターミナルで：

```bash
mkdir -p ~/workspace
cd ~/workspace
git clone https://github.com/onjmin/elves-shoemaker.git
cd elves-shoemaker
```

以降、**このディレクトリが作業ルート**になります。

---

## 2. 環境設定（.env）

Docker コンテナは **設定を保持しません**。
そのため `.env` は **ホスト（WSL2）側で作成・管理**します。

```bash
cp .env.example .env
```

`.env` を編集し、以下を設定してください：

* LLM API URL（例：`http://localhost:1234`）
* Discord Bot Token
* GitHub Token
* その他必須パラメータ

> 💡 WSL2 からの `localhost` は Windows の `localhost` と直結しています
> → LM Studio はそのまま `http://localhost:1234` で OK

---

## 3. AI エージェント実行環境（Docker）

本プロジェクトの AI エージェントは
**必ず Docker コンテナ内で実行**してください。

### 3.1 Docker イメージのビルド

```bash
docker build -t kobito .
```

---

### 3.2 安全なコンテナ起動

以下 **以外の起動方法は禁止**します。

```bash
docker run --rm -it \
  --read-only \
  --cap-drop ALL \
  --env-file .env \
  -v $(pwd):/app:rw \
  kobito
```

#### この起動方法の安全設計

* `/` は **read-only**
* 書き込み可能なのは `/app` のみ
* Linux capability を全削除
* `.env` はホスト（WSL2）から注入
* コンテナ終了時に完全破棄（`--rm`）

---

### 3.3 コンテナ内での操作

以降のすべての操作は **コンテナ内シェル**で行います。

```bash
pnpm install
pnpm test:all
pnpm start
```

> 💡 Volta / Node / pnpm / git はすべてコンテナ内に事前インストールされています。

---

## 4. 疎通確認（Health Check）

小人を本格的に動かす前に、各パーツが正しく接続されているか確認しましょう。
以下のコマンドで、LLMや外部ツールへの接続テストを一括実行できます。

```bash
pnpm test:all
```

個別に確認したい場合は、以下のコマンドを利用してください：

* **ファイル操作**: `pnpm test:file`
* **シェル実行**: `pnpm test:shell`
* **LLM接続**: `pnpm test:llm`
* **Web取得**: `pnpm test:fetch`
* **Wikipedia**: `pnpm test:wikipedia`
* **Web検索 (Tavily)**: `pnpm test:search`
* **GitHub連携**: `pnpm test:github`
* **Discord疎通**: `pnpm test:discord`

---

## 5. 小人に仕事を頼む（GOAL.md）

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

## 6. 実行

準備ができたら、小人を呼び出しましょう。

```bash
pnpm start
```

小人は ``GOAL.md`` を読み込み、スタックにタスクを積み、一歩ずつ作業を開始します。
進捗はコンソール、および設定した Discord で確認できます。
