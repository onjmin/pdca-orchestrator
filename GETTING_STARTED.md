# 🚀 GETTING_STARTED.md

このガイドでは、「小人の靴屋」をあなたの PC に迎え入れ、最初の仕事を頼むまでの手順を説明します。

## ⚠️ 安全のための重要事項
本エージェントは、指示を遂行するために **「任意のシェルコマンド実行」** や **「ファイルの読み書き・削除」** を行います。
万が一の誤操作（``rm -rf /`` など）からあなたのメイン環境を守るため、以下の環境での実行を強く推奨します。

1. **WSL2 (Ubuntu 等) の利用**: Windows 環境の方は、必ず WSL2 上の隔離されたディレクトリで動かしてください。
2. **Git 管理**: 作業対象のプロジェクトは必ず Git 管理下におき、実行前にコミットしておいてください。いつでも差し戻せる状態が必須です。

---

## 🧱 0. WSL2 & Docker 環境の構築（Windows ユーザー向け・必須）

> [!WARNING]
> 本プロジェクトは **任意コード実行を伴う AI エージェント**を含みます。
> **Windows ホスト環境を保護するため、WSL2 上での実行を必須**とします。
> 以下の手順を **必ず最初に** 実施してください。

---

### 0-1. BIOS（UEFI）で仮想化を有効にする【最重要】

WSL2 は内部的に **軽量仮想マシン（Hyper-V）** を使用します。
そのため **CPU 仮想化支援機能を BIOS で有効化**する必要があります。

#### 手順

1. PC を再起動
2. 起動直後に以下のいずれかのキーを連打して BIOS / UEFI に入る

   * `DEL` / `F2` / `F10` / `ESC`（メーカーにより異なる）
3. 以下の項目を探して **Enabled** に設定

**Intel CPU の場合**

* `Intel Virtualization Technology`
* `VT-x`

**AMD CPU の場合**

* `SVM Mode`
* `AMD-V`

4. 設定を保存して再起動（多くの場合 `F10`）

> 💡 この設定を行わないと、後続の WSL2 セットアップは必ず失敗します。

---

### 0-2. WSL2 のインストール

管理者権限の PowerShell または コマンドプロンプトで実行：

```powershell
wsl --install
```

インストール完了後、**必ず再起動**してください。

再起動後、状態を確認：

```powershell
wsl --status
```

以下のように表示されれば OK です：

```
既定のバージョン: 2
WSL2 はサポートされています
```

---

### 0-3. Ubuntu のインストール

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

### 0-4. Docker Engine のインストール（Docker Desktop 不要）

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

### 0-5. Docker を sudo なしで使えるようにする

```bash
sudo usermod -aG docker $USER
```

一度 **Ubuntu を終了して再起動**してください。

```powershell
wsl --shutdown
```

再度 Ubuntu を起動後、確認：

```bash
docker run hello-world
```

メッセージが表示されれば成功です 🎉

---

### 0-6. ネットワークについて（LM Studio との疎通）

WSL2 からは **Windows の `localhost` に直接アクセス可能**です。

そのため、Docker コンテナやエージェントから：

```
http://localhost:1234
```

で **Windows 側の LM Studio (OpenAI互換API)** に接続できます。

特別なポートフォワード設定は不要です。

---

### ✅ ここまで終わったら

* WSL2：隔離された Linux 実行環境
* Docker：AI エージェント用の追加サンドボックス
* Windows：LM Studio 実行環境

という **安全かつ再現性の高い構成**が完成しています。

この状態で、以降の手順（1. 動作環境の準備）に進んでください。

---

## 1. AI エージェント実行環境（Docker）

本プロジェクトの AI エージェントは **必ず Docker コンテナ内で実行**してください。  
ホスト（WSL2）上で `pnpm start` を直接実行することは禁止します。

### 1-1. Docker イメージのビルド

プロジェクトルートで以下を実行：

```bash
docker build -t kobito .
````

---

### 1-2. 安全なコンテナ起動（必須）

以下のコマンド **以外での起動は禁止**します。

```bash
docker run --rm -it \
  --read-only \
  --cap-drop ALL \
  -v $(pwd):/app:rw \
  kobito
```

#### この起動方法が行っている安全対策

* `/` を **read-only** に設定
* 書き込み可能なのは `/app` のみ
* Linux capability をすべて削除
* コンテナ終了時に状態を破棄（`--rm`）

---

### 1-3. コンテナ内での操作

以降のすべての操作は **コンテナ内シェル**で行います。

```bash
pnpm install
pnpm test:all
pnpm start
```

> 💡 Volta / Node / pnpm / git はすべてコンテナ内に事前インストールされています。

---

## 2. 環境設定 (``.env``)

プロジェクトの動作には設定ファイルが必要です。まず、テンプレートをコピーして設定ファイルを作成してください。

```bash
cp .env.example .env
```

作成した ``.env`` を開き、埋めてください。

---

## 3. 疎通確認 (Health Check)

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
