/* js/views.user.js —— ② 用户取餐端 */
(function (global) {
  'use strict';

  function codeChips() {
    var S = global.Store;
    var U = global.UI;
    var list = S.ordersSorted().filter(function (o) { return o.status === 'stored'; }).slice(0, 6);
    if (!list.length) return '<span class="muted sm">当前无在柜订单</span>';
    return list.map(function (o) {
      return '<button type="button" class="chip sm" data-action="fillCode" data-code="' + o.code + '">' + o.code + ' · ' + o.pointId + '</button>';
    }).join('');
  }

  function resultPanel(ui) {
    var S = global.Store;
    var U = global.UI;
    var res = ui.lookup;
    if (!res) return '';
    if (res.status === 'empty') return '<div class="alert warn">请输入 6 位取餐码。</div>';
    if (res.status === 'notfound') return '<div class="alert danger">未找到取餐码 <b class="mono">' + U.esc(ui.userCode) + '</b> 的订单，请核对后重试。</div>';

    var o = res.order;
    var p = S.pointById(o.pointId);
    var f = S.calcFee(o);
    var isStored = o.status === 'stored';
    var fee = isStored ? f.fee : Number(o.fee || 0);
    var overtime = isStored ? f.isOvertime : (o.minutes > S.RULES.freeMinutes);
    var alert = '';
    if (isStored && f.isOvertime) {
      alert = '<div class="alert danger"><b>⏰ 超时提醒</b>：餐品已存放 ' + U.durText(f.minutes) + '，超过免费时长 ' + S.RULES.freeMinutes + ' 分钟，'
        + '当前超时费 <b>' + U.money(fee) + '</b>，请尽快取餐。</div>';
    } else if (isStored) {
      var left = S.RULES.freeMinutes - f.minutes;
      alert = '<div class="alert ok">免费存放剩余 <b>' + left + ' 分钟</b>（免费时长 ' + S.RULES.freeMinutes + ' 分钟），当前无超时费。</div>';
    } else {
      alert = '<div class="alert ok">该订单已于 ' + U.fmtDT(o.pickedAt) + ' 取餐完成，格口 ' + o.slotId + ' 已释放回可用池。</div>';
    }

    var html = ''
      + '<div class="card ' + (isStored ? 'info' : 'success') + '">'
      + '<div class="card-title">取餐码 <span class="mono code-inline">' + o.code + '</span> ｜ ' + (isStored ? U.badge('在柜待取', 'in') : U.badge('已取餐', 'ok')) + '</div>'
      + alert
      + '<div class="kv">'
      + '<div><span>点位</span><b>' + o.pointId + ' ' + U.esc(p.name) + '</b></div>'
      + '<div><span>柜号</span><b>' + o.groupId + '（' + (o.cab === 'M' ? '主柜' : '副柜') + '）</b></div>'
      + '<div><span>格口号</span><b class="mono">' + U.pad2(o.cell) + ' 号</b></div>'
      + '<div><span>温区</span><b>' + U.esc(o.zone) + '区' + (o.zone === '保温' ? '（加热保温）' : '') + '</b></div>'
      + '<div><span>存放时间</span><b>' + U.fmtDT(o.storedAt) + '</b></div>'
      + '<div><span>已存放</span><b>' + U.durText(isStored ? f.minutes : o.minutes) + '</b></div>'
      + '</div>'
      + '<div class="fee-box">'
      + '<div class="mini-title">超时费计算（免费 ' + S.RULES.freeMinutes + ' 分钟 · 每满 ' + S.RULES.stepMinutes + ' 分钟 ' + S.RULES.feePerStep.toFixed(2) + ' 元 · 封顶 ' + S.RULES.capFee.toFixed(2) + ' 元）</div>'
      + '<div class="formula">' + U.esc(f.formula) + '</div>'
      + '<div class="fee-total">' + (overtime ? '应缴超时费：<b class="money">' + U.money(fee) + '</b>' : '应缴超时费：<b class="money">' + U.money(0) + '</b>') + '</div>'
      + '</div>'
      + '<div class="btn-row">'
      + (isStored
        ? '<button type="button" class="btn primary" data-action="pickup" data-code="' + o.code + '">开柜取餐' + (fee > 0 ? '（支付超时费 ' + U.money(fee) + '）' : '（免费）') + '</button>'
        : '<button type="button" class="btn ghost" disabled>已取餐，格口已释放</button>')
      + '<button type="button" class="btn" data-action="copy" data-text="' + o.code + '">复制取餐码</button>'
      + '<button type="button" class="btn ghost" data-action="lookup">重新查询</button>'
      + '</div>'
      + '</div>';
    return html;
  }

  function historyPanel() {
    var S = global.Store;
    var U = global.UI;
    var list = S.ordersSorted().filter(function (o) { return o.status === 'picked'; }).slice(0, 6);
    if (!list.length) return '<p class="muted">暂无取餐记录。</p>';
    var rows = list.map(function (o) {
      return '<tr><td class="mono">' + o.code + '</td><td>' + o.pointId + '</td><td>' + o.groupId + ' ' + (o.cab === 'M' ? '主柜' : '副柜') + '-' + U.pad2(o.cell) + '</td>'
        + '<td>' + U.durText(o.minutes) + '</td><td>' + (o.minutes > S.RULES.freeMinutes ? U.badge('超时 ' + U.money(o.fee), 'warn') : U.badge('按时取餐', 'ok')) + '</td>'
        + '<td>' + U.fmtDT(o.pickedAt) + '</td></tr>';
    }).join('');
    return '<table class="tbl"><thead><tr><th>取餐码</th><th>点位</th><th>柜号/格口</th><th>存放时长</th><th>超时费</th><th>取餐时间</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function render(el, ui) {
    var S = global.Store;
    var U = global.UI;
    var html = ''
      + '<section class="view">'
      + '<div class="view-head">'
      + '<h2>② 用户取餐端</h2>'
      + '<p class="muted">流程：输入骑手端生成的 6 位取餐码 → 查看点位 / 柜号 / 格口号 / 存放时间 / 温区 → 开柜取餐（订单转「已取餐」，格口释放回可用池）→ 超时自动计算超时费。</p>'
      + '</div>'
      + '<div class="card">'
      + '<div class="card-title">输入取餐码</div>'
      + '<div class="lookup-row">'
      + '<input id="codeInput" class="input code-input" data-model="userCode" inputmode="numeric" maxlength="6" placeholder="6 位数字取餐码" value="' + U.esc(ui.userCode || '') + '">'
      + '<button type="button" class="btn primary" data-action="lookup">查询订单</button>'
      + '<button type="button" class="btn ghost" data-action="clearCode">清空</button>'
      + '</div>'
      + '<div class="hint-row"><span class="muted sm">在柜订单快捷填入：</span><div class="chips">' + codeChips() + '</div></div>'
      + '</div>'
      + resultPanel(ui)
      + '<div class="card"><div class="card-title">取餐记录（与运营后台同一份数据）</div>' + historyPanel() + '</div>'
      + '<div class="card note"><div class="card-title">计费规则说明（假设值）</div><p class="muted sm">' + U.esc(S.RULES.assume[0]) + '</p></div>'
      + '</section>';
    el.innerHTML = html;
  }

  global.UserView = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
