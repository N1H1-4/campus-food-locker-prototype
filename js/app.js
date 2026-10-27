/* js/app.js —— 路由、事件与三端联动控制 */
(function (global) {
  'use strict';

  var Store = global.Store;
  var UI = global.UI;

  var ui = {
    route: 'rider',
    pointId: null,
    zone: '常温',
    slotId: null,
    scanning: false,
    lastOrderId: null,
    userCode: '',
    lookup: null,
    adminTab: 'board',
    orderFilter: { point: '', status: '' },
    models: {}
  };

  var ROUTES = ['rider', 'user', 'admin'];

  function parseHash() {
    var h = (global.location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/');
    var r = parts[0];
    if (ROUTES.indexOf(r) < 0) r = 'rider';
    ui.route = r;
    if (r === 'admin' && parts[1] && AdminView.TABS.some(function (t) { return t.id === parts[1]; })) {
      ui.adminTab = parts[1];
    }
  }

  function goRoute(r, sub) {
    var h = '#/' + r + (sub ? '/' + sub : '');
    if (global.location.hash === h) { render(); }
    else global.location.hash = h;
  }

  function setNavActive() {
    var links = document.querySelectorAll('[data-route]');
    for (var i = 0; i < links.length; i++) {
      links[i].className = links[i].className.replace(/ active/g, '');
      if (links[i].getAttribute('data-route') === ui.route) links[i].className += ' active';
    }
  }

  function renderClock() {
    var el = document.getElementById('clock');
    if (!el) return;
    var off = Store.clockOffset();
    el.textContent = UI.fmtDT(Store.now()) + '  ' + UI.fmtHM(Store.now());
    var badge = document.getElementById('clockOffset');
    if (badge) {
      if (off > 0) {
        badge.textContent = '+' + Math.round(off / 60000) + ' 分钟';
        badge.className = 'tag warn';
      } else {
        badge.textContent = '真实时间';
        badge.className = 'tag grey';
      }
    }
  }

  function render() {
    parseHash();
    setNavActive();
    var el = document.getElementById('view');
    if (!el) return;
    if (ui.route === 'rider') global.RiderView.render(el, ui);
    else if (ui.route === 'user') global.UserView.render(el, ui);
    else global.AdminView.render(el, ui);
    renderClock();
    if (!Store.isStorageOK()) {
      var bar = document.getElementById('storageWarn');
      if (bar) bar.style.display = 'block';
    }
  }

  function findOrder(id) {
    var list = Store.state().orders;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function highlight(id) {
    var el = document.getElementById(id);
    if (el && el.focus) el.focus();
  }

  var actions = {
    selectPoint: function (el) {
      ui.pointId = el.getAttribute('data-pid');
      ui.slotId = null;
      ui.lastOrderId = null;
      var r = Store.rankSlots(ui.pointId, ui.zone);
      if (r.ok) ui.slotId = r.slot.id;
      render();
    },
    selectZone: function (el) {
      ui.zone = el.getAttribute('data-zone');
      ui.slotId = null;
      var r = Store.rankSlots(ui.pointId, ui.zone);
      if (r.ok) ui.slotId = r.slot.id;
      render();
    },
    selectSlot: function (el) {
      ui.slotId = el.getAttribute('data-slot');
      render();
    },
    store: function (el) {
      if (ui.scanning) return;
      var slotId = el.getAttribute('data-slot');
      ui.scanning = true;
      render();
      setTimeout(function () {
        var s = Store.slotOf(slotId);
        if (!s || s.st !== 'free') {
          ui.scanning = false;
          render();
          UI.toast('该格口状态已变化，请重新选择', 'warn');
          return;
        }
        var res = Store.createOrder(ui.pointId, ui.zone, slotId, '骑手（模拟）');
        ui.scanning = false;
        if (!res.ok) {
          render();
          UI.toast('投柜失败：' + res.reason, 'danger');
          return;
        }
        ui.lastOrderId = res.order.id;
        ui.slotId = null;
        render();
        UI.toast('投柜成功，取餐码 ' + res.order.code, 'ok');
      }, 700);
    },
    copy: function (el) { UI.copy(el.getAttribute('data-text')); },
    gotoUser: function (el) {
      var code = el.getAttribute('data-code');
      ui.userCode = code;
      ui.lookup = Store.findByCode(code);
      goRoute('user');
      render();
    },
    lookup: function () {
      var input = document.getElementById('codeInput');
      if (input) ui.userCode = input.value;
      var code = String(ui.userCode || '').replace(/\s/g, '');
      if (!/^[0-9]{6}$/.test(code)) {
        ui.lookup = { status: 'empty' };
        render();
        UI.toast('请输入 6 位数字取餐码', 'warn');
        return;
      }
      ui.userCode = code;
      ui.lookup = Store.findByCode(code);
      render();
      if (ui.lookup.status === 'notfound') UI.toast('未找到该取餐码', 'danger');
    },
    clearCode: function () {
      ui.userCode = '';
      ui.lookup = null;
      ui.models.userCode = '';
      render();
    },
    fillCode: function (el) {
      ui.userCode = el.getAttribute('data-code');
      ui.lookup = Store.findByCode(ui.userCode);
      render();
    },
    pickup: function (el) {
      var code = el.getAttribute('data-code');
      var res = Store.pickup(code);
      if (!res.ok) {
        UI.toast(res.reason, 'danger');
        render();
        return;
      }
      ui.userCode = code;
      ui.lookup = { status: 'picked', order: res.order };
      render();
      UI.toast('取餐成功：' + res.order.slotId + ' 格口已释放，超时费 ' + UI.money(res.fee.fee), 'ok');
    },
    adminTab: function (el) {
      goRoute('admin', el.getAttribute('data-tab'));
      render();
    },
    newTicket: function () {
      var pointId = ui.models.tPoint || Store.POINTS[0].id;
      var groups = Store.groupsOf(pointId);
      var groupId = ui.models.tGroup && groups.indexOf(ui.models.tGroup) >= 0 ? ui.models.tGroup : groups[0];
      var type = ui.models.tType || Store.TICKET_TYPES[0];
      var desc = ui.models.tDesc;
      if (!pointId || !groupId) { UI.toast('请选择点位与柜组', 'warn'); return; }
      var res = Store.createTicket(pointId, groupId, type || '其他', desc || '（未填写描述）');
      if (!res.ok) { UI.toast(res.reason, 'danger'); return; }
      ui.models.tDesc = '';
      render();
      UI.toast('工单 ' + res.ticket.id + ' 已创建，影响格口 ' + res.ticket.affected + ' 个', 'ok');
    },
    ticketAdvance: function (el) {
      var res = Store.advanceTicket(el.getAttribute('data-id'));
      if (!res.ok) { UI.toast(res.reason, 'warn'); return; }
      render();
      var msg = res.freed != null ? '工单 ' + res.ticket.id + ' 已修复，' + res.freed + ' 个格口恢复可用' : '工单 ' + res.ticket.id + ' 已转「' + Store.TICKET_STATUS[res.ticket.status] + '」';
      UI.toast(msg, 'ok');
    },
    remind: function (el) {
      UI.toast('已向取餐码 ' + el.getAttribute('data-code') + ' 的用户推送取餐提醒（模拟）', 'ok');
    },
    ff: function (el) {
      var min = parseInt(el.getAttribute('data-min'), 10) || 60;
      Store.advanceClock(min);
      if (ui.lookup && ui.lookup.status === 'stored') ui.lookup = Store.findByCode(ui.lookup.order.code);
      render();
      UI.toast('模拟时间已前进 ' + min + ' 分钟', 'ok');
    },
    resetClock: function () {
      Store.resetClock();
      if (ui.lookup && ui.lookup.status === 'stored') ui.lookup = Store.findByCode(ui.lookup.order.code);
      render();
      UI.toast('模拟时间已回到真实时间', 'ok');
    },
    resetData: function () {
      Store.resetDemo();
      ui.pointId = null;
      ui.slotId = null;
      ui.lastOrderId = null;
      ui.userCode = '';
      ui.lookup = null;
      ui.models = {};
      render();
      UI.toast('演示数据已重置为初始种子数据', 'ok');
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el) return;
    var name = el.getAttribute('data-action');
    if (!actions[name]) return;
    e.preventDefault();
    actions[name](el);
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    var model = el.getAttribute && el.getAttribute('data-model');
    if (model) {
      ui.models[model] = el.value;
      if (model === 'userCode') ui.userCode = el.value;
      return;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'codeInput') {
      e.preventDefault();
      actions.lookup();
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    var f = el.getAttribute && el.getAttribute('data-filter');
    if (f) {
      ui.orderFilter[f] = el.value;
      render();
      return;
    }
    var model = el.getAttribute && el.getAttribute('data-model');
    if (model) {
      ui.models[model] = el.value;
      if (model === 'tPoint') ui.models.tGroup = '';
      render();
    }
  });

  global.addEventListener('hashchange', function () { render(); });

  function boot() {
    Store.init();
    parseHash();
    render();
    setInterval(function () { renderClock(); }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.App = { ui: ui, render: render, actions: actions };
})(typeof window !== 'undefined' ? window : globalThis);
