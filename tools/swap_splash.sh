#!/usr/bin/env bash
# =====================================================================
# swap_splash.sh — Splash ソースを切り替えて iOS/Android/PWA 全サイズを再生成
# ---------------------------------------------------------------------
# Usage:
#   ./tools/swap_splash.sh lanczos    # 2732x2732 LANCZOS upscale (ボケる可能性)
#   ./tools/swap_splash.sh padded     # 1000x1000 を 2732 白背景に padding (ボケない)
#
# 実行後は Xcode/Android Studio を再ビルドするとネイティブアプリに反映される。
# =====================================================================
set -e
cd "$(dirname "$0")/.."

MODE="${1:-}"

case "$MODE" in
  lanczos)
    SRC="marketing/splash_2732_lanczos.png"
    ;;
  padded)
    SRC="marketing/splash_2732_padded.png"
    ;;
  *)
    echo "Usage: $0 {lanczos|padded}"
    echo ""
    echo "Available sources:"
    ls -la marketing/splash_2732_*.png 2>/dev/null || true
    exit 1
    ;;
esac

if [ ! -f "$SRC" ]; then
  echo "ERROR: $SRC not found"
  exit 1
fi

echo "[1/2] copying $SRC -> assets/splash.png"
cp "$SRC" assets/splash.png

echo "[2/2] regenerating iOS / Android / PWA assets (this takes ~40s)..."
npm run assets:generate >/dev/null

echo ""
echo "DONE. Current splash source: $SRC"
echo "Next: Xcode/Android Studio で再ビルド, もしくは npx cap sync ios"
