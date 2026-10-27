/* js/views.rider.js —— ① 骑手投柜端 */
(function (global) {
  'use strict';

  function pointCard(p, st, selected) {
    var U = global.UI;
    return '<button type="button" class="point-card' + (selected ? ' on' : '') + '" data-action="selectPoint" data-pid="' + p.id + '">'
      + '<div class="pc-head"><span class="pid">' + p.id + '</span><span class="tag type">' + p.type + '柜</span></div>'
      + '<div class="pc-name">' + U.esc(p.name) + '</div>'
      + '<div class="pc-meta">' + p.groups + ' 组 · ' + p.slots + ' 格口</div>'
      + '<div class="bar"><i style="width:' + (st.rate * 100).toFixed(1) + '%"></i></div>'
      + '<div class="pc-foot"><span>占用 <b>' + st.occupied + '</b></span><span>剩余 <b class="ok">' + st.free + '</b></span>'
      + '<span>报修 <b class="warn">' + st.fault + '</b></span><span>' + U.pct(st.rate) + '</span></div>'
      + '<div class="pc-zone">常温可用 ' + st.normalFree + ' ｜ 保温可用 ' + st.heatFree + '</div>'
      + '</button>';
  }

  function zoneButtons(ui) {
    var S = global.Store;
    return S.ZONES.map(function (z) {
      return '<button type="button" class="chip' + (ui.zone === z ? ' on' : '') + '" data-action="selectZone" data-zone="' + z + '">'
        + z + (z === '保温' ? '区（加热）' : '区') + '</button>';
    }).join('');
  }

  function recommendPanel(ui) {
    var S = global.Store;
    var U = global.UI;
    var r = S.rankSlots(ui.pointId, ui.zone);
    if (!r.ok) {
      return '<div class="alert warn">' + U.esc(r.reason) + ' 建议切换温区，或选择其他点位。</div>';
    }
    var slotId = ui.slotId && S.slotOf(ui.slotId) && S.slotOf(ui.slotId).st === 'free' && S.slotOf(ui.slotId).zone === ui.zone
      ? ui.slotId : r.slot.id;
    var s = S.slotOf(slotId);
    var gid = slotId.slice(0, 6);
    var cab = slotId.charAt(7) === 'M' ? '主柜' : '副柜';
    var cell = slotId.slice(9);
    var alt = r.candidates.filter(function (id) { return id !== slotId; }).slice(0, 4);
    var altHtml = alt.map(function (id) {
      return '<button type="button" class="chip sm" data-action="selectSlot" data-slot="' + id + '">' + id.slice(0, 6) + ' ' + (id.charAt(7) === 'M' ? '主柜' : '副柜') + '-' + id.slice(9) + '</button>';
    }).join('');
    return ''
      + '<div class="reco">'
      + '<div class="reco-main">'
      + '<div class="reco-label">系统推荐格口（按温区 + 柜型 + 负载均衡）</div>'
      + '<div class="reco-slot">' + gid + ' · ' + cab + ' <b>' + cell + '</b> 号</div>'
      + '<div class="reco-tags">'
      + U.badge(S.pointById(ui.pointId).id + ' ' + ui.zone, ui.zone === '保温' ? 'heat' : 'normal')
      + U.badge(cab, 'grey')
      + U.badge('格口状态：可用', 'ok')
      + '</div>'
      + '<p class="reco-reason">' + U.esc(r.reason) + '</p>'
      + '</div>'
      + '<div class="reco-side">'
      + '<div class="mini-title">备选格口（可手动切换）</div>'
      + '<div class="chips">' + (altHtml || '<span class="muted">无其他备选</span>') + '</div>'
      + '<button type="button" class="btn primary block" data-action="store" data-slot="' + slotId + '"' + (ui.scanning ? ' disabled' : '') + '>'
      + (ui.scanning ? '扫码中…（模拟开柜）' : '模拟扫码开柜 · 投柜') + '</button>'
      + '<p class="muted sm">点击后模拟骑手扫柜机二维码 → 柜门弹开 → 放入餐品 → 关柜完成，系统写入订单并生成 6 位取餐码。</p>'
      + '</div>'
      + '</div>';
  }

  function lastOrderPanel(ui) {
    var S = global.Store;
    var U = global.UI;
    if (!ui.lastOrderId) return '';
    var order = null;
    var list = S.state().orders;
    for (var i = 0; i < list.length; i++) if (list[i].id === ui.lastOrderId) order = list[i];
    if (!order) return '';
    return ''
      + '<div class="card success">'
      + '<div class="card-title">投柜成功 · 取餐码已生成</div>'
      + '<div class="code-row">'
      + '<div class="code-big">' + order.code + '</div>'
      + '<div class="code-side">'
      + '<div>' + U.esc(S.pointById(order.pointId).name) + '（' + order.pointId + '）</div>'
      + '<div>' + U.slotLabel(order) + ' ｜ ' + U.esc(order.zone) + '区</div>'
      + '<div class="muted sm">投柜时间 ' + U.fmtDT(order.storedAt) + ' ｜ 订单号 ' + order.id + '</div>'
      + '</div></div>'
      + '<div class="btn-row">'
      + '<button type="button" class="btn" data-action="copy" data-text="' + order.code + '">复制取餐码</button>'
      + '<button type="button" class="btn ghost" data-action="gotoUser" data-code="' + order.code + '">去用户端用此码取餐 →</button>'
      + '</div>'
      + '</div>';
  }

  function recentPanel() {
    var S = global.Store;
    var U = global.UI;
    var list = S.ordersSorted().filter(function (o) { return !o.seeded; }).slice(0, 6);
    if (!list.length) return '<p class="muted">本次会话尚无投柜记录。</p>';
    var rows = list.map(function (o) {
      return '<tr><td class="mono">' + o.code + '</td><td>' + o.pointId + '</td><td>' + o.groupId + ' ' + (o.cab === 'M' ? '主柜' : '副柜') + '-' + U.pad2(o.cell) + '</td>'
        + '<td>' + U.esc(o.zone) + '</td><td>' + U.fmtDT(o.storedAt) + '</td>'
        + '<td>' + (o.status === 'stored' ? U.badge('在柜待取', 'in') : U.badge('已取餐', 'ok')) + '</td></tr>';
    }).join('');
    return '<table class="tbl"><thead><tr><th>取餐码</th><th>点位</th><th>柜号/格口</th><th>温区</th><th>投柜时间</th><th>状态</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function render(el, ui) {
    var S = global.Store;
    var U = global.UI;
    var stats = S.allPointStats();
    var statsMap = {};
    stats.forEach(function (s) { statsMap[s.pid] = s; });
    var cards = S.POINTS.map(function (p) { return pointCard(p, statsMap[p.id], ui.pointId === p.id); }).join('');
    var sel = ui.pointId ? S.pointById(ui.pointId) : null;

    var html = ''
      + '<section class="view">'
      + '<div class="view-head">'
      + '<h2>① 骑手投柜端</h2>'
      + '<p class="muted">流程：选择点位 → 选择温区 → 系统推荐可用格口 → 模拟扫码开柜 → 投柜成功生成 6 位取餐码（订单写入共享数据，用户端 / 运营后台立即可见）。</p>'
      + '</div>'
      + '<div class="steps">'
      + '<span class="step' + (ui.pointId ? ' done' : ' cur') + '">1 选点位</span>'
      + '<span class="step' + (ui.pointId ? ' cur' : '') + '">2 选温区</span>'
      + '<span class="step">3 推荐格口</span>'
      + '<span class="step">4 扫码开柜</span>'
      + '<span class="step">5 生成取餐码</span>'
      + '</div>'
      + '<div class="grid point-grid">' + cards + '</div>'
      + lastOrderPanel(ui)
      + (sel ? '<div class="card"><div class="card-title">投柜操作 · ' + sel.id + ' ' + U.esc(sel.name) + '</div>'
        + '<div class="row between"><div class="chips">' + zoneButtons(ui) + '</div>'
        + '<div class="muted sm">柜型 ' + sel.type + ' ｜ ' + sel.groups + ' 组 · ' + sel.slots + ' 格口 ｜ 覆盖：' + U.esc(sel.cover) + '</div></div>'
        + recommendPanel(ui) + '</div>'
        : '<div class="card"><div class="card-title">请先选择投柜点位</div><p class="muted">6 个点位对应任务书 P1–P6：P1 超大柜 12 组 / 480 格口，P2 P3 P4 大柜各 6 组 / 240 格口，P5 P6 小柜各 2 组 / 80 格口。</p></div>')
      + '<div class="card"><div class="card-title">本次投柜记录（写入 localStorage，刷新不丢失）</div>' + recentPanel() + '</div>'
      + '</section>';
    el.innerHTML = html;
  }

  global.RiderView = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
