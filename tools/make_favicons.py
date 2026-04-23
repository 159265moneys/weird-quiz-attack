#!/usr/bin/env python3
"""
marketing/icon.png (1024×1024) から各種 favicon を生成してプロジェクトルートに出力。

生成物:
    apple-touch-icon.png   180×180  (iOS Safari ホーム画面)
    icon-192.png           192×192  (Android add-to-home-screen)
    icon-512.png           512×512  (PWA マニフェスト等)
    favicon-32.png          32×32   (PC ブラウザタブ)
    favicon-16.png          16×16   (PC ブラウザタブ 小)

Note:
    iOS の apple-touch-icon には透過 PNG は推奨されない
    (透過部分が黒く出てしまう機種がある) ため、下地に白を敷いて合成する。
"""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC  = ROOT / 'marketing' / 'icon.png'

TARGETS = [
    ('apple-touch-icon.png', 180, (255, 255, 255)),
    ('icon-192.png',         192, (255, 255, 255)),
    ('icon-512.png',         512, (255, 255, 255)),
    ('favicon-32.png',        32, (255, 255, 255)),
    ('favicon-16.png',        16, (255, 255, 255)),
]


def main():
    src = Image.open(SRC).convert('RGBA')
    print(f'source: {SRC.relative_to(ROOT)}  size={src.size}')
    for name, size, bg in TARGETS:
        # 正方形背景に合成(alpha 対策)
        canvas = Image.new('RGBA', (size, size), bg + (255,))
        resized = src.resize((size, size), Image.LANCZOS)
        canvas.paste(resized, (0, 0), resized)
        out = ROOT / name
        # favicon 用は RGB に落として保存容量を軽くする
        canvas.convert('RGB').save(out, 'PNG', optimize=True)
        print(f'  + {name}  ({size}x{size})')
    print('done.')


if __name__ == '__main__':
    main()
