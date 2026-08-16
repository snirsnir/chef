const { ipcRenderer } = require('electron');

const STAGES = [
  { id: 1, label: 'הרחוב האיטלקי',  file: 'street.html',   query: {} },
  { id: 2, label: 'פנים המסעדה',     file: 'rest.html',     query: {} },
  { id: 3, label: 'הכנת הבצק',       file: 'rest.html',     query: { stage: '3' } },
  { id: 4, label: 'הכנת פיצה',       file: 'rest.html',     query: { stage: '4' } },
  { id: 5, label: 'אלכס',            file: 'rest.html',     query: { stage: '5' } },
  { id: 6, label: 'אנטונלה',         file: 'rest.html',     query: { stage: '6' } },
  { id: 7, label: 'המשפחה',         file: 'rest.html',     query: { stage: '7' } },
  { id: 8, label: 'עמוד המשוב',     file: 'feedback.html', query: {} }
];

window.addEventListener('DOMContentLoaded', () => {
  const filename = window.location.pathname.replace(/\\/g, '/').split('/').pop() || 'index.html';

  // ── index.html: inject update-checker button & modal ──────────────────
  if (filename === 'index.html' || filename === '') {
    const REPO    = 'snirsnir/chef';
    const EXCLUDE = ['main.js','preload.js','package.json','package-lock.json',
                     'version.json','node_modules','.git','README.md','LICENSE',
                     '.gitignore','oldgames'];

    const updStyle = document.createElement('style');
    updStyle.textContent = `
      #upd-btn {
        position: fixed; bottom: 20px; right: 20px; z-index: 9999;
        font-family: 'Varela Round', Arial, sans-serif; font-size: 13px;
        color: rgba(255,215,0,0.6); background: rgba(200,132,58,0.08);
        border: 1.5px solid rgba(200,132,58,0.3); border-radius: 8px;
        padding: 9px 16px; cursor: pointer; direction: rtl;
        transition: all 0.2s; letter-spacing: 0.3px;
      }
      #upd-btn:hover { background: rgba(200,132,58,0.18); border-color: rgba(200,132,58,0.65); color: #ffd700; }
      #upd-modal {
        display: none; position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,0.78); align-items: center; justify-content: center;
      }
      #upd-modal.open { display: flex; }
      #upd-box {
        background: linear-gradient(160deg, #1c0f03, #0d0600);
        border: 2px solid rgba(200,132,58,0.45); border-radius: 16px;
        width: 460px; max-width: 90vw; padding: 26px 30px 22px;
        font-family: 'Varela Round', Arial, sans-serif; direction: rtl; color: #fff;
        box-shadow: 0 0 50px rgba(200,80,0,0.22), 0 12px 50px rgba(0,0,0,0.85);
      }
      #upd-box h2 { font-size: 19px; color: #ffd700; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(200,132,58,0.25); }
      #upd-status { font-size: 15px; color: rgba(255,255,255,0.8); margin-bottom: 10px; min-height: 22px; }
      #upd-prog-wrap { display: none; margin: 10px 0 12px; }
      #upd-prog-track { width: 100%; height: 7px; background: rgba(200,132,58,0.15); border-radius: 4px; overflow: hidden; }
      #upd-prog-fill { height: 100%; width: 0%; background: linear-gradient(90deg,#c8843a,#ffd700); border-radius: 4px; transition: width 0.35s ease; }
      #upd-prog-label { font-size: 12px; color: rgba(255,215,0,0.5); margin-top: 5px; text-align: center; }
      #upd-log { display: none; max-height: 110px; overflow-y: auto; font-size: 11px; color: rgba(255,255,255,0.35); font-family: monospace; direction: ltr; margin: 8px 0; }
      #upd-actions { display: flex; gap: 10px; margin-top: 18px; }
      #upd-install { display: none; padding: 10px 22px; background: linear-gradient(135deg,#b84000,#e06010); color: #fff; border: none; border-radius: 8px; font-family: 'Varela Round',Arial,sans-serif; font-size: 14px; cursor: pointer; }
      #upd-install:hover { background: linear-gradient(135deg,#d05000,#ff7020); }
      #upd-dismiss { padding: 10px 22px; background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.55); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-family: 'Varela Round',Arial,sans-serif; font-size: 14px; cursor: pointer; }
      #upd-dismiss:hover { background: rgba(255,255,255,0.13); color: #fff; }
    `;
    document.head.appendChild(updStyle);

    const updBtn = document.createElement('button');
    updBtn.id = 'upd-btn';
    updBtn.textContent = '↓ בדוק עדכונים';
    document.body.appendChild(updBtn);

    const updModal = document.createElement('div');
    updModal.id = 'upd-modal';
    updModal.innerHTML = `
      <div id="upd-box">
        <h2>🍕 עדכון פיצריית שף יוסף</h2>
        <div id="upd-status"></div>
        <div id="upd-prog-wrap">
          <div id="upd-prog-track"><div id="upd-prog-fill"></div></div>
          <div id="upd-prog-label"></div>
        </div>
        <div id="upd-log"></div>
        <div id="upd-actions">
          <button id="upd-install">הורד והתקן</button>
          <button id="upd-dismiss">סגור</button>
        </div>
      </div>
    `;
    document.body.appendChild(updModal);

    const elStatus  = updModal.querySelector('#upd-status');
    const elProgWrap= updModal.querySelector('#upd-prog-wrap');
    const elFill    = updModal.querySelector('#upd-prog-fill');
    const elLabel   = updModal.querySelector('#upd-prog-label');
    const elLog     = updModal.querySelector('#upd-log');
    const elInstall = updModal.querySelector('#upd-install');
    const elDismiss = updModal.querySelector('#upd-dismiss');

    let latestSha = null;
    let busy      = false;

    function setStatus(t) { elStatus.textContent = t; }
    function addLog(t)    { elLog.style.display = 'block'; elLog.innerHTML += `<div>${t}</div>`; elLog.scrollTop = elLog.scrollHeight; }
    function setProgress(pct, label) {
      elProgWrap.style.display = 'block';
      elFill.style.width = pct + '%';
      elLabel.textContent = label || (Math.round(pct) + '%');
    }
    function resetModal() {
      elInstall.style.display = 'none';
      elProgWrap.style.display = 'none';
      elLog.style.display = 'none';
      elLog.innerHTML = '';
      latestSha = null;
    }

    async function checkUpdates() {
      updModal.classList.add('open');
      resetModal();
      setStatus('מתחבר ל-GitHub...');
      try {
        const r = await fetch(`https://api.github.com/repos/${REPO}/commits/main`,
          { headers: { 'User-Agent': 'Chef-Updater' } });
        if (!r.ok) throw new Error(`GitHub החזיר ${r.status}`);
        const d = await r.json();
        latestSha = d.sha;
        const local    = await ipcRenderer.invoke('read-version');
        const localSha = local ? local.commit : null;
        addLog(`גרסה נוכחית: ${localSha ? localSha.slice(0,7) : 'לא קיימת'}`);
        addLog(`גרסה מרוחקת: ${latestSha.slice(0,7)}`);
        if (localSha === latestSha) { setStatus('✅ הפעילות מעודכנת לגרסה האחרונה!'); return; }
        setStatus('🔄 נמצא עדכון חדש — לחץ להתקנה');
        elInstall.style.display = 'inline-block';
      } catch (e) {
        setStatus('❌ שגיאה: ' + e.message);
      }
    }

    async function startInstall() {
      if (busy || !latestSha) return;
      busy = true;
      elInstall.style.display = 'none';
      elDismiss.disabled = true;
      setStatus('מוריד רשימת קבצים...');
      try {
        const r = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${latestSha}?recursive=1`,
          { headers: { 'User-Agent': 'Chef-Updater' } });
        if (!r.ok) throw new Error(`Tree: ${r.status}`);
        const tree  = await r.json();
        const files = tree.tree.filter(f =>
          f.type === 'blob' &&
          !EXCLUDE.some(ex => f.path === ex || f.path.startsWith(ex + '/'))
        );
        addLog(`${files.length} קבצים לעדכון`);
        setProgress(0);
        ipcRenderer.send('start-update', files, latestSha);
      } catch (e) {
        setStatus('❌ שגיאה: ' + e.message);
        busy = false; elDismiss.disabled = false;
      }
    }

    ipcRenderer.on('update-progress', (_e, pct, fname) => {
      setProgress(pct);
      setStatus('מוריד: ' + fname);
    });
    ipcRenderer.on('update-done', (_e, ok, err) => {
      busy = false; elDismiss.disabled = false;
      if (ok) {
        setStatus('✅ עדכון הושלם! הפעילות מופעלת מחדש...');
        setProgress(100, '100%');
        setTimeout(() => ipcRenderer.send('restart-app'), 2500);
      } else {
        setStatus('❌ שגיאה בהורדה: ' + err);
      }
    });

    updBtn.addEventListener('click', checkUpdates);
    elDismiss.addEventListener('click', () => { if (!busy) updModal.classList.remove('open'); });
    elInstall.addEventListener('click', startInstall);
    return;
  }

  const params     = new URLSearchParams(window.location.search);
  const stageParam = parseInt(params.get('stage') || '0');

  let currentId = 0;
  if      (filename === 'street.html')   currentId = 1;
  else if (filename === 'rest.html')     currentId = stageParam >= 3 ? stageParam : 2;
  else if (filename === 'feedback.html') currentId = 8;

  const currentStage = STAGES.find(s => s.id === currentId);

  // ── CSS ──────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* Push game UI elements that sit near the top below the 46px titlebar */
    #scene-container          { top: 46px !important; height: calc(100% - 46px) !important; }
    #loading-screen,
    #start-screen,
    #pause-overlay            { top: 46px !important; height: calc(100% - 46px) !important; }
    #welcome-banner           { top: 70px !important; }
    #crosshair                { top: calc(50% + 23px) !important; }
    #achievement-alex         { top: 70px  !important; }
    #achievement-grandma      { top: 132px !important; }
    #achievement-kids         { top: 194px !important; }
    #rot-debug                { top: 56px  !important; }
    #mission-popup            { top: 56px  !important; }
    #health-panel             { top: 62px  !important; }
    #ingredient-hint          { top: 76px  !important; }

    #dev-titlebar {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: 46px;
      background: #0e0a02;
      display: flex;
      align-items: center;
      z-index: 99999;
      border-bottom: 1.5px solid rgba(255,215,0,0.18);
      -webkit-app-region: drag;
      user-select: none;
      font-family: 'Varela Round', Arial, sans-serif;
      direction: ltr;
    }

    /* App title */
    #dev-app-title {
      padding: 0 16px;
      color: rgba(255,215,0,0.5);
      font-size: 12px;
      white-space: nowrap;
      flex-shrink: 0;
      letter-spacing: 0.4px;
    }

    /* Menu bar area */
    #dev-menubar {
      display: flex;
      align-items: center;
      height: 100%;
      -webkit-app-region: no-drag;
      flex-shrink: 0;
    }

    /* "שלבים" menu trigger */
    #dev-stages-menu {
      position: relative;
      height: 100%;
      display: flex;
      align-items: center;
    }

    #dev-stages-trigger {
      height: 100%;
      padding: 0 16px;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      color: rgba(255,255,255,0.75);
      font-size: 13px;
      transition: background 0.14s;
      -webkit-app-region: no-drag;
      direction: rtl;
    }
    #dev-stages-trigger:hover,
    #dev-stages-trigger.open { background: rgba(255,255,255,0.08); color: #fff; }

    #dev-stages-trigger .arrow {
      font-size: 9px;
      opacity: 0.6;
      transition: transform 0.15s;
    }
    #dev-stages-trigger.open .arrow { transform: rotate(180deg); }

    /* Dropdown panel — opens to the right side now */
    #dev-stages-dropdown {
      display: none;
      position: absolute;
      top: 46px;
      right: 0;
      min-width: 240px;
      background: #1a1208;
      border: 1px solid rgba(255,215,0,0.22);
      border-top: none;
      border-radius: 0 0 8px 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.7);
      z-index: 100000;
      padding: 6px 0;
      direction: rtl;
    }
    #dev-stages-dropdown.open { display: block; }

    .dev-dd-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 16px;
      cursor: pointer;
      color: rgba(255,255,255,0.65);
      font-size: 13px;
      transition: background 0.12s, color 0.12s;
    }
    .dev-dd-item:hover  { background: rgba(255,215,0,0.08); color: #fff; }
    .dev-dd-item.active { color: #ffd700; background: rgba(255,215,0,0.06); }

    .dev-dd-num {
      width: 22px; height: 22px;
      border-radius: 50%;
      background: rgba(255,255,255,0.12);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: bold; flex-shrink: 0;
    }
    .dev-dd-item.active .dev-dd-num { background: #ffd700; color: #000; }

    .dev-dd-sep {
      height: 1px;
      background: rgba(255,215,0,0.1);
      margin: 4px 12px;
    }

    /* Current stage label in titlebar */
    #dev-current-stage {
      flex: 1;
      text-align: center;
      color: rgba(255,255,255,0.3);
      font-size: 12px;
      pointer-events: none;
      direction: rtl;
    }
    #dev-current-stage span {
      color: rgba(255,215,0,0.6);
      font-weight: bold;
    }

    /* Window controls */
    #dev-win-controls {
      display: flex;
      align-items: stretch;
      height: 46px;
      -webkit-app-region: no-drag;
      flex-shrink: 0;
    }
    .dev-win-btn {
      width: 46px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      color: rgba(255,255,255,0.55);
      font-size: 14px;
      transition: background 0.13s, color 0.13s;
    }
    .dev-win-btn:hover           { background: rgba(255,255,255,0.1); color: #fff; }
    .dev-win-btn.close-btn:hover { background: #c42b1c; color: #fff; }
  `;
  document.head.appendChild(style);

  // ── Titlebar ──────────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.id = 'dev-titlebar';

  // Window controls — LEFT side
  const winControls = document.createElement('div');
  winControls.id = 'dev-win-controls';

  const btnClose = document.createElement('div');
  btnClose.className = 'dev-win-btn close-btn';
  btnClose.innerHTML = '&#10005;';
  btnClose.title = 'סגור';
  btnClose.addEventListener('click', () => ipcRenderer.send('window-close'));

  const btnMin = document.createElement('div');
  btnMin.className = 'dev-win-btn';
  btnMin.innerHTML = '&#8722;';
  btnMin.title = 'מזער';
  btnMin.addEventListener('click', () => ipcRenderer.send('window-minimize'));

  const btnMax = document.createElement('div');
  btnMax.className = 'dev-win-btn';
  btnMax.innerHTML = '&#9633;';
  btnMax.title = 'הגדל / שחזר';
  btnMax.addEventListener('click', () => ipcRenderer.send('window-maximize'));

  winControls.appendChild(btnClose);
  winControls.appendChild(btnMin);
  winControls.appendChild(btnMax);
  bar.appendChild(winControls);

  // Current stage label — CENTER
  const currentLabel = document.createElement('div');
  currentLabel.id = 'dev-current-stage';
  if (currentStage) {
    currentLabel.innerHTML = `שלב ${currentStage.id} — <span>${currentStage.label}</span>`;
  }
  bar.appendChild(currentLabel);

  // Menu bar — RIGHT side
  const menubar = document.createElement('div');
  menubar.id = 'dev-menubar';

  // שלבים menu
  const stagesMenu = document.createElement('div');
  stagesMenu.id = 'dev-stages-menu';

  const trigger = document.createElement('div');
  trigger.id = 'dev-stages-trigger';
  trigger.innerHTML = `שלבים <span class="arrow">▼</span>`;

  const dropdown = document.createElement('div');
  dropdown.id = 'dev-stages-dropdown';

  STAGES.forEach((s, i) => {
    if (i === 4 || i === 7) {
      const sep = document.createElement('div');
      sep.className = 'dev-dd-sep';
      dropdown.appendChild(sep);
    }
    const item = document.createElement('div');
    item.className = 'dev-dd-item' + (s.id === currentId ? ' active' : '');
    item.innerHTML = `<span class="dev-dd-num">${s.id}</span><span>${s.label}</span>`;
    item.addEventListener('click', () => {
      closeDropdown();
      ipcRenderer.send('navigate', s.file, s.query);
    });
    dropdown.appendChild(item);
  });

  let isOpen = false;
  function openDropdown()  { isOpen = true;  trigger.classList.add('open');  dropdown.classList.add('open'); }
  function closeDropdown() { isOpen = false; trigger.classList.remove('open'); dropdown.classList.remove('open'); }

  trigger.addEventListener('click', () => isOpen ? closeDropdown() : openDropdown());

  document.addEventListener('click', (e) => {
    if (isOpen && !stagesMenu.contains(e.target)) closeDropdown();
  }, true);

  stagesMenu.appendChild(trigger);
  stagesMenu.appendChild(dropdown);
  menubar.appendChild(stagesMenu);
  bar.appendChild(menubar);

  // App title — rightmost
  const appTitle = document.createElement('div');
  appTitle.id = 'dev-app-title';
  appTitle.textContent = 'פיצריית השף יוסף';
  bar.appendChild(appTitle);

  document.body.insertBefore(bar, document.body.firstChild);

  setTimeout(() => window.dispatchEvent(new Event('resize')), 100);

  ipcRenderer.on('win-state', (_e, isMaximized) => {
    btnMax.innerHTML = isMaximized ? '&#10064;' : '&#9633;';
  });
});
