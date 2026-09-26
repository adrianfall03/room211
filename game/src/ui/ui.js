// HUD 与各种弹窗界面
import './style.css';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class UI {
  constructor(audio) {
    this.audio = audio;
    this.modalOpen = false;
    this._modalClose = null;
    this._keyHandler = null;
    const root = h('div');
    root.id = 'ui';
    root.innerHTML = `
      <div id="loading"><div class="ld-logo">逃离211</div><div class="ld-bar"><i></i></div><div class="ld-text">正在布置宿舍……</div></div>
      <div id="vignette"></div>
      <div id="letterbox" class="off"></div>
      <div id="hud" class="hidden">
        <div id="hud-tl"><div class="h">当前目标</div><ul id="objectives"></ul></div>
        <div id="hud-tr"><div class="ct">07:30</div><div class="cr">用时 00:00</div>
          <div class="codes"><span>门锁</span><b>?</b><b>?</b><b>?</b><b>?</b></div><div class="chap"></div></div>
        <div id="crosshair"></div>
        <div id="prompt" class="hidden"><kbd>E</kbd><span class="verb"></span><span class="obj"></span></div>
        <div id="subtitle" style="opacity:0"></div>
        <div id="toasts"></div>
        <div id="hud-inventory"></div>
        <div id="keyhints"><span><kbd>WASD</kbd> 移动</span><span><kbd>Shift</kbd> 跑</span><span class="walk-only"><kbd>C</kbd> 蹲</span><span class="float-only"><kbd>Space</kbd> 上浮</span><span class="float-only"><kbd>C</kbd> 下沉</span><span><kbd>E</kbd> 互动</span><span><kbd>F</kbd> 手电</span><span><kbd>V</kbd> 视角</span><span class="game-only"><kbd>H</kbd> 提示</span><span class="game-only"><kbd>J</kbd> 线索</span><span class="view-only"><kbd>N</kbd> 下一关</span><span><kbd>Esc</kbd> 菜单</span></div>
        <div id="clickToPlay" class="hidden">点击画面继续</div>
      </div>
      <div id="touch" class="hidden"><div id="stick"><i></i></div>
        <div class="tbtns-top"><button class="tbtn" data-k="Escape">☰</button><button class="tbtn game-only" data-k="KeyH">提示</button><button class="tbtn game-only" data-k="KeyJ">线索</button><button class="tbtn view-only" data-k="KeyN">下一关</button><button class="tbtn" data-k="KeyV">视角</button></div>
        <div class="tbtns"><button class="tbtn float-only" data-hold="Space">▲<small>上浮</small></button><button class="tbtn float-only" data-hold="KeyC">▼<small>下沉</small></button><button class="tbtn" data-k="KeyF">手电</button><button class="tbtn walk-only" data-k="KeyC">蹲</button><button class="tbtn big" data-k="KeyE" style="grid-column: span 2; width: 100%; border-radius: 32px;">互动</button></div>
      </div>
      <div id="modal" class="hidden"></div>
      <div id="fade"><div class="card"></div></div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.el = {
      loading: $('#loading'), hud: $('#hud'), obj: $('#objectives'), ct: $('#hud-tr .ct'), cr: $('#hud-tr .cr'),
      codes: [...document.querySelectorAll('#hud-tr .codes b')], codeBox: $('#hud-tr .codes'), chap: $('#hud-tr .chap'), cross: $('#crosshair'), prompt: $('#prompt'), sub: $('#subtitle'),
      toasts: $('#toasts'), inv: $('#hud-inventory'), modal: $('#modal'), fade: $('#fade'),
      letterbox: $('#letterbox'), click: $('#clickToPlay'), touch: $('#touch'),
    };
    this._subTimer = null;
    this._lastPrompt = '';
    this._objKey = '';
  }

  // ---------- 加载 ----------
  loading(p, text) {
    $('.ld-bar i', this.el.loading).style.width = `${Math.round(p * 100)}%`;
    if (text) $('.ld-text', this.el.loading).textContent = text;
  }
  hideLoading() {
    this.el.loading.style.opacity = '0';
    setTimeout(() => this.el.loading.classList.add('hidden'), 650);
  }

  // ---------- 标题 ----------
  // mode：'game' 游戏模式（解谜开锁，通关一章解锁一章）/ 'view' 鉴赏模式（没有任务和门锁，章节随便选）
  showTitle({ onStart, defaultName = '', defaultMode = 'game', quality = 'high', onQuality, unlocked = 1, defaultChapter = 1 }) {
    const t = h('div');
    t.id = 'title';
    t.innerHTML = `
      <div class="t-left">
        <div class="t-kicker">3D 宿舍密室逃脱</div>
        <div class="t-logo"><span>逃离</span><span class="num">211</span><span>宿舍</span></div>
        <div class="t-sub">期末考试当天早上，你通宵打完排位后在电脑前睡着了……醒来发现<b>门被自己的车锁锁上了</b>，准考证也不见了。<b>8:00</b> 高数开考，快逃！<br><span class="t-more">逃出这间 211 之后……门外还有<b>四个</b> 211。</span></div>
        <div><label>主角名字</label><input type="text" id="t-name" maxlength="8" placeholder="给自己起个名字（选填）" value="${esc(defaultName)}"></div>
        <div><label>模式（都不限时）</label>
          <div class="seg mode" id="t-mode">
            <button data-v="game">🎮 游戏模式<small>找线索、解谜题、开门锁</small></button>
            <button data-v="view">🎬 鉴赏模式<small>没有任务和门锁，自由穿行</small></button>
          </div></div>
        <div><label id="t-ch-label"></label>
          <div class="seg" id="t-ch">
            <button data-v="1">第一章<small></small></button>
            <button data-v="2">第二章<small></small></button>
            <button data-v="3">第三章<small></small></button>
            <button data-v="4">第四章<small></small></button>
            <button data-v="5">第五章<small></small></button>
          </div></div>
        <div><label>画质</label>
          <div class="seg" id="t-q">
            <button data-v="low">流畅</button><button data-v="medium">均衡</button><button data-v="high">精美</button>
          </div></div>
        <button class="btn-main" id="t-start">开 始 逃 脱</button>
        <div class="t-help">鼠标控制视角 · WASD 移动 · E 互动 · F 手电 · V 第一/第三人称 · H 提示 · 失重时空格上浮 / C 下沉 · 鉴赏模式按 N 跳关<br>建议使用电脑浏览器游玩，戴上耳机体验更佳 🎧</div>
      </div>
      <div class="t-hero"><div class="nm">主角 · 211 峡谷之神</div><div class="tg">通宵 <span>高数</span><span>夜猫子</span><span>牛仔夹克</span></div></div>`;
    document.body.appendChild(t);
    this.titleEl = t;
    let mode = defaultMode === 'view' ? 'view' : 'game', q = quality, chapter = defaultChapter;
    const seg = (id, val, cb) => {
      const el = $(id, t);
      const btns = [...el.querySelectorAll('button')];
      const sync = () => btns.forEach((b) => b.classList.toggle('on', b.dataset.v === val));
      btns.forEach((b) => b.addEventListener('click', () => { val = b.dataset.v; sync(); this.audio.click(); cb(val); }));
      sync();
    };
    seg('#t-q', q, (v) => { q = v; onQuality && onQuality(v); });
    // 章节：游戏模式里没通关的章节锁着；鉴赏模式随便选
    const chNames = ['211 宿舍', '废弃的 211', '雨林 211', '冰封 211', '太空舱 211'];
    const chBtns = [...$('#t-ch', t).querySelectorAll('button')];
    const startBtn = $('#t-start', t);
    const syncCh = () => {
      if (mode === 'game') chapter = Math.min(chapter, unlocked);
      chBtns.forEach((b, i) => {
        const locked = mode === 'game' && i + 1 > unlocked;
        b.classList.toggle('on', i + 1 === chapter);
        b.classList.toggle('locked', locked);
        $('small', b).textContent = locked ? '🔒 通关上一章解锁' : chNames[i];
      });
      $('#t-ch-label', t).textContent = mode === 'game' ? '章节（通关一章解锁一章）' : '章节（鉴赏模式随便选）';
      startBtn.textContent = mode === 'game' ? '开 始 逃 脱' : '开 始 鉴 赏';
    };
    seg('#t-mode', mode, (v) => { mode = v; syncCh(); });
    chBtns.forEach((b) => b.addEventListener('click', () => {
      if (b.classList.contains('locked')) { this.audio.error(); return; }
      chapter = Number(b.dataset.v); this.audio.click(); syncCh();
    }));
    syncCh();
    startBtn.addEventListener('click', () => {
      const name = $('#t-name', t).value.trim();
      onStart({ name, mode, quality: q, chapter });
    });
  }
  hideTitle() {
    if (!this.titleEl) return;
    this.titleEl.style.transition = 'opacity 0.6s';
    this.titleEl.style.opacity = '0';
    const t = this.titleEl;
    setTimeout(() => t.remove(), 650);
    this.titleEl = null;
  }

  // ---------- HUD ----------
  showHUD(v) { this.el.hud.classList.toggle('hidden', !v); }
  showTouch(v) { this.el.touch.classList.toggle('hidden', !v); document.body.classList.toggle('touch-ui', !!v); }
  bindTouchButtons(input) {
    this.el.touch.querySelectorAll('[data-k]').forEach((b) => {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); input.press(b.dataset.k); }, { passive: false });
      b.addEventListener('click', () => input.press(b.dataset.k));
    });
    // 按住不放的键（失重时的上浮 / 下沉）：手指按着就一直算按下，松开 / 滑出去就松开
    this.el.touch.querySelectorAll('[data-hold]').forEach((b) => {
      const k = b.dataset.hold;
      const on = (e) => { e.preventDefault(); input.hold(k, true); b.classList.add('on'); };
      const off = () => { input.hold(k, false); b.classList.remove('on'); };
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off); b.addEventListener('touchcancel', off);
      b.addEventListener('mousedown', on); b.addEventListener('mouseup', off); b.addEventListener('mouseleave', off);
    });
  }
  // 失重（第五章）：触屏按钮和键位提示换成上浮 / 下沉
  setZeroG(v) { document.body.classList.toggle('zero-g', !!v); }
  setClock(time, sub) {
    this.el.ct.textContent = time;
    this.el.cr.textContent = sub;
  }
  // 鉴赏模式：藏起任务、密码格、提示 / 线索按钮，露出"下一关"
  setViewMode(v) { document.body.classList.toggle('mode-view', !!v); }
  setChapterTag(text, lockName = '门锁') { this.el.chap.textContent = text || ''; this.el.codeBox.querySelector('span').textContent = lockName; }
  // 每一章的画风：HUD 也换一套配色（body 上的 class）
  setTheme(theme) {
    document.body.classList.remove('theme-ruin', 'theme-jungle', 'theme-frost', 'theme-space', 'theme-finale');
    if (theme !== 'normal') document.body.classList.add(`theme-${theme}`);
  }
  setCodes(digits, found, icons = null) {
    if (this.el.codes.length !== digits.length || this._codeIcons !== String(icons)) {
      this._codeIcons = String(icons);
      this.el.codes.forEach((b) => b.remove());
      this.el.codes = digits.map((_, i) => { const b = h('b', '', '?'); if (icons) b.dataset.ic = icons[i]; this.el.codeBox.appendChild(b); return b; });
    }
    this.el.codes.forEach((b, i) => {
      const got = found[i];
      const txt = got ? String(digits[i]) : '?';
      if (b.textContent !== txt) { b.textContent = txt; b.classList.toggle('got', got); }
    });
  }
  setObjectives(list) {
    const key = list.map((o) => o.text + o.done).join('|');
    if (key === this._objKey) return;
    const prev = new Set([...this.el.obj.querySelectorAll('li')].map((li) => li.dataset.t));
    this._objKey = key;
    this.el.obj.innerHTML = '';
    for (const o of list) {
      const li = h('li', (o.done ? 'done ' : '') + (prev.has(o.text) ? '' : 'new'), esc(o.text));
      li.dataset.t = o.text;
      this.el.obj.appendChild(li);
    }
  }
  setPrompt(verb, obj) {
    const key = verb ? `${verb}|${obj}` : '';
    if (key === this._lastPrompt) return;
    this._lastPrompt = key;
    if (!verb) { this.el.prompt.classList.add('hidden'); this.el.cross.classList.remove('active'); return; }
    $('.verb', this.el.prompt).textContent = verb;
    $('.obj', this.el.prompt).textContent = obj;
    this.el.prompt.classList.remove('hidden');
    this.el.cross.classList.add('active');
  }
  subtitle(text, dur = 3.5, who = '') {
    clearTimeout(this._subTimer);
    this.el.sub.innerHTML = (who ? `<span class="who">${esc(who)}</span>` : '') + esc(text);
    this.el.sub.style.opacity = '1';
    this._subTimer = setTimeout(() => (this.el.sub.style.opacity = '0'), dur * 1000);
  }
  toast(text, kind = '', icon = '') {
    const t = h('div', `toast ${kind}`, `${icon ? `<span class="ic">${icon}</span>` : ''}<span>${text}</span>`);
    this.el.toasts.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, 3200);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }
  setInventory(items, { onClick, activeId = null, newId = null } = {}) {
    const inv = this.el.inv;
    inv.innerHTML = '';
    items.forEach((it, i) => {
      const s = h('div', 'slot' + (it.id === activeId ? ' on' : '') + (it.id === newId ? ' newitem' : ''), `<span class="k">${i + 1}</span>${it.icon}<span class="nm">${esc(it.name)}</span>`);
      s.title = it.desc || it.name;
      s.addEventListener('click', () => onClick && onClick(it, i));
      inv.appendChild(s);
    });
  }
  setClickToPlay(v) { this.el.click.classList.toggle('hidden', !v); }
  letterbox(v) { this.el.letterbox.classList.toggle('off', !v); }

  fade(to, { dur = 0.8, white = false, card = '' } = {}) {
    const f = this.el.fade;
    f.classList.toggle('white', white);
    f.style.transition = `opacity ${dur}s`;
    $('.card', f).innerHTML = card;
    f.classList.toggle('show', !!card);
    f.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, dur * 1000));
  }

  // ---------- 弹窗 ----------
  openModal(node, { onClose = null, closeKeys = ['Escape'], closable = true } = {}) {
    this.closeModal(true);
    const m = this.el.modal;
    m.innerHTML = '';
    m.appendChild(node);
    m.classList.remove('hidden');
    this.modalOpen = true;
    this._modalClose = onClose;
    if (closable) {
      const x = h('button', 'm-close', '✕');
      x.addEventListener('click', () => this.closeModal());
      node.appendChild(x);
      m.onclick = (e) => { if (e.target === m) this.closeModal(); };
    } else m.onclick = null;
    this._keyHandler = (e) => {
      if (e.target && e.target.tagName === 'INPUT') { if (e.code === 'Escape') this.closeModal(); return; }
      if (closable && closeKeys.includes(e.code)) { e.preventDefault(); this.closeModal(); }
    };
    setTimeout(() => window.addEventListener('keydown', this._keyHandler), 60);
  }
  closeModal(silent = false) {
    if (!this.modalOpen) return;
    const node = this.el.modal.firstChild;
    if (node && node._cleanup) node._cleanup();
    this.el.modal.classList.add('hidden');
    this.el.modal.innerHTML = '';
    window.removeEventListener('keydown', this._keyHandler);
    this.modalOpen = false;
    const cb = this._modalClose;
    this._modalClose = null;
    if (!silent && cb) cb();
  }

  // 纸张/便条
  doc({ title = '', html = '', variant = '', foot = '按 E / Esc 关闭' }) {
    const p = h('div', `paper ${variant}`, `${title ? `<h3>${esc(title)}</h3>` : ''}<div class="content">${html}</div>${foot ? `<div class="m-foot">${foot}</div>` : ''}`);
    return p;
  }

  // 滚轮密码锁
  lock({ n = 4, title = '密码锁', hint = '', initial = null, onSubmit, onTick, labels = null, variant = '' }) {
    const box = h('div', `lockbox ${variant}`, `<h3>${esc(title)}</h3><div class="hint">${hint}</div><div class="wheels"></div><div class="actions"><button class="btn primary" data-a="ok">开 锁</button></div><div class="m-foot">点击 ▲▼ / 滚轮 / 直接敲数字键 · Enter 确认</div>`);
    const vals = initial ? [...initial] : new Array(n).fill(0);
    let sel = 0;
    const wheelsEl = $('.wheels', box);
    const wheels = [];
    for (let i = 0; i < n; i++) {
      const w = h('div', 'wheel', `${labels ? `<div class="wl">${labels[i]}</div>` : ''}<button data-d="-1">▲</button><div class="face"><div class="strip"></div></div><button data-d="1">▼</button>`);
      const strip = $('.strip', w);
      for (let k = -1; k <= 10; k++) strip.appendChild(h('div', '', String((k + 10) % 10)));
      const render = () => { strip.style.transform = `translateY(${-(vals[i] + 1) * 46 + 23}px)`; };
      const bump = (d) => { vals[i] = (vals[i] + d + 10) % 10; render(); onTick && onTick(); sel = i; syncSel(); };
      w.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => bump(Number(b.dataset.d) === -1 ? 1 : -1)));
      $('.face', w).addEventListener('wheel', (e) => { e.preventDefault(); bump(e.deltaY > 0 ? -1 : 1); }, { passive: false });
      $('.face', w).addEventListener('click', () => { sel = i; syncSel(); });
      render();
      wheels.push({ w, bump, render });
      wheelsEl.appendChild(w);
    }
    const syncSel = () => wheels.forEach((o, i) => o.w.classList.toggle('sel', i === sel));
    syncSel();
    const submit = () => {
      const ok = onSubmit(vals.join(''));
      if (!ok) { box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); }
      else box.classList.add('opened');
    };
    $('[data-a=ok]', box).addEventListener('click', submit);
    box._keys = (e) => {
      if (/^Digit\d$|^Numpad\d$/.test(e.code)) { const d = Number(e.code.slice(-1)); vals[sel] = d; wheels[sel].render(); onTick && onTick(); sel = Math.min(n - 1, sel + 1); syncSel(); }
      else if (e.code === 'ArrowLeft') { sel = Math.max(0, sel - 1); syncSel(); }
      else if (e.code === 'ArrowRight') { sel = Math.min(n - 1, sel + 1); syncSel(); }
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') wheels[sel].bump(1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') wheels[sel].bump(-1);
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') submit();
      else if (e.code === 'Backspace') { sel = Math.max(0, sel - 1); syncSel(); }
    };
    window.addEventListener('keydown', box._keys);
    box._cleanup = () => window.removeEventListener('keydown', box._keys);
    return box;
  }

  // 手机微信群（室友名字每局随机，头像颜色按出场顺序分配）
  phone({ title = '211相亲相爱一家人', messages = [], time = '07:3x', battery = 10, members = 4, footer = '欠费停机，发不出消息 😭' }) {
    const p = h('div', 'phone', `<div class="scr"><div class="sb"><span>${esc(time)}</span><span>📶 🔋${battery}%</span></div><div class="hdr"><span class="back">‹</span>${esc(title)} (${members})</div><div class="msgs"></div><div class="inp"><div>${esc(footer)}</div><button disabled>发送</button></div></div>`);
    const box = $('.msgs', p);
    const palette = ['#e0853a', '#4a8fe0', '#d9508a', '#8a6fd6'];
    const colors = { 我: '#39b26a' };
    const colorOf = (who) => colors[who] || (colors[who] = palette[(Object.keys(colors).length - 1) % palette.length]);
    const addMsg = (m, anim = false) => {
      if (m.time) box.appendChild(h('div', 'tm', esc(m.time)));
      const me = m.who === '我';
      const row = h('div', 'row' + (me ? ' me' : '') + (anim ? ' newmsg' : ''), `<div class="av" style="background:${colorOf(m.who)}">${esc(m.who.slice(-1))}</div><div><div class="nm">${me ? '' : esc(m.who)}</div><div class="bub">${m.html || esc(m.text)}</div></div>`);
      box.appendChild(row);
    };
    messages.forEach((m) => addMsg(m));
    p._add = (m) => { addMsg(m, true); box.scrollTop = box.scrollHeight; };
    setTimeout(() => (box.scrollTop = box.scrollHeight), 30);
    return p;
  }

  // 电脑
  pc({ name, time, unlocked, hint, onUnlock, noteText, onOpenGame, onTyping }) {
    const p = h('div', 'pc', `<div class="scr"></div><div class="led"></div>`);
    const scr = $('.scr', p);
    const showDesk = () => {
      scr.innerHTML = `<div class="desk"><div class="icons">
        <div class="icon" data-i="note"><i>📝</i>给睡神.txt</div>
        <div class="icon" data-i="folder"><i>📁</i>期末资料</div>
        <div class="icon" data-i="game"><i>🎮</i>峡谷</div>
        <div class="icon" data-i="pdf"><i>📕</i>高数.pdf</div>
        <div class="icon" data-i="bin"><i>🗑️</i>回收站</div></div>
        <div class="taskbar"><span>⊞  🔍  📁  🌐</span><span>${esc(time)}</span></div></div>`;
      const open = (title, body) => {
        const old = $('.win', scr); if (old) old.remove();
        const w = h('div', 'win', `<div class="bar"><span>${esc(title)}</span><b>✕</b></div><div class="body">${body}</div>`);
        $('.bar b', w).addEventListener('click', () => w.remove());
        $('.desk', scr).appendChild(w);
      };
      scr.querySelectorAll('.icon').forEach((ic) => ic.addEventListener('click', () => {
        this.audio.click();
        const k = ic.dataset.i;
        if (k === 'note') open('给睡神.txt - 记事本', noteText);
        if (k === 'folder') open('期末资料', '📄 高数重点.docx\n📄 历年真题(答案版).pdf  ← 打不开\n📄 复习计划.xlsx  ← 空的');
        if (k === 'game') { open('峡谷', '<b>今天还是别打了吧……</b>\n\n（你深吸一口气，关掉了游戏图标）'); onOpenGame && onOpenGame(); }
        if (k === 'pdf') open('高数.pdf', '第七章 微分方程\n\n……看了三行，你感到一阵眩晕。');
        if (k === 'bin') open('回收站', '🗑️ 我的青春.zip\n🗑️ 学习计划(最终版)(真的最终版).doc');
      }));
      open('给睡神.txt - 记事本', noteText);
    };
    if (unlocked) showDesk();
    else {
      scr.innerHTML = `<div class="lock"><div class="time">${esc(time)}</div><div class="date">期末考试日</div><div class="ava">${esc(name.slice(0, 1))}</div><div class="un">${esc(name)}</div><input type="password" maxlength="12" placeholder="输入密码 · Enter"><div class="ph">${hint}</div></div>`;
      const inp = $('input', scr);
      setTimeout(() => inp.focus(), 80);
      inp.addEventListener('input', () => onTyping && onTyping());
      inp.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          const ok = onUnlock(inp.value.trim().toUpperCase());
          if (ok) { setTimeout(showDesk, 450); $('.ph', scr).textContent = '欢迎回来'; $('.ph', scr).classList.remove('err'); }
          else { $('.ph', scr).textContent = '密码不正确。' + hint; $('.ph', scr).classList.add('err'); inp.value = ''; }
        }
      });
    }
    return p;
  }

  panel(html, cls = '') { return h('div', `panel ${cls}`, html); }

  // 结局广场"留下来欣赏"时，屏幕下方的操作提示和"查看结算"按钮
  admireBar({ touch = false, onResults }) {
    const tip = touch ? '单指拖动转视角 · 双指缩放' : '拖动鼠标转视角 · 滚轮缩放（WASD / 方向键也行）· Esc 回到结算';
    const b = h('div', '', `<span>🎖️ ${tip}</span><button class="btn primary" data-a="results">📋 查看结算</button>`);
    b.id = 'admire-bar';
    $('[data-a=results]', b).addEventListener('click', () => { this.audio.click(); onResults(); });
    document.body.appendChild(b);
    return b;
  }
}
