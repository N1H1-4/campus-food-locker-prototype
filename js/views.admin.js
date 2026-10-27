/* js/views.admin.js —— ③ 运营后台 */
(function (global) {
  'use strict';

  var TABS = [
    { id: 'board', label: '点位看板' },
    { id: 'orders', label: '实时订单' },
    { id: 'overdue', label: '超时预警' },
    { id: 'tickets', label: '运维工单' },
    { id: 'kpi', label: 'KPI 报表' }
  ];

  function statusBadge(o) {
    var S = global.Store;
    var U = global.UI;
    if (o.status === 'stored') {
      var f = S.calcFee(o);
      return f.isOvertime ? U.badge('在柜 · 已超时', 'danger') : U.badge('在柜待取', 'in');
    }
    return o.overtime ? U.badge('已取餐 · 超时', 'warn') : U.badge('已取餐', 'ok');
  }

  function boardTab(ui) {
    var S = global.Store;
    var U = global.UI;
    var k = S.kpis();
    var stats = S.allPointStats();
    var rows = stats.map(function (s) {
      return '<tr>'
        + '<td><b class="mono">' + s.pid + '</b></td>'
        + '<td>' + U.esc(s.point.name) + '</td>'
        + '<td><span class="tag type">' + s.point.type + '</span></td>'
        + '<td class="num">' + s.point.groups + '</td>'
        + '<td class="num">' + s.total + '</td>'
        + '<td class="num">' + s.occupied + '</td>'
        + '<td class="num ok">' + s.free + '</td>'
        + '<td class="num warn">' + s.fault + '</td>'
        + '<td><div class="bar slim"><i style="width:' + (s.rate * 100).toFixed(1) + '%"></i></div><span class="sm">' + U.pct(s.rate) + '</span></td>'
        + '<td class="num">' + s.todayIn + '</td>'
        + '<td class="num">' + s.turns.toFixed(2) + '</td>'
        + '</tr>';
    }).join('');
    return ''
      + '<div class="stat-grid">'
      + statCard('格口总数', k.totalSlots, '任务书：6 点位 / 34 组 / 1,360 格口', '')
      + statCard('占用格口', k.occupied, '占用率 ' + U.pct(k.occupancy), 'blue')
      + statCard('空闲可用', k.free, '可分配给骑手投柜', 'green')
      + statCard('报修停用', k.fault, '故障工单处理中', 'amber')
      + statCard('今日投柜', k.todayIn, '今日 00:00 起', 'blue')
      + statCard('今日取餐', k.todayPicked, '格口已释放', 'green')
      + statCard('在柜待取', k.stored, '含超时 ' + k.overdueNow + ' 单', '')
      + statCard('占用率', U.pct(k.occupancy), '占用 ÷ 格口总数', 'amber')
      + '</div>'
      + '<div class="card"><div class="card-title">6 个点位格口看板（实时）</div>'
      + '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>编号</th><th>点位</th><th>柜型</th><th>组数</th><th>格口</th><th>占用</th><th>空闲</th><th>报修</th><th>占用率</th><th>今日投柜</th><th>周转次数</th></tr></thead><tbody>'
      + rows + '</tbody></table></div>'
      + '<p class="muted sm">周转次数口径：当日投柜笔数 ÷ 该点位格口总数（次/格口·日），任务书未定义该指标公式，此处为演示口径。</p></div>';
  }

  function statCard(label, value, sub, tone) {
    return '<div class="stat ' + (tone || '') + '"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + '</div><div class="stat-sub">' + sub + '</div></div>';
  }

  function ordersTab(ui) {
    var S = global.Store;
    var U = global.UI;
    var f = ui.orderFilter;
    var list = S.ordersSorted();
    if (f.point) list = list.filter(function (o) { return o.pointId === f.point; });
    if (f.status) list = list.filter(function (o) { return o.status === f.status; });
    var total = list.length;
    list = list.slice(0, 40);
    var pointOpts = ['<option value="">全部点位</option>'].concat(S.POINTS.map(function (p) {
      return '<option value="' + p.id + '"' + (f.point === p.id ? ' selected' : '') + '>' + p.id + ' ' + U.esc(p.name) + '</option>';
    })).join('');
    var statusOpts = ['<option value="">全部状态</option>',
      '<option value="stored"' + (f.status === 'stored' ? ' selected' : '') + '>在柜待取</option>',
      '<option value="picked"' + (f.status === 'picked' ? ' selected' : '') + '>已取餐</option>'].join('');
    var rows = list.map(function (o) {
      var f2 = S.calcFee(o);
      var isStored = o.status === 'stored';
      return '<tr>'
        + '<td class="mono"><b>' + o.code + '</b></td>'
        + '<td class="mono sm">' + o.id + '</td>'
        + '<td>' + o.pointId + '</td>'
        + '<td class="mono sm">' + o.groupId + ' ' + (o.cab === 'M' ? '主柜' : '副柜') + '-' + U.pad2(o.cell) + '</td>'
        + '<td>' + U.esc(o.zone) + '</td>'
        + '<td>' + statusBadge(o) + '</td>'
        + '<td class="sm">' + U.fmtDT(o.storedAt) + '</td>'
        + '<td>' + U.durText(isStored ? f2.minutes : o.minutes) + '</td>'
        + '<td class="num">' + (isStored ? (f2.fee > 0 ? U.money(f2.fee) : '—') : U.money(o.fee)) + '</td>'
        + '</tr>';
    }).join('');
    return ''
      + '<div class="card"><div class="card-title">实时订单列表（骑手端投柜后立即出现在此）</div>'
      + '<div class="filter-row"><select class="input" data-filter="point">' + pointOpts + '</select>'
      + '<select class="input" data-filter="status">' + statusOpts + '</select>'
      + '<span class="muted sm">共 <b>' + total + '</b> 笔，按投柜时间倒序（最多显示 40 行）</span></div>'
      + '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>取餐码</th><th>订单号</th><th>点位</th><th>柜号/格口</th><th>温区</th><th>状态</th><th>投柜时间</th><th>存放时长</th><th>超时费</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="9" class="muted">无匹配订单</td></tr>')
      + '</tbody></table></div></div>';
  }

  function overdueTab() {
    var S = global.Store;
    var U = global.UI;
    var list = S.overdueOrders();
    var rows = list.map(function (o) {
      var f = S.calcFee(o);
      return '<tr>'
        + '<td class="mono"><b>' + o.code + '</b></td>'
        + '<td>' + o.pointId + ' ' + U.esc(S.pointById(o.pointId).name) + '</td>'
        + '<td class="mono sm">' + o.groupId + ' ' + (o.cab === 'M' ? '主柜' : '副柜') + '-' + U.pad2(o.cell) + '</td>'
        + '<td class="sm">' + U.fmtDT(o.storedAt) + '</td>'
        + '<td>' + U.durText(f.minutes) + '</td>'
        + '<td class="num danger">超 ' + f.overtimeMinutes + ' 分</td>'
        + '<td class="num">' + U.money(f.fee) + '</td>'
        + '<td><button class="btn tiny" data-action="gotoUser" data-code="' + o.code + '">去用户端</button> '
        + '<button class="btn tiny ghost" data-action="remind" data-code="' + o.code + '">推送催取</button></td>'
        + '</tr>';
    }).join('');
    return ''
      + '<div class="card"><div class="card-title">超时预警（在柜且存放 > ' + S.RULES.freeMinutes + ' 分钟）</div>'
      + '<div class="alert ' + (list.length ? 'danger' : 'ok') + '">当前超时未取订单 <b>' + list.length + '</b> 笔。触发阈值 ' + S.RULES.freeMinutes + ' 分钟（免费存放时长，见计费规则假设值）。</div>'
      + '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>取餐码</th><th>点位</th><th>柜号/格口</th><th>投柜时间</th><th>已存放</th><th>超时时长</th><th>预估超时费</th><th>操作</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="8" class="muted">暂无超时订单</td></tr>')
      + '</tbody></table></div>'
      + '<p class="muted sm">提示：用页面右上角「快进 1h / 3h」推进模拟时间，即可看到在柜订单陆续进入超时预警。</p></div>';
  }

  function ticketsTab(ui) {
    var S = global.Store;
    var U = global.UI;
    var k = S.kpis();
    var m = ui.models;
    var pointId = m.tPoint || S.POINTS[0].id;
    var groups = S.groupsOf(pointId);
    var gid = m.tGroup && groups.indexOf(m.tGroup) >= 0 ? m.tGroup : groups[0];
    var pointOpts = S.POINTS.map(function (p) {
      return '<option value="' + p.id + '"' + (pointId === p.id ? ' selected' : '') + '>' + p.id + ' ' + U.esc(p.name) + '</option>';
    }).join('');
    var groupOpts = groups.map(function (g) {
      return '<option value="' + g + '"' + (gid === g ? ' selected' : '') + '>' + g + '</option>';
    }).join('');
    var typeOpts = S.TICKET_TYPES.map(function (t) {
      return '<option value="' + U.esc(t) + '"' + (m.tType === t ? ' selected' : '') + '>' + U.esc(t) + '</option>';
    }).join('');

    var list = S.ticketsSorted();
    var rows = list.map(function (t) {
      var nextLabel = t.status === 'pending' ? '受理（转处理中）' : (t.status === 'processing' ? '修复完成' : '已闭环');
      var btn = t.status === 'fixed'
        ? '<span class="muted sm">—</span>'
        : '<button class="btn tiny primary" data-action="ticketAdvance" data-id="' + t.id + '">' + nextLabel + '</button>';
      var logs = t.logs.map(function (l) { return '<div class="log"><span class="mono sm">' + U.fmtDT(l.ts) + '</span> ' + U.esc(l.text) + '</div>'; }).join('');
      return '<tr>'
        + '<td class="mono"><b>' + t.id + '</b></td>'
        + '<td>' + t.pointId + '<div class="sm muted">' + t.groupId + '</div></td>'
        + '<td>' + U.esc(t.type) + '</td>'
        + '<td class="sm">' + U.esc(t.desc) + '</td>'
        + '<td>' + U.badge(S.TICKET_STATUS[t.status], t.status === 'fixed' ? 'ok' : (t.status === 'processing' ? 'in' : 'danger')) + '</td>'
        + '<td class="num">' + t.affected + '</td>'
        + '<td class="sm">' + U.fmtDT(t.createdAt) + '</td>'
        + '<td>' + btn + '</td>'
        + '</tr><tr class="log-row"><td colspan="8"><div class="logs">' + logs + '</div></td></tr>';
    }).join('');

    return ''
      + '<div class="stat-grid small">'
      + statCard('工单总数', list.length, '全部点位', '')
      + statCard('待处理', k.ticketStat.pending, '需运维受理', 'amber')
      + statCard('处理中', k.ticketStat.processing, '现场排查', 'blue')
      + statCard('已修复', k.ticketStat.fixed, '格口已恢复', 'green')
      + '</div>'
      + '<div class="card"><div class="card-title">新建报修工单</div>'
      + '<div class="form-row">'
      + '<label>点位<select class="input" data-model="tPoint">' + pointOpts + '</select></label>'
      + '<label>柜组<select class="input" data-model="tGroup">' + groupOpts + '</select></label>'
      + '<label>故障类型<select class="input" data-model="tType">' + typeOpts + '</select></label>'
      + '<label class="grow">故障描述<input class="input" data-model="tDesc" placeholder="例如：第 3 组副柜 08 号格口门锁不回弹" value="' + U.esc(m.tDesc || '') + '"></label>'
      + '</div>'
      + '<div class="btn-row"><button class="btn primary" data-action="newTicket">提交报修工单</button>'
      + '<span class="muted sm">提交后该柜组当前空闲格口将置为「报修停用」并计入看板；修复完成自动恢复可用。</span></div>'
      + '</div>'
      + '<div class="card"><div class="card-title">工单列表与状态流转（待处理 → 处理中 → 已修复）</div>'
      + '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>工单号</th><th>点位/柜组</th><th>类型</th><th>描述</th><th>状态</th><th>影响格口</th><th>创建时间</th><th>操作</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="8" class="muted">暂无工单</td></tr>')
      + '</tbody></table></div></div>';
  }

  function kpiTab() {
    var S = global.Store;
    var U = global.UI;
    var k = S.kpis();
    var T = S.TASKBOOK;
    return ''
      + '<div class="stat-grid">'
      + statCard('日投柜量', k.todayIn + ' 单', '今日 00:00 起实时统计', 'blue')
      + statCard('超时率', U.pct(k.overtimeRate), '超时 ' + k.overtime + ' ÷ 今日投柜 ' + k.todayIn, 'amber')
      + statCard('格口周转率', k.turnRate.toFixed(3) + ' 次', '今日投柜 ' + k.todayIn + ' ÷ 格口 ' + k.totalSlots, 'green')
      + statCard('平均存放时长', Math.round(k.avgMinutes) + ' 分', '今日已取餐订单均值', '')
      + '</div>'
      + '<div class="card"><div class="card-title">指标计算过程（按当前模拟数据实时计算）</div>'
      + '<div class="kv wide">'
      + '<div><span>日投柜量</span><b>' + k.todayIn + ' 单</b><em>今日所有投柜订单笔数</em></div>'
      + '<div><span>超时率</span><b>' + U.pct(k.overtimeRate) + '</b><em>' + k.overtime + ' ÷ ' + k.todayIn + '（超时单 ÷ 今日投柜单）</em></div>'
      + '<div><span>格口周转率</span><b>' + k.turnRate.toFixed(3) + ' 次/格口·日</b><em>' + k.todayIn + ' ÷ ' + k.totalSlots + '</em></div>'
      + '<div><span>当前占用率</span><b>' + U.pct(k.occupancy) + '</b><em>' + k.occupied + ' ÷ ' + k.totalSlots + '</em></div>'
      + '<div><span>在柜待取</span><b>' + k.stored + ' 单</b><em>其中超时 ' + k.overdueNow + ' 单</em></div>'
      + '<div><span>订单总量</span><b>' + k.orderCount + ' 笔</b><em>种子演示 + 本次操作</em></div>'
      + '</div>'
      + '<p class="muted sm">注：本地原型只有几十笔模拟订单，绝对量远小于任务书的规划口径（2,310 单/日）。下表为任务书口径，仅供对照，不得混用。</p></div>'
      + '<div class="card"><div class="card-title">任务书口径对照（只读，来源：' + T.source + ' 第七节）</div>'
      + '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>参数</th><th>任务书取值</th><th>说明</th></tr></thead><tbody>'
      + '<tr><td>在校师生</td><td class="num">' + T.population.toLocaleString('en-US') + ' 人</td><td>校方公开数据</td></tr>'
      + '<tr><td>日均外卖单量</td><td class="num">' + T.dayOrder.toLocaleString('en-US') + ' 单</td><td>15,000 × 28%</td></tr>'
      + '<tr><td>柜机使用率</td><td class="num">' + T.useRate + '%</td><td>待试运行校准</td></tr>'
      + '<tr><td>柜机日投柜量</td><td class="num">' + T.dayCabinet.toLocaleString('en-US') + ' 单</td><td>4,200 × 55%</td></tr>'
      + '<tr><td>格口周转率（规划口径）</td><td class="num">' + k.bookTurn.toFixed(2) + ' 次/格口·日</td><td>2,310 ÷ 1,360</td></tr>'
      + '<tr><td>骑手侧收费</td><td class="num">' + T.riderUnitFee.toFixed(2) + ' 元/单</td><td>同类产品市场价</td></tr>'
      + '<tr><td>年收入合计</td><td class="num">' + T.yearRevenue.toLocaleString('en-US') + ' 元</td><td>投柜 554,400 + 广告 144,000</td></tr>'
      + '<tr><td>年运营成本</td><td class="num">' + T.yearCost.toLocaleString('en-US') + ' 元</td><td>运维/电费/维保/平台续费/其他</td></tr>'
      + '<tr><td>年净现金流</td><td class="num">' + T.yearCash.toLocaleString('en-US') + ' 元</td><td>—</td></tr>'
      + '<tr><td>静态投资回收期</td><td class="num">' + T.payback + ' 年</td><td>1,439,340 ÷ 398,400</td></tr>'
      + '</tbody></table></div></div>'
      + '<div class="card"><div class="card-title">项目关键参数（只读，来源：任务书 v1）</div>'
      + '<div class="kv wide">'
      + '<div><span>概算总投资</span><b>' + T.budget.toLocaleString('en-US') + ' 元</b><em>' + T.budgetWan + '</em></div>'
      + '<div><span>直接人工</span><b>' + T.laborHour.toLocaleString('en-US') + ' 工时 / ' + T.laborCost.toLocaleString('en-US') + ' 元</b><em>峰值 ' + T.peakStaff + ' 人</em></div>'
      + '<div><span>计划工期</span><b>' + T.duration + ' 个工作日</b><em>' + T.planStart + ' 至 ' + T.planEnd + '</em></div>'
      + '<div><span>建议承诺工期</span><b>' + T.commitDuration + ' 个工作日</b><em>' + T.planStart + ' 至 ' + T.commitEnd + '，P=' + T.p122 + '</em></div>'
      + '<div><span>PERT 期望工期</span><b>' + T.pertTE.toFixed(2) + ' 工作日</b><em>σ²=' + T.pertVar + '，σ=' + T.pertSigma + '</em></div>'
      + '<div><span>按 114 天承诺</span><b>P=' + T.p114 + '</b><em>Z=' + T.z114 + '（风险结论）</em></div>'
      + '<div><span>关键路径</span><b class="sm">' + T.criticalPath + '</b><em>T 总时差 = 1，不在关键路径</em></div>'
      + '</div></div>';
  }

  function render(el, ui) {
    var U = global.UI;
    var tab = ui.adminTab || 'board';
    var tabs = TABS.map(function (t) {
      return '<button type="button" class="tab' + (tab === t.id ? ' on' : '') + '" data-action="adminTab" data-tab="' + t.id + '">' + t.label + '</button>';
    }).join('');
    var body = '';
    if (tab === 'board') body = boardTab(ui);
    else if (tab === 'orders') body = ordersTab(ui);
    else if (tab === 'overdue') body = overdueTab(ui);
    else if (tab === 'tickets') body = ticketsTab(ui);
    else body = kpiTab(ui);
    el.innerHTML = ''
      + '<section class="view">'
      + '<div class="view-head"><h2>③ 运营后台</h2>'
      + '<p class="muted">汇总骑手端与用户端在同一份数据上产生的全部记录：点位看板、实时订单、超时预警、运维工单、KPI 报表。</p></div>'
      + '<div class="tabs">' + tabs + '</div>'
      + body
      + '</section>';
  }

  global.AdminView = { render: render, TABS: TABS };
})(typeof window !== 'undefined' ? window : globalThis);
