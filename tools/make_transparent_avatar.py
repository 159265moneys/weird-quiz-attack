#!/usr/bin/env python3
"""
白背景の RGB PNG を透過 PNG に変換する。
アイコン生成の CSS mask でシルエット(女の輪郭)だけを影として使えるようにする用。

使い方:
    python tools/make_transparent_avatar.py \\
        sprite/avatars/puzzle.png \\
        sprite/avatars/puzzle_alpha.png

アルゴリズム:
  - 近白ピクセル (各チャンネル >= WHITE_THRESHOLD かつ分散小) を完全透過
  - 境界は輝度が高いほど半透過に、輝度が低いほど不透明に (線画が羽毛風に消えるのを防ぐ)
"""
import sys
from PIL import Image

WHITE_THRESHOLD = 245   # ここ以上は完全白扱い
SOFT_MIN        = 200   # ここ〜WHITE_THRESHOLD は段階的に透過
MAX_COLOR_VAR   = 14    # RGB 間のばらつきがこの範囲内なら「白っぽい = 背景」


def to_alpha(im: Image.Image) -> Image.Image:
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            # ばらつきが大きい = 有彩色 = 前景
            mx = max(r, g, b)
            mn = min(r, g, b)
            colorful = (mx - mn) > MAX_COLOR_VAR
            brightness = (r + g + b) // 3
            if colorful:
                a = 255
            elif brightness >= WHITE_THRESHOLD:
                a = 0
            elif brightness >= SOFT_MIN:
                # SOFT_MIN..WHITE_THRESHOLD を 255..0 にマップ
                t = (brightness - SOFT_MIN) / (WHITE_THRESHOLD - SOFT_MIN)
                a = int(round(255 * (1 - t)))
            else:
                a = 255
            px[x, y] = (r, g, b, a)
    return im


def main():
    if len(sys.argv) < 3:
        print('usage: make_transparent_avatar.py <input> <output>')
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    im = Image.open(src)
    print(f'loaded: {src}  mode={im.mode}  size={im.size}')
    out = to_alpha(im)
    out.save(dst, 'PNG')
    print(f'wrote : {dst}  mode={out.mode}')


if __name__ == '__main__':
    main()
