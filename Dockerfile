FROM ubuntu:22.04

# 使用するツールのバージョンを固定
ENV NODE_VERSION=24.13.0
ENV PNPM_VERSION=10.28.2

# ===== システムツールのインストール =====
# AIエージェントが「あるはず」と想定する標準的なコマンド群を揃える
RUN apt-get update && apt-get install -y \
    git \
    tree \
    curl \
    ca-certificates \
    jq \
    unzip \
    bash \
    xz-utils \
 && rm -rf /var/lib/apt/lists/*

# ===== ランタイム環境の構築 =====
# Node.js公式バイナリを直接展開（軽量・確実なインストール）
RUN curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz \
    | tar -xJ --strip-components=1 -C /usr/local

# Corepackを有効化し、指定バージョンのpnpmを使える状態にする
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# ===== セキュリティ & 実行ユーザー設定 =====
# ホスト(WSL)側の一般ユーザーとUID(1000)を合わせ、ファイル所有権の競合を回避
RUN useradd -m -u 1000 agent

# 作業ディレクトリを準備し、非rootユーザー(agent)に権限を譲渡
WORKDIR /app
RUN chown agent:agent /app

# 以降のコマンド実行はすべて非rootユーザーで行う
USER agent

# ===== コンテナ起動時の挙動 =====
# 1. コンテナ起動のたびに pnpm install を実行し、WSL/Windows依存の node_modules を Linux用に上書きする
# 2. Dockerの仕様（メインプロセス終了 = コンテナ終了）を防ぐため、最後に exec bash を実行する
# これにより、コンテナが「死ぬ」のを防ぎ、人間が手動で疎通確認や start を行うための待機状態を作る
CMD ["sh", "-c", "pnpm install && exec bash"]
