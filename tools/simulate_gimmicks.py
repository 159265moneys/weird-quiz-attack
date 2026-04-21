#!/usr/bin/env python3
"""
tools/simulate_gimmicks.py
==============================================================
ギミック抽選ロジックの Python 移植 + 大量シミュレータ。
JS 側 (js/gimmicks/*.js, js/config.js) に対応する。
設定を変更した場合は下の REGISTRY / STAGES / STAGE10_POOL を手動更新。

使い方:
    python3 tools/simulate_gimmicks.py             # 全ステージの統計レポート
    python3 tools/simulate_gimmicks.py --report    # stages.txt を標準出力に

目的:
    - ステージ別プール・slots・K の内容が意図通りか確認
    - 1万回抽選して conflict 違反や空プールが出ないかチェック
    - ギミック追加後の動作検証
"""

from __future__ import annotations
import random
import argparse
from collections import Counter
from dataclasses import dataclass, field
from typing import List, Optional

# ============================================================
# 1. データ (JS 側のミラー)
# ============================================================

@dataclass
class Gimmick:
    id: str
    name: str
    supports: str            # 'both' | 'choice' | 'input'
    introduced_at: int
    difficulty: int
    conflicts: List[str] = field(default_factory=list)
    implemented: bool = True # False なら MVP 未実装


# --- MVP 実装済み 18 ギミック (registry.js と同期) ---
REGISTRY: List[Gimmick] = [
    # Stage 1 (Batch 1)
    Gimmick('B11', 'コーナービーム',         'both', 1, 4),
    Gimmick('B16', '高速カウントダウン',     'both', 1, 2),
    Gimmick('B18', '偽エラー表示',           'both', 1, 2),
    # Stage 2
    Gimmick('B03', '問題文逆さ',             'both', 2, 3),
    Gimmick('B07', 'グリッチ',               'both', 2, 3, conflicts=['B12', 'B13']),
    # Stage 3 (Batch 2)
    Gimmick('B02', '問題文1文字ずつ',        'both', 3, 4, conflicts=['B07', 'B08', 'B17']),
    Gimmick('B08', 'フェードアウト',         'both', 3, 4, conflicts=['B02', 'B12']),
    # Stage 4 (Batch 2)
    Gimmick('B04', 'ズーム暴走',             'both', 4, 5, conflicts=['B03', 'B05']),
    Gimmick('B15', '問題文逆順表示',         'both', 4, 6, conflicts=['B02', 'B07', 'B17']),
    Gimmick('B20', '暗転',                   'both', 4, 5),
    Gimmick('C01', '選択肢シャッフル',       'choice', 4, 5, conflicts=['C04']),
    # Stage 5
    Gimmick('B05', 'ミラー',                 'both', 5, 5, conflicts=['B03']),
    Gimmick('B06', '色覚破壊',               'both', 5, 6),
    Gimmick('B12', 'ぼかし',                 'both', 5, 5),
    Gimmick('B14', '余白暴走',               'both', 5, 5),
    # Stage 6
    Gimmick('B09', '画面縮小',               'both',   6, 6, conflicts=['B03', 'B05']),
    Gimmick('B10', '問題文ランダム出力',     'both',   6, 5, conflicts=['B02', 'B07', 'B15', 'B17']),
    Gimmick('W01', '文字盤見えない',         'input',  6, 7),
    Gimmick('W02', '文字盤あべこべ',         'input',  6, 7),
    Gimmick('W03', '解答欄見えない',         'input',  6, 6),
    Gimmick('W07', '入力1文字消失',          'input',  6, 7),
    Gimmick('C02', 'ダミー選択肢',           'choice', 6, 7),
    # Stage 7 (Batch 4)
    Gimmick('B01', '反転タップ',             'both',   7, 8, conflicts=['B03', 'B05']),
    Gimmick('B13', 'フォント極小',           'both',   7, 7),
    Gimmick('B17', '問題文めちゃくちゃ',     'both',   7, 7, conflicts=['B02', 'B07', 'B08', 'B10', 'B15']),
    Gimmick('W05', 'カーソル暴走',           'input',  7, 7, conflicts=['W07', 'W10']),
    Gimmick('W10', '入力遅延',               'input',  7, 7, conflicts=['W05', 'W07']),
    Gimmick('W14', 'キー巨大化',             'input',  7, 7),
    Gimmick('W17', 'カナひら勝手切替',       'input',  7, 7),
    Gimmick('W19', 'フリック方向反転',       'input',  7, 7),
    # Stage 8 (Batch 5)
    Gimmick('C03', '選択肢文字変化',         'choice', 8, 8),
    Gimmick('C04', '嘘50:50',                'choice', 8, 6, conflicts=['C01']),
    Gimmick('W04', '入力ズレ',               'input',  8, 9, conflicts=['W05', 'W06', 'W07', 'W09', 'W10']),
    Gimmick('W06', '文字順逆転',             'input',  8, 8, conflicts=['W04', 'W05', 'W09', 'W10']),
    Gimmick('W09', 'ゴースト入力',           'input',  8, 8, conflicts=['W04', 'W05', 'W06', 'W07', 'W10']),
    Gimmick('W15', 'キーワープ',             'input',  8, 8, conflicts=['W02', 'W08', 'W16', 'W17']),
    Gimmick('W16', 'キー同士くっつく',       'input',  8, 8, conflicts=['W02', 'W08', 'W15', 'W17']),
]

# --- 未実装ギミック (参考情報用、シミュレータで "実装後の姿" を見たい時に有効化) ---
PENDING: List[Gimmick] = [
    # Stage 9
    Gimmick('B21', '即死',                   'both',   9, 10, implemented=False),
    Gimmick('W08', '文字盤あべこべv2',       'input',  9, 9, implemented=False),
    Gimmick('W18', 'キー消失',               'input',  9, 9, implemented=False),
    Gimmick('W20', 'フリック方向シャッフル', 'input',  9, 10, implemented=False),
]


@dataclass
class StageConfig:
    no: int
    name: str
    stress: str
    slots: int
    K: tuple      # (min, max)
    diff: tuple   # (L1 ratio, L2, L3)


STAGES: List[StageConfig] = [
    StageConfig(1,  'TUTORIAL ZONE',  'E', 4,  (1, 1), (0.80, 0.20, 0.00)),
    StageConfig(2,  'WARMUP',         'E', 5,  (1, 1), (0.70, 0.25, 0.05)),
    StageConfig(3,  'GENTLE GLITCH',  'E', 7,  (1, 2), (0.60, 0.30, 0.10)),
    StageConfig(4,  'SOFT CHAOS',     'E', 10, (2, 2), (0.50, 0.35, 0.15)),
    StageConfig(5,  'NOISE FLOOR',    'E', 12, (2, 3), (0.40, 0.40, 0.20)),
    StageConfig(6,  'FRAGMENTED',     'M', 15, (3, 3), (0.30, 0.45, 0.25)),
    StageConfig(7,  'DISTORTED',      'M', 19, (3, 4), (0.25, 0.45, 0.30)),
    StageConfig(8,  'COLLAPSE',       'X', 20, (4, 5), (0.20, 0.40, 0.40)),
    StageConfig(9,  'HELL',           'X', 20, (4, 5), (0.15, 0.35, 0.50)),
    StageConfig(10, 'ABYSS',          'X', 20, (4, 5), (0.10, 0.30, 0.60)),
]

STAGE10_POOL_IDS = [
    'B21', 'W20', 'W04', 'W08', 'W18', 'C03', 'W05', 'W06', 'W09',
    'W15', 'W16', 'B01', 'B13', 'B17', 'C02', 'W01',
]

QUESTIONS_PER_STAGE = 20


# ============================================================
# 2. ロジック (JS 側 selector.js のミラー)
# ============================================================

def pool_for_stage(stage_no: int, all_gimmicks: List[Gimmick]) -> List[Gimmick]:
    if stage_no == 10:
        ids = set(STAGE10_POOL_IDS)
        return [g for g in all_gimmicks if g.id in ids]
    if stage_no == 9:
        return [g for g in all_gimmicks if g.introduced_at in (8, 9)]
    if stage_no == 8:
        return [g for g in all_gimmicks if g.introduced_at <= 8]
    if stage_no == 1:
        return [g for g in all_gimmicks if g.introduced_at == 1]
    # Stage 2-7
    low = stage_no - 1
    high = stage_no
    return [g for g in all_gimmicks if low <= g.introduced_at <= high]


def filter_by_mode(gimmicks: List[Gimmick], q_mode: str) -> List[Gimmick]:
    return [g for g in gimmicks if g.supports == 'both' or g.supports == q_mode]


def build_conflict_map(registry: List[Gimmick]) -> dict:
    """双方向 conflict map。片方だけ宣言されてても両方向で遮断する。"""
    m: dict = {}
    for g in registry:
        m.setdefault(g.id, set())
        for c in g.conflicts:
            m[g.id].add(c)
            m.setdefault(c, set()).add(g.id)
    return m


def pick_gimmicks(stage: StageConfig, q_mode: str, registry: List[Gimmick],
                  rng: random.Random, conflict_map: dict = None) -> List[Gimmick]:
    count = rng.randint(*stage.K)
    if count <= 0:
        return []
    pool = pool_for_stage(stage.no, registry)
    pool = filter_by_mode(pool, q_mode)
    if not pool:
        return []
    if conflict_map is None:
        conflict_map = build_conflict_map(registry)
    shuffled = pool.copy()
    rng.shuffle(shuffled)
    picked: List[Gimmick] = []
    used = set()
    for g in shuffled:
        if len(picked) >= count:
            break
        if g.id in used:
            continue
        blocks = conflict_map.get(g.id, set())
        if any(bid in used for bid in blocks):
            continue
        picked.append(g)
        used.add(g.id)
    return picked


def pick_gimmick_slots(stage: StageConfig, total: int, rng: random.Random) -> List[int]:
    slots = min(stage.slots, total)
    indices = list(range(total))
    rng.shuffle(indices)
    return sorted(indices[:slots])


# ============================================================
# 3. レポート
# ============================================================

def print_stages_report(registry: List[Gimmick]) -> None:
    """stages.txt に出すような可読レポート"""
    print('=' * 68)
    print(' Stage × Gimmick Pool Report')
    print(f' Implemented gimmicks: {sum(1 for g in registry if g.implemented)}')
    print(f' Registry total:       {len(registry)}')
    print('=' * 68)
    for st in STAGES:
        pool = pool_for_stage(st.no, registry)
        impl = [g for g in pool if g.implemented]
        choice_pool = filter_by_mode(pool, 'choice')
        input_pool = filter_by_mode(pool, 'input')
        choice_impl = [g for g in choice_pool if g.implemented]
        input_impl = [g for g in input_pool if g.implemented]
        print()
        print(f'[Stage {st.no:2d}] {st.name:<15} stress={st.stress}  slots={st.slots}  K={list(st.K)}  diff={list(st.diff)}')
        print(f'  Pool total: {len(pool):3d}  (implemented: {len(impl)})')
        print(f'    choice-applicable: {len(choice_pool):3d} (impl {len(choice_impl)})')
        print(f'    input-applicable:  {len(input_pool):3d} (impl {len(input_impl)})')
        print(f'  Members:')
        for g in sorted(pool, key=lambda g: (g.introduced_at, g.id)):
            flag = '✓' if g.implemented else ' '
            print(f'    [{flag}] {g.id:3s} {g.name:<20} sup={g.supports:6s} st{g.introduced_at} diff={g.difficulty}')


def simulate(registry: List[Gimmick], n_runs: int = 10000, seed: int = 42) -> None:
    """各ステージ × 各モードで pickGimmicks を走らせて統計"""
    rng = random.Random(seed)
    print()
    print('=' * 68)
    print(f' Simulation: {n_runs:,} picks per (stage × mode)')
    print('=' * 68)

    total_issues = 0
    cmap = build_conflict_map(registry)
    for st in STAGES:
        for mode in ('choice', 'input'):
            counter: Counter = Counter()
            empty = 0
            conflicts_seen = 0
            count_hist: Counter = Counter()
            for _ in range(n_runs):
                picked = pick_gimmicks(st, mode, registry, rng, cmap)
                if not picked:
                    empty += 1
                count_hist[len(picked)] += 1
                for g in picked:
                    counter[g.id] += 1
                # 双方向 conflict 検証
                picked_ids = [g.id for g in picked]
                for i, gid in enumerate(picked_ids):
                    blocks = cmap.get(gid, set())
                    for other in picked_ids[i + 1:]:
                        if other in blocks:
                            conflicts_seen += 1
            issues = []
            if empty > 0 and st.slots > 0:
                issues.append(f'empty_pick×{empty}')
            if conflicts_seen > 0:
                issues.append(f'!!CONFLICT×{conflicts_seen}!!')
            total_issues += conflicts_seen
            top = counter.most_common(8)
            print()
            print(f'  Stage {st.no:2d} [{mode:6s}] pool={len(filter_by_mode(pool_for_stage(st.no, registry), mode))} '
                  f'count-hist={dict(sorted(count_hist.items()))}  '
                  f'issues={issues if issues else "-"}')
            if top:
                top_str = '  '.join(f'{k}:{v}' for k, v in top)
                print(f'     top appearances: {top_str}')

    print()
    print('-' * 68)
    if total_issues == 0:
        print(' ✓ No conflict violations detected.')
    else:
        print(f' ✗ CONFLICT VIOLATIONS: {total_issues}')
    print('-' * 68)


def simulate_stage_run(registry: List[Gimmick], stage_no: int, seed: int = None) -> None:
    """1ステージまるごとシミュレーション: 20問分"""
    st = next(s for s in STAGES if s.no == stage_no)
    rng = random.Random(seed)
    slots = pick_gimmick_slots(st, QUESTIONS_PER_STAGE, rng)
    print(f'\n[Stage {stage_no}] {st.name}  slots positions: {slots}')
    for i in range(QUESTIONS_PER_STAGE):
        if i not in slots:
            print(f'  Q{i + 1:2d}: (clean)')
            continue
        # 問題モードは実際には問題から取るが、ここはランダム
        mode = rng.choice(['choice', 'input'])
        picked = pick_gimmicks(st, mode, registry, rng)
        ids = ','.join(g.id for g in picked) or '(empty)'
        print(f'  Q{i + 1:2d}: [{mode:6s}] {ids}')


# ============================================================
# 4. CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(description='Gimmick allocation simulator')
    parser.add_argument('--report', action='store_true',
                        help='Print stages.txt-style pool report only')
    parser.add_argument('--simulate', action='store_true',
                        help='Run bulk simulation with stats')
    parser.add_argument('--run', type=int, default=None,
                        help='Simulate single stage run (e.g. --run 3)')
    parser.add_argument('--pending', action='store_true',
                        help='Include unimplemented gimmicks (future state preview)')
    parser.add_argument('--n', type=int, default=10000,
                        help='Number of simulation picks per case')
    parser.add_argument('--seed', type=int, default=42, help='Random seed')
    args = parser.parse_args()

    registry = REGISTRY + (PENDING if args.pending else [])

    if args.run is not None:
        simulate_stage_run(registry, args.run, args.seed)
        return
    if args.report:
        print_stages_report(registry)
        return
    if args.simulate:
        simulate(registry, args.n, args.seed)
        return

    # デフォルト: レポート + シミュレーション
    print_stages_report(registry)
    simulate(registry, args.n, args.seed)


if __name__ == '__main__':
    main()
