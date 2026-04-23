/* ============================================================
   settings.js — 設定パネル (音量 / ミュート)
   ------------------------------------------------------------
   タイトル / ステージ選択画面の右上 ⚙ ボタンから開く。
   BGM 音量スライダー / SE 音量スライダー / 全体ミュートトグル を提供。
   localStorage に即時保存、閉じなくてもリアルタイム反映。
   ============================================================ */

(function () {
    let overlay = null;
    let isOpen = false;

    function readSettings() {
        return window.Save?.getSettings?.() || {
            seVolume: 0.8, bgmVolume: 0.35, muted: false,
        };
    }

    function saveSetting(key, value) {
        window.Save?.setSetting?.(key, value);
    }

    function ensureDom() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        overlay.innerHTML = `
            <div class="settings-panel" role="dialog" aria-label="設定">
                <div class="settings-header">
                    <div class="settings-title">SOUND</div>
                    <button class="settings-close" id="settingsClose" aria-label="閉じる">
                        <svg class="icon-x" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2.2"
                             stroke-linecap="round" stroke-linejoin="round"
                             aria-hidden="true">
                          <line x1="18" y1="6"  x2="6"  y2="18"/>
                          <line x1="6"  y1="6"  x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                <div class="settings-row">
                    <div class="settings-row-head">
                        <span class="settings-label">BGM</span>
                        <span class="settings-value" id="settingsBgmVal">35</span>
                    </div>
                    <!-- min=5: 誤操作で 0 まで下げて "SE だけ鳴らない" 状態に詰むのを防止。
                         完全消音は下の MUTE ALL を使う。 -->
                    <input type="range" class="settings-slider" id="settingsBgm" min="5" max="100" step="1" value="35">
                </div>

                <div class="settings-row">
                    <div class="settings-row-head">
                        <span class="settings-label">SE</span>
                        <span class="settings-value" id="settingsSeVal">80</span>
                    </div>
                    <input type="range" class="settings-slider" id="settingsSe" min="5" max="100" step="1" value="80">
                </div>

                <div class="settings-row settings-row-mute">
                    <label class="settings-mute">
                        <input type="checkbox" id="settingsMute">
                        <span class="settings-mute-box"></span>
                        <span class="settings-mute-label">MUTE ALL</span>
                    </label>
                </div>

                <div class="settings-row settings-row-mute" id="settingsVibRow">
                    <label class="settings-mute">
                        <input type="checkbox" id="settingsVib">
                        <span class="settings-mute-box"></span>
                        <span class="settings-mute-label">VIBRATION</span>
                    </label>
                </div>

                <div class="settings-hint">スライダー: 音量 5〜100% / 完全消音は MUTE ALL</div>
            </div>
        `;
        document.body.appendChild(overlay);

        // ※ パネル外タップで閉じる挙動は意図的に無効化。誤タップで
        //   設定中の値が閉じた扱いになるのを防ぐため、閉じるには ✕ 必須。
        overlay.querySelector('#settingsClose').addEventListener('click', () => {
            window.SE?.fire?.('cancel');
            close();
        });

        const bgm = overlay.querySelector('#settingsBgm');
        const bgmVal = overlay.querySelector('#settingsBgmVal');
        const se  = overlay.querySelector('#settingsSe');
        const seVal  = overlay.querySelector('#settingsSeVal');
        const mute = overlay.querySelector('#settingsMute');

        // スライダー塗り色の進捗を CSS 変数 (--pct) で反映する小物
        function paintSlider(el) {
            el.style.setProperty('--pct', `${el.value}%`);
        }

        // スライダー: input イベントでリアルタイム反映 + localStorage 即時保存
        bgm.addEventListener('input', () => {
            const v = Number(bgm.value) / 100;
            bgmVal.textContent = bgm.value;
            paintSlider(bgm);
            window.BGM?.setVolume?.(v);
            saveSetting('bgmVolume', v);
        });
        se.addEventListener('input', () => {
            const v = Number(se.value) / 100;
            seVal.textContent = se.value;
            paintSlider(se);
            window.SE?.setMasterVolume?.(v);
            saveSetting('seVolume', v);
        });

        // パネル内のインタラクションが背景へ抜けて閉じないようにする
        overlay.querySelector('.settings-panel').addEventListener('click', (e) => e.stopPropagation());
        overlay.querySelector('.settings-panel').addEventListener('pointerdown', (e) => e.stopPropagation());
        // スライダーを離した時に SE で試聴 (SE 側のみ)
        se.addEventListener('change', () => {
            window.SE?.fire?.('confirm');
        });

        mute.addEventListener('change', () => {
            const m = mute.checked;
            window.SE?.mute?.(m);
            window.BGM?.mute?.(m);
            saveSetting('muted', m);
            if (!m) window.SE?.fire?.('confirm');
        });

        // 振動 (端末がサポートしない場合はチェックボックスを無効化)
        const vib    = overlay.querySelector('#settingsVib');
        const vibRow = overlay.querySelector('#settingsVibRow');
        const vibSupported = window.Haptics?.isSupported?.() ?? false;
        if (!vibSupported) {
            vib.disabled = true;
            vibRow.classList.add('is-disabled');
            // iOS Safari 等では Web の vibrate は効かないので、ラベルを
            // "N/A" にしてユーザーが混乱しないようにする。
            const lbl = vibRow.querySelector('.settings-mute-label');
            if (lbl) lbl.textContent = 'VIBRATION (N/A)';
        }
        vib.addEventListener('change', () => {
            const v = vib.checked;
            window.Haptics?.setEnabled?.(v);
            // ON にした時だけフィードバック (OFF 直後に鳴らすと矛盾する)
            if (v) window.Haptics?.vibrate?.(30);
        });

        return overlay;
    }

    function syncFromSaved() {
        const s = readSettings();
        const bgm = overlay.querySelector('#settingsBgm');
        const bgmVal = overlay.querySelector('#settingsBgmVal');
        const se  = overlay.querySelector('#settingsSe');
        const seVal  = overlay.querySelector('#settingsSeVal');
        const mute = overlay.querySelector('#settingsMute');
        const vib  = overlay.querySelector('#settingsVib');

        const bgmPct = Math.round(s.bgmVolume * 100);
        const sePct  = Math.round(s.seVolume  * 100);
        bgm.value = bgmPct; bgmVal.textContent = bgmPct;
        se.value  = sePct;  seVal.textContent  = sePct;
        mute.checked = !!s.muted;
        if (vib) vib.checked = s.vibration !== false;   // default ON
        bgm.style.setProperty('--pct', `${bgmPct}%`);
        se.style.setProperty('--pct', `${sePct}%`);
    }

    function open() {
        if (isOpen) return;
        ensureDom();
        syncFromSaved();
        overlay.classList.add('is-open');
        isOpen = true;
        window.SE?.fire?.('confirm');
    }

    function close() {
        if (!isOpen || !overlay) return;
        overlay.classList.remove('is-open');
        isOpen = false;
    }

    function toggle() { isOpen ? close() : open(); }

    // タイトル/ステージ選択画面に ⚙ ボタンを貼るためのヘルパ。
    // 画面側の init() から呼び出して使う。
    function mountTrigger(host) {
        if (!host) return;
        if (host.querySelector('.settings-trigger')) return;  // 二重挿入防止
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'settings-trigger';
        btn.setAttribute('aria-label', '設定');
        // アイコン: Lucide "settings" (MIT License) — stroke ベースで絵文字感無し
        btn.innerHTML = `
            <svg class="icon-gear" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round" stroke-linejoin="round"
                 aria-hidden="true">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
        `;
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            window.SE?.fire?.('menuCursor');
            open();
        });
        // title のタップで画面遷移してしまうのを防ぐ
        btn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        host.appendChild(btn);
    }

    window.Settings = {
        open, close, toggle, mountTrigger,
    };
})();
