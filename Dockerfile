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
# 起動時は何もせず、対話シェルのみを起動する
# 依存関係のインストールや実行は、コンテナ内で人間が明示的に行う
CMD ["bash"]
