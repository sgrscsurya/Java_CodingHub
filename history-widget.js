/* JPrime — site-wide History widget.
   Self-contained: injects its own CSS + FAB/panel markup, and tracks page
   visits (plus any custom events pages choose to log via JPrimeHistory.log)
   in localStorage, shared across every page on the site.

   Retention: the raw activity log is pruned to the last 15 days on every
   load. Aggregate visit counts (used for "Most Visited") are stored
   separately and are NEVER pruned — that's what survives the 15-day reset. */
(function () {
  'use strict';

  var LOG_KEY    = 'jprime-history-log';
  var VISITS_KEY = 'jprime-history-visits';
  var RETENTION_MS = 15 * 24 * 60 * 60 * 1000;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function loadLog() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveLog(a) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(a)); } catch (e) { /* storage unavailable — history just won't persist */ }
  }
  function loadVisits() {
    try { return JSON.parse(localStorage.getItem(VISITS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveVisits(o) {
    try { localStorage.setItem(VISITS_KEY, JSON.stringify(o)); } catch (e) { /* storage unavailable — history just won't persist */ }
  }

  function pruneLog() {
    var cutoff = Date.now() - RETENTION_MS;
    var log = loadLog();
    var kept = log.filter(function (e) { return e.ts >= cutoff; });
    if (kept.length !== log.length) saveLog(kept);
  }

  // opts: { key, label, url, cat }
  //   key  — unique id for frequency tracking, e.g. "card:149" or "page:/NUMBERS/numbers_level3.html"
  //   url  — absolute URL to jump back to when resuming / clicking this entry
  function logActivity(action, opts) {
    opts = opts || {};
    var entry = {
      ts: Date.now(), action: action,
      key: opts.key || null, label: opts.label || null,
      url: opts.url || location.href, cat: opts.cat || null
    };
    var log = loadLog();
    log.push(entry);
    saveLog(log);

    if (opts.key) {
      var visits = loadVisits();
      if (!visits[opts.key]) visits[opts.key] = { key: opts.key, count: 0, lastTs: 0 };
      visits[opts.key].label = opts.label;
      visits[opts.key].url   = entry.url;
      visits[opts.key].cat   = opts.cat;
      visits[opts.key].count++;
      visits[opts.key].lastTs = entry.ts;
      saveVisits(visits);
    }
  }

  // Finds the most recent log entry that points somewhere other than the
  // page you're currently on — so "Resume" never just points back at itself
  // (e.g. the History icon only shows on the homepage, so the very last
  // entry is almost always "Visited JPrime" for the homepage itself).
  function findElsewhere(logMostRecentFirst) {
    return logMostRecentFirst.find(function (e) {
      if (!e.url) return false;
      try { return new URL(e.url, location.href).pathname !== location.pathname; }
      catch (err) { return false; }
    });
  }

  function getTopVisited(n) {
    return Object.values(loadVisits()).sort(function (a, b) { return b.count - a.count; }).slice(0, n);
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDate(ts) {
    var d = new Date(ts), today = new Date();
    var yest = new Date(); yest.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  }

  function render() {
    pruneLog();
    var log = loadLog().slice().reverse();
    var top = getTopVisited(5);
    var html = '';

    var last = findElsewhere(log);
    if (last) {
      html += '<div class="jph-resume-card">' +
        '<div class="jph-resume-label">▶ Continue where you left off</div>' +
        '<div class="jph-resume-title">' + esc(last.label || last.action) + '</div>' +
        '<button class="jph-resume-btn" id="jphResumeBtn">▶ Resume</button>' +
        '</div>';
    }

    if (top.length) {
      html += '<div class="jph-section-label">Most Visited</div>';
      top.forEach(function (v, i) {
        html += '<button class="jph-mv-item" data-url="' + esc(v.url) + '">' +
          '<span class="jph-mv-rank">' + (i + 1) + '</span>' +
          '<span class="jph-item-info"><span class="jph-mv-title">' + esc(v.label || v.key) + '</span></span>' +
          '<span class="jph-mv-count">' + v.count + '×</span>' +
          '</button>';
      });
    }

    if (log.length) {
      html += '<div class="jph-section-label">Recent Activity (15 days)</div>';
      var lastDate = null;
      log.slice(0, 300).forEach(function (e) {
        var dl = fmtDate(e.ts);
        if (dl !== lastDate) { html += '<div class="jph-log-date">' + dl + '</div>'; lastDate = dl; }
        var clickable = !!e.url;
        html += '<button class="jph-log-item' + (clickable ? ' clickable' : '') + '"' +
          (clickable ? ' data-url="' + esc(e.url) + '"' : '') + '>' +
          '<span class="jph-log-time">' + fmtTime(e.ts) + '</span>' +
          '<span class="jph-item-info"><span class="jph-log-title">' + esc(e.action) + (e.label ? ' — ' + esc(e.label) : '') + '</span></span>' +
          '</button>';
      });
    }

    if (!log.length && !top.length) {
      html = '<div class="jph-empty">No activity yet.<br>Explore topics and your history<br>will show up here.</div>';
    } else {
      html += '<button class="jph-clear-btn" id="jphClearBtn">🗑 Clear Recent Activity</button>';
    }

    var body = document.getElementById('jphBody');
    body.innerHTML = html;

    var resumeBtn = document.getElementById('jphResumeBtn');
    if (resumeBtn) resumeBtn.onclick = resumeLast;
    var items = body.querySelectorAll('.jph-mv-item, .jph-log-item.clickable');
    items.forEach(function (el) {
      el.onclick = function () {
        var u = el.getAttribute('data-url');
        closePanel();
        if (u) navigateTo(u);
      };
    });
    var clearBtn = document.getElementById('jphClearBtn');
    if (clearBtn) clearBtn.onclick = clearLog;
  }

  function navigateTo(url) {
    var target;
    try { target = new URL(url, location.href); } catch (e) { return; }
    if (target.origin === location.origin && target.pathname === location.pathname) {
      history.replaceState(null, '', target.href);
      if (typeof window.onJPrimeHistoryResume === 'function') window.onJPrimeHistoryResume(target);
      return;
    }
    location.href = target.href;
  }

  function resumeLast() {
    var log = loadLog().slice().reverse();
    var last = findElsewhere(log);
    closePanel();
    if (last && last.url) navigateTo(last.url);
  }

  function clearLog() {
    showConfirm(
      'Clear Recent Activity?',
      'Your Most Visited list will be kept — only the day-by-day activity log is cleared.',
      'Clear'
    ).then(function (ok) {
      if (!ok) return;
      saveLog([]);
      render();
    });
  }

  // Centered confirm dialog — replaces the native browser confirm() popup.
  function showConfirm(title, message, confirmLabel) {
    return new Promise(function (resolve) {
      var overlay = document.getElementById('jphConfirmOverlay');
      document.getElementById('jphConfirmTitle').textContent = title;
      document.getElementById('jphConfirmMsg').textContent = message;
      var confirmBtn = document.getElementById('jphConfirmOk');
      var cancelBtn  = document.getElementById('jphConfirmCancel');
      confirmBtn.textContent = confirmLabel || 'Confirm';

      function cleanup(result) {
        overlay.classList.remove('open');
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') cleanup(false);
        if (e.key === 'Enter') cleanup(true);
      }

      confirmBtn.onclick = function () { cleanup(true); };
      cancelBtn.onclick  = function () { cleanup(false); };
      overlay.onclick = function (e) { if (e.target === overlay) cleanup(false); };
      document.addEventListener('keydown', onKey);

      overlay.classList.add('open');
      confirmBtn.focus();
    });
  }

  function openPanel() {
    render();
    document.getElementById('jphOverlay').classList.add('open');
    document.getElementById('jphPanel').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (typeof window.onJPrimeHistoryOpen === 'function') window.onJPrimeHistoryOpen();
  }
  function closePanel() {
    var ov = document.getElementById('jphOverlay'), pn = document.getElementById('jphPanel');
    if (ov) ov.classList.remove('open');
    if (pn) pn.classList.remove('open');
    document.body.style.overflow = '';
  }

  var CSS = '' +
    '.jph-fab{position:fixed;bottom:28px;left:28px;z-index:200;width:auto;height:auto;' +
    'display:flex;align-items:center;justify-content:center;background:transparent;' +
    'color:rgba(255,255,255,0.55);border:none;cursor:pointer;padding:6px;' +
    'box-shadow:none;transition:color .2s,transform .2s;}' +
    '.jph-fab svg{width:24px;height:24px;display:block;}' +
    '.jph-fab:hover{color:#fff;transform:translateY(-2px);}' +
    '.jph-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);' +
    'opacity:0;pointer-events:none;transition:opacity .25s;}' +
    '.jph-overlay.open{opacity:1;pointer-events:all;}' +
    '.jph-panel{position:fixed;top:0;right:0;bottom:0;z-index:401;width:340px;max-width:92vw;' +
    'background:#111217;border-left:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;' +
    'transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);box-shadow:-8px 0 48px rgba(0,0,0,0.6);' +
    'font-family:"Inter",sans-serif;}' +
    '.jph-panel.open{transform:translateX(0);}' +
    '.jph-head{display:flex;align-items:center;justify-content:space-between;padding:20px 20px 16px;' +
    'border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;}' +
    '.jph-head-title{font-size:14px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;' +
    'color:#a78bfa;display:flex;align-items:center;gap:8px;}' +
    '.jph-close{background:rgba(255,255,255,0.06);border:none;color:#94a3b8;width:30px;height:30px;' +
    'border-radius:8px;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;' +
    'transition:all .15s;}' +
    '.jph-close:hover{background:rgba(255,255,255,0.12);color:#fff;}' +
    '.jph-body{flex:1;overflow-y:auto;padding:16px 0 24px;scrollbar-width:thin;scrollbar-color:#333 transparent;}' +
    '.jph-body::-webkit-scrollbar{width:4px;}' +
    '.jph-body::-webkit-scrollbar-thumb{background:#333;border-radius:2px;}' +
    '.jph-section-label{font-size:9px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;' +
    'color:#555;padding:4px 20px 10px;}' +
    '.jph-resume-card{margin:0 16px 22px;padding:16px;' +
    'background:linear-gradient(135deg,rgba(124,58,237,0.14),rgba(6,182,212,0.08));' +
    'border:1px solid rgba(124,58,237,0.3);border-radius:14px;}' +
    '.jph-resume-label{font-size:10px;color:#94a3b8;margin-bottom:6px;}' +
    '.jph-resume-title{font-size:14px;font-weight:700;color:#fff;margin-bottom:12px;line-height:1.4;}' +
    '.jph-resume-btn{display:flex;align-items:center;justify-content:center;gap:6px;' +
    'background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;border:none;padding:10px 16px;' +
    'border-radius:100px;font-size:12.5px;font-weight:700;cursor:pointer;width:100%;' +
    'font-family:"Inter",sans-serif;transition:transform .15s;}' +
    '.jph-resume-btn:hover{transform:scale(1.02);}' +
    '.jph-empty{padding:34px 24px;text-align:center;color:#555;font-size:12.5px;line-height:1.6;}' +
    '.jph-mv-item,.jph-log-item{display:flex;align-items:center;gap:10px;padding:8px 20px;' +
    'cursor:default;transition:background .15s;border:none;background:none;width:100%;' +
    'text-align:left;font-family:"Inter",sans-serif;}' +
    '.jph-mv-item{cursor:pointer;}' +
    '.jph-mv-item:hover,.jph-log-item.clickable:hover{background:rgba(255,255,255,0.04);cursor:pointer;}' +
    '.jph-mv-rank{width:20px;height:20px;border-radius:50%;flex-shrink:0;background:rgba(124,58,237,0.15);' +
    'color:#a78bfa;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;}' +
    '.jph-item-info{flex:1;min-width:0;}' +
    '.jph-mv-title,.jph-log-title{font-size:12.5px;color:#ccc;font-weight:500;white-space:nowrap;' +
    'overflow:hidden;text-overflow:ellipsis;display:block;}' +
    '.jph-mv-item:hover .jph-mv-title,.jph-log-item.clickable:hover .jph-log-title{color:#fff;}' +
    '.jph-mv-count,.jph-log-time{font-size:10px;color:#555;flex-shrink:0;font-family:"JetBrains Mono",monospace;}' +
    '.jph-log-date{padding:14px 20px 6px;font-size:10px;font-weight:800;letter-spacing:1px;' +
    'color:#666;text-transform:uppercase;}' +
    '.jph-clear-btn{margin:16px 16px 4px;padding:9px;width:calc(100% - 32px);' +
    'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#94a3b8;' +
    'border-radius:10px;font-size:11.5px;cursor:pointer;font-family:"Inter",sans-serif;transition:all .15s;}' +
    '.jph-clear-btn:hover{background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.3);color:#f87171;}' +
    '@media (max-width:768px){.jph-fab{bottom:18px;left:14px;}.jph-fab svg{width:21px;height:21px;}' +
    '.jph-panel{width:300px;}}' +
    '@media (max-width:400px){.jph-fab{bottom:14px;left:12px;}.jph-fab svg{width:19px;height:19px;}}' +
    '.jph-confirm-overlay{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,0.65);' +
    'backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;' +
    'opacity:0;pointer-events:none;transition:opacity .2s;}' +
    '.jph-confirm-overlay.open{opacity:1;pointer-events:all;}' +
    '.jph-confirm-box{width:360px;max-width:100%;background:#15161c;' +
    'border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;' +
    'box-shadow:0 24px 70px rgba(0,0,0,0.55);font-family:"Inter",sans-serif;' +
    'transform:scale(.94) translateY(6px);transition:transform .2s;}' +
    '.jph-confirm-overlay.open .jph-confirm-box{transform:scale(1) translateY(0);}' +
    '.jph-confirm-title{font-size:16px;font-weight:800;color:#fff;margin-bottom:10px;}' +
    '.jph-confirm-msg{font-size:13px;color:#94a3b8;line-height:1.6;margin-bottom:22px;}' +
    '.jph-confirm-actions{display:flex;gap:10px;justify-content:flex-end;}' +
    '.jph-confirm-btn{padding:10px 18px;border-radius:100px;font-size:12.5px;font-weight:700;' +
    'cursor:pointer;font-family:"Inter",sans-serif;border:none;transition:all .15s;}' +
    '.jph-confirm-cancel{background:rgba(255,255,255,0.06);color:#94a3b8;}' +
    '.jph-confirm-cancel:hover{background:rgba(255,255,255,0.1);color:#fff;}' +
    '.jph-confirm-ok{background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;' +
    'box-shadow:0 4px 20px rgba(239,68,68,0.35);}' +
    '.jph-confirm-ok:hover{transform:scale(1.03);box-shadow:0 6px 26px rgba(239,68,68,0.5);}' +
    '@media (max-width:420px){.jph-confirm-box{padding:20px;}}';

  function injectMarkup() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<button class="jph-fab" id="jphFab" title="History">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline>' +
      '</svg></button>' +
      '<div class="jph-overlay" id="jphOverlay"></div>' +
      '<div class="jph-panel" id="jphPanel">' +
      '<div class="jph-head"><div class="jph-head-title">🕐 &nbsp;History</div>' +
      '<button class="jph-close" id="jphCloseBtn">✕</button></div>' +
      '<div class="jph-body" id="jphBody"></div></div>' +
      '<div class="jph-confirm-overlay" id="jphConfirmOverlay">' +
      '<div class="jph-confirm-box">' +
      '<div class="jph-confirm-title" id="jphConfirmTitle"></div>' +
      '<div class="jph-confirm-msg" id="jphConfirmMsg"></div>' +
      '<div class="jph-confirm-actions">' +
      '<button class="jph-confirm-btn jph-confirm-cancel" id="jphConfirmCancel">Cancel</button>' +
      '<button class="jph-confirm-btn jph-confirm-ok" id="jphConfirmOk">Confirm</button>' +
      '</div></div></div>';

    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

    document.getElementById('jphFab').addEventListener('click', openPanel);
    document.getElementById('jphOverlay').addEventListener('click', closePanel);
    document.getElementById('jphCloseBtn').addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });

    // The History icon/panel is only shown on the homepage — every page still
    // tracks activity into the same shared log regardless.
    if (!isHomePage()) document.getElementById('jphFab').style.display = 'none';
  }

  function isHomePage() {
    var last = location.pathname.substring(location.pathname.lastIndexOf('/') + 1);
    return last === '' || last === 'index.html';
  }

  function pageCategory() {
    var p = location.pathname;
    if (p.indexOf('/NUMBERS/') !== -1) return 'Numbers';
    if (p.indexOf('/ARRAYS/') !== -1) return 'Arrays';
    if (p.indexOf('java_visualization') !== -1) return 'Visualization Sheet';
    return 'Home';
  }

  function init() {
    injectMarkup();
    pruneLog();

    if (!document.body.hasAttribute('data-jph-no-autolog')) {
      var label = document.title.replace(/\s*\|\s*JPrime\s*$/, '') || document.title;
      logActivity('Visited', { key: 'page:' + location.pathname, label: label, url: location.href, cat: pageCategory() });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.JPrimeHistory = {
    log: logActivity,
    open: openPanel,
    close: closePanel,
    resumeLast: resumeLast,
    render: render,
    prune: pruneLog
  };
})();
