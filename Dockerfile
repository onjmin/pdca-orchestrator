FROM ubuntu:22.04

# バージョン指定
ENV NODE_VERSION=24.13.0
ENV PNPM_VERSION=10.28.2

# ===== ツール群のインストール =====
# cat, sed, grep は ubuntu:22.04 に標準搭載されていますが、
# git, tree, curl, jq 等を明示的に追加します。
RUN apt-get update && apt-get install -y \
    git \
    tree \
    curl \
    ca-certificates \
    jq \
    unzip \
    bash \
 && rm -rf /var/lib/apt/lists/*

# ===== Node.js 直接インストール =====
RUN curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz | tar -xJ --strip-components=1 -C /usr/local

# ===== pnpm インストール =====
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# 1. ユーザー作成
RUN useradd -m -u 1000 agent

# 2. 作業ディレクトリ作成と権限譲渡（ここは root で実行）
WORKDIR /app
RUN chown agent:agent /app

# 3. ユーザー切り替え
USER agent

# 4. 起動時の振る舞い定義
CMD ["sh", "-c", "pnpm install && exec bash"]