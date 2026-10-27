/* js/ui.js —— 通用格式化与提示 */
(function (global) {
  'use strict';

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  }

  function fmtDT(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fmtHM(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function durText(minutes) {
    var m = Math.max(0, Math.round(minutes));
    var h = Math.floor(m / 60);
    var r = m % 60;
    return h > 0 ? (h + ' 小时 ' + r + ' 分') : (r + ' 分');
  }
  function pct(x, digits) {
    var d = digits == null ? 1 : digits;
    return (Number(x) * 100).toFixed(d) + '%';
  }
  function money(v) { return '¥' + Number(v || 0).toFixed(2); }

  function toast(msg, kind) {
    var wrap = document.getElementById('toast');
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.className = el.className + ' out';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 2400);
  }

  function copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        toast('已复制：' + text, 'ok');
        return;
      }
    } catch (e) { /* 忽略，走降级 */ }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('已复制：' + text, 'ok');
    } catch (e2) {
      toast('复制失败，请手动选择取餐码', 'warn');
    }
  }

  function badge(text, kind) { return '<span class="tag ' + kind + '">' + esc(text) + '</span>'; }

  function slotLabel(order) {
    return order.groupId + ' ' + (order.cab === 'M' ? '主柜' : '副柜') + '-' + pad2(order.cell) + ' 号格口';
  }

  global.UI = {
    esc: esc,
    pad2: pad2,
    fmtDT: fmtDT,
    fmtHM: fmtHM,
    fmtDate: fmtDate,
    durText: durText,
    pct: pct,
    money: money,
    toast: toast,
    copy: copy,
    badge: badge,
    slotLabel: slotLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
