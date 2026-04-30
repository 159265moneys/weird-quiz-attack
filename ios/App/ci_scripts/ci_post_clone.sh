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
# Xcode Cloud のホストには brew があるが node は未インストール。
# brew で入れるのが最も簡単で、Apple 公式ドキュメントが推奨する方法。
if ! command -v node >/dev/null 2>&1; then
    echo "==> Installing Node.js via Homebrew..."
    brew install node
else
    echo "==> Node.js already present: $(node --version)"
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
