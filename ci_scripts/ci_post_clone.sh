#!/bin/sh

# ============================================================
# ci_post_clone.sh — Xcode Cloud 用 Pre-build フック
# ------------------------------------------------------------
# Xcode Cloud の実行フロー:
#   1. macOS / Xcode 環境を構成
#   2. git clone <this repo>            ← 終了直後にこのスクリプトが走る
#   3. xcodebuild -resolvePackageDependencies
#   4. xcodebuild archive
#
# このプロジェクトは Capacitor 8 製。Capacitor の iOS プラグインは
# node_modules/@capacitor/<name> 経由で SPM (Swift Package Manager) に
# ローカルパスで参照されている。clone 直後は node_modules が無いので
# Step 3 がパッケージを解決できず即死する (実際 #1, #2 ビルドの失敗原因)。
#
# 本スクリプトでは:
#   - Homebrew 経由で Node.js をインストール (Xcode Cloud に node 標準同梱なし)
#   - npm ci で deps 復元
#   - npm run build で www/ を生成
#   - npx cap sync ios で ios/App/App/public 等を最新化
# を行い、SPM が node_modules を見つけられる状態にする。
#
# 参考: https://developer.apple.com/documentation/xcode/writing-custom-build-scripts
# ============================================================

set -euxo pipefail

echo "==> Working directory: $(pwd)"
echo "==> CI_PRIMARY_REPOSITORY_PATH: ${CI_PRIMARY_REPOSITORY_PATH:-unset}"

# ci_scripts/ci_post_clone.sh は ci_scripts/ ディレクトリで起動されるため、
# 親 (= リポジトリルート) に移動して以降の作業を行う。
cd "${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
echo "==> Switched to repo root: $(pwd)"

# --- Node.js の用意 -------------------------------------------------
# 当初は `brew install node` で入れていたが、Xcode Cloud のランナーから
# pkg-containers.githubusercontent.com への DNS が通らず Homebrew の
# auto-update が失敗 → brew 経由のインストール全停止という事象が発生。
# 公式 nodejs.org からポータブルバイナリを直接 DL する方式に切り替える。
if ! command -v node >/dev/null 2>&1; then
    NODE_VERSION="22.18.0"  # LTS (Capacitor 8 が Node >=22 を要求)
    ARCH=$(uname -m)
    case "$ARCH" in
        arm64)  NODE_ARCH="darwin-arm64" ;;
        x86_64) NODE_ARCH="darwin-x64" ;;
        *) echo "Unsupported arch: $ARCH"; exit 1 ;;
    esac
    NODE_PKG="node-v${NODE_VERSION}-${NODE_ARCH}"
    NODE_INSTALL_DIR="$HOME/.local/node"

    echo "==> Installing Node.js v${NODE_VERSION} (${NODE_ARCH}) via nodejs.org..."
    mkdir -p "$NODE_INSTALL_DIR"
    TMPDIR_LOCAL=$(mktemp -d)
    cd "$TMPDIR_LOCAL"
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_PKG}.tar.xz" -o node.tar.xz
    tar -xf node.tar.xz -C "$NODE_INSTALL_DIR" --strip-components=1
    export PATH="$NODE_INSTALL_DIR/bin:$PATH"
    cd "${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
else
    echo "==> Node.js already present"
fi

echo "==> Node:    $(node --version)"
echo "==> npm:     $(npm --version)"

# --- 依存関係インストール ---------------------------------------------
# package-lock.json があるので npm ci で再現性を確保。
echo "==> Installing npm dependencies (npm ci)..."
npm ci

# --- web 資産ビルド --------------------------------------------------
# scripts/build-www.js が www/ を生成する。
echo "==> Building web assets..."
npm run build

# --- Capacitor sync (iOS) -------------------------------------------
# www/ → ios/App/App/public/ にコピー。
# ※ android は Xcode Cloud には不要だが、cap sync はデフォルト全プラットフォーム
#    実行するので ios のみ指定して android プロジェクト不在エラーを回避する。
echo "==> Capacitor sync (ios)..."
npx cap sync ios

echo "==> ci_post_clone.sh: done"
