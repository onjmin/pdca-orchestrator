FROM ubuntu:22.04

# ===== 基本ツール（rootでのみ実行） =====
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    jq \
    unzip \
    bash \
 && rm -rf /var/lib/apt/lists/*

# ===== GitHub CLI =====
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
 && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
    https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y gh \
 && rm -rf /var/lib/apt/lists/*

# ===== 非rootユーザー作成 =====
RUN useradd -m -u 1000 agent

# ===== Volta（agentユーザー用） =====
ENV VOLTA_HOME=/home/agent/.volta
ENV PATH=$VOLTA_HOME/bin:$PATH

USER agent
RUN curl https://get.volta.sh | bash \
 && volta install node@20 pnpm

# ===== 作業ディレクトリ =====
WORKDIR /app
