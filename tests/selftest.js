/* tests/selftest.js —— 原型逻辑自检（node 运行，不参与页面加载）
 * 用法：node tests/selftest.js
 * 覆盖：点位/格口与任务书一致性、种子数据、骑手投柜→后台可见→用户取餐→格口释放全链路、
 *       超时费公式、超时预警、工单状态流转、模拟时钟、localStorage 持久化、三个视图静态渲染冒烟。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0;
const fails = [];

function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fails.push(name + (extra ? ' → ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' → ' + extra : '')); }
}
function eq(actual, expect, name) {
  ok(actual === expect, name, 'expect ' + JSON.stringify(expect) + ', got ' + JSON.stringify(actual));
}

function makeStorage() {
  const map = new Map();
  return {
    map,
    api: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      removeItem: (k) => { map.delete(k); }
    }
  };
}

function makeContext(storage) {
  const sandbox = { console, localStorage: storage.api };
  vm.createContext(sandbox);
  sandbox.window = sandbox;
  sandbox.document = {
    readyState: 'complete',
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild() {}, select() {}, setAttribute() {}, removeChild() {}, classList: { add() {} } }),
    body: { appendChild() {}, removeChild() {} },
    addEventListener: () => {},
    querySelectorAll: () => []
  };
  return sandbox;
}

function loadScripts(sandbox, files) {
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(src, sandbox, { filename: f });
  }
}

const storage = makeStorage();
const ctx = makeContext(storage);
loadScripts(ctx, ['data/store.js', 'js/ui.js', 'js/views.rider.js', 'js/views.user.js', 'js/views.admin.js']);
const S = ctx.window.Store;
const UI = ctx.window.UI;

console.log('== 1. 点位与格口池（对照任务书第二节） ==');
const st = S.init();
eq(st.slots.length, 1360, '格口池总数 = 1,360');
eq(S.POINTS.length, 6, '点位数 = 6');
const expectGroups = { P1: 12, P2: 6, P3: 6, P4: 6, P5: 2, P6: 2 };
const expectSlots = { P1: 480, P2: 240, P3: 240, P4: 240, P5: 80, P6: 80 };
const expectType = { P1: '超大', P2: '大', P3: '大', P4: '大', P5: '小', P6: '小' };
let groupSum = 0;
for (const p of S.POINTS) {
  eq(p.groups, expectGroups[p.id], p.id + ' 组数');
  eq(p.slots, expectSlots[p.id], p.id + ' 格口数');
  eq(p.type, expectType[p.id], p.id + ' 柜型');
  eq(S.slotsOfPoint(p.id).length, p.slots, p.id + ' 实际生成格口数');
  groupSum += p.groups;
}
eq(groupSum, 34, '组数合计 = 34');
let heat = 0;
for (const s of st.slots) if (s.zone === '保温') heat++;
eq(heat, 340, '保温格口 = 340（与概算第 4 项 340 格口一致）');
eq(st.slots.filter((s) => /^P[1-6]-G[0-9]{2}-[MS][0-9]{2}$/.test(s.id)).length, 1360, '格口编号格式 P#-G##-M/S## 全部合规');

console.log('== 2. 种子数据（模拟） ==');
eq(st.orders.length, 78, '种子订单 78 笔');
eq(st.tickets.length, 3, '种子工单 3 张');
const storedSeed = st.orders.filter((o) => o.status === 'stored');
const occSlots = st.slots.filter((s) => s.st === 'occupied');
eq(occSlots.length, storedSeed.length, '占用格口数 = 在柜订单数（数据自洽）');
ok(storedSeed.every((o) => S.slotOf(o.slotId).st === 'occupied'), '每笔在柜订单都对应一个占用格口');
ok(storedSeed.every((o) => S.slotOf(o.slotId).zone === o.zone), '订单温区与格口温区一致');
ok(st.orders.every((o) => /^[0-9]{6}$/.test(o.code)), '所有取餐码为 6 位数字');
ok(S.overdueOrders().length >= 1, '种子数据含超时未取订单', '实际 ' + S.overdueOrders().length);

console.log('== 3. 骑手投柜 → 后台可见 → 用户取餐 → 格口释放（全链路） ==');
const rec = S.rankSlots('P1', '常温');
ok(rec.ok, 'P1 常温推荐成功');
eq(rec.slot.zone, '常温', '推荐格口温区 = 常温');
ok(rec.reason.indexOf('占用率最低') > 0, '推荐理由含负载均衡说明');
const before = S.pointStats('P1');
const kBefore = S.kpis();
const created = S.createOrder('P1', '常温', rec.slot.id, '骑手（自检）');
ok(created.ok, '创建投柜订单成功');
eq(created.order.slotId, rec.slot.id, '订单落位到推荐格口');
eq(S.slotOf(rec.slot.id).st, 'occupied', '格口状态 → 占用');
const after = S.pointStats('P1');
eq(after.occupied, before.occupied + 1, '点位占用 +1');
eq(after.free, before.free - 1, '点位剩余 -1');
eq(after.todayIn, before.todayIn + 1, '点位今日投柜 +1');
const kAfter = S.kpis();
eq(kAfter.todayIn, kBefore.todayIn + 1, 'KPI 日投柜量 +1');
eq(S.ordersSorted()[0].id, created.order.id, '运营后台订单列表首行 = 刚投的订单（后台可见）');
const found = S.findByCode(created.order.code);
eq(found.status, 'stored', '用户端按取餐码查到在柜订单');
eq(S.storedMinutes(created.order), 0, '刚投柜存放 0 分钟');
const fee0 = S.calcFee(created.order);
eq(fee0.fee, 0, '未超时超时费 = 0');
const pick = S.pickup(created.order.code);
ok(pick.ok, '开柜取餐成功');
eq(pick.order.status, 'picked', '订单状态 → 已取餐');
eq(S.slotOf(rec.slot.id).st, 'free', '格口释放回可用池');
const afterPick = S.pointStats('P1');
eq(afterPick.free, before.free, '点位剩余格口恢复');
eq(S.findByCode(created.order.code).status, 'picked', '再次查询显示已取餐');
ok(!S.pickup(created.order.code).ok, '重复取餐被拒绝');

console.log('== 4. 超时费公式（免费 120 分钟，每满 60 分钟 1 元，封顶 5 元） ==');
function backdate(mins) {
  const r = S.rankSlots('P2', '常温');
  const c = S.createOrder('P2', '常温', r.slot.id, '骑手（自检）');
  c.order.storedAt = S.now() - mins * 60000;
  return c.order;
}
const f119 = S.calcFee(backdate(119));
eq(f119.fee, 0, '存放 119 分钟 → 0 元');
const f155 = S.calcFee(backdate(155));
eq(f155.overtimeMinutes, 35, '存放 155 分钟 → 超时 35 分钟');
eq(f155.billHours, 1, '⌈35/60⌉ = 1 小时');
eq(f155.fee, 1, '超时费 1.00 元');
ok(f155.formula.indexOf('超时费') > 0 && f155.formula.indexOf('155') > 0, '公式含实际数值', f155.formula);
eq(S.calcFee(backdate(250)).fee, 3, '存放 250 分钟 → 超时 130 分钟 → 3 小时 → 3.00 元');
eq(S.calcFee(backdate(500)).fee, 5, '存放 500 分钟 → 超 380 分钟 → 7 元封顶 5.00 元');
const od = S.overdueOrders();
ok(od.length >= 3, '超时预警列表非空', '实际 ' + od.length);
ok(od.every((o) => o.status === 'stored'), '超时预警只含在柜订单');
ok(od.every((o) => S.calcFee(o).minutes > 120), '超时预警订单均超过 120 分钟');

console.log('== 5. 运维工单（待处理 → 处理中 → 已修复） ==');
const gFreeBefore = S.slotsOfGroup('P2-G02').filter((s) => s.st === 'free').length;
const tk = S.createTicket('P2', 'P2-G02', '柜门卡阻', '自检：2 号格口门锁异常');
ok(tk.ok, '创建工单成功');
eq(tk.ticket.status, 'pending', '工单初始状态 = 待处理');
const gFreeAfter = S.slotsOfGroup('P2-G02').filter((s) => s.st === 'free').length;
eq(gFreeAfter, gFreeBefore - tk.ticket.affected, '报修后该组空闲格口减少 ' + tk.ticket.affected + ' 个');
ok(S.slotsOfGroup('P2-G02').some((s) => s.st === 'fault'), '格口状态出现「报修停用」');
const a1 = S.advanceTicket(tk.ticket.id);
eq(a1.ticket.status, 'processing', '受理后 → 处理中');
const a2 = S.advanceTicket(tk.ticket.id);
eq(a2.ticket.status, 'fixed', '修复后 → 已修复');
eq(S.slotsOfGroup('P2-G02').filter((s) => s.st === 'fault').length, 0, '修复后无报修格口');
eq(S.slotsOfGroup('P2-G02').filter((s) => s.st === 'free').length, gFreeBefore - (gFreeBefore - gFreeAfter) + tk.ticket.affected, '格口恢复可用');
ok(!S.advanceTicket(tk.ticket.id).ok, '已修复工单不能再次流转');
ok(!S.createTicket('P1', 'P9-G01', '其他', '').ok, '不存在的柜组被拒绝');

console.log('== 6. 模拟时钟（用于演示超时） ==');
const t0 = S.now();
S.advanceClock(60);
const delta = S.now() - t0 - 3600000;
ok(delta >= 0 && delta < 5000, '快进 60 分钟生效', '偏差 ' + delta + 'ms（仅真实时钟流逝）');
const far = backdate(60);
eq(S.calcFee(far).minutes, 60, '快进后新订单存放时长仍按模拟时间计算');
S.resetClock();
eq(S.clockOffset(), 0, '回到真实时间');

console.log('== 7. localStorage 持久化 ==');
const keptKey = 'WL_CABINET_PROTO_V1';
ok(storage.map.has(keptKey), '已写入 localStorage 键 ' + keptKey);
const ordersNow = S.state().orders.length;
const ticketsNow = S.state().tickets.length;
const ctx2 = makeContext(storage);
loadScripts(ctx2, ['data/store.js']);
const st2 = ctx2.window.Store.init();
eq(st2.orders.length, ordersNow, '重新加载后订单数不变（刷新不丢数据）');
eq(st2.tickets.length, ticketsNow, '重新加载后工单数不变');
eq(st2.v, 3, 'SCHEMA 版本号一致');
const ctx3 = makeContext(makeStorage());
loadScripts(ctx3, ['data/store.js']);
const st3 = ctx3.window.Store.init();
eq(st3.orders.length, 78, '空存储（首次打开）自动灌入种子数据');

console.log('== 8. 三视图静态渲染冒烟 ==');
const el = { innerHTML: '' };
const riderUi = { pointId: 'P1', zone: '常温', slotId: null, scanning: false, lastOrderId: null };
ctx.window.RiderView.render(el, riderUi);
ok(el.innerHTML.indexOf('骑手投柜端') > 0, '骑手端渲染出标题');
ok(el.innerHTML.indexOf('推荐格口') > 0, '骑手端渲染出推荐格口');
ok(el.innerHTML.indexOf('模拟扫码开柜') > 0, '骑手端渲染出扫码按钮');
ok(el.innerHTML.indexOf('P6') > 0, '骑手端渲染出 6 个点位（含 P6）');
const overdueSeed = S.overdueOrders()[0];
ctx.window.UserView.render(el, { userCode: overdueSeed.code, lookup: S.findByCode(overdueSeed.code) });
ok(el.innerHTML.indexOf('超时提醒') > 0, '用户端渲染出超时提醒');
ok(el.innerHTML.indexOf('超时费 = ') > 0, '用户端渲染出超时费公式');
ok(el.innerHTML.indexOf('开柜取餐') > 0, '用户端渲染出开柜取餐按钮');
ok(el.innerHTML.indexOf('格口号') > 0, '用户端渲染出格口号');
for (const tab of ['board', 'orders', 'overdue', 'tickets', 'kpi']) {
  ctx.window.AdminView.render(el, { adminTab: tab, models: {}, orderFilter: { point: '', status: '' } });
  const key = { board: '6 个点位格口看板', orders: '实时订单列表', overdue: '超时预警', tickets: '新建报修工单', kpi: '格口周转率' }[tab];
  ok(el.innerHTML.indexOf(key) > 0, '运营后台 [' + tab + '] 渲染出「' + key + '」');
  ok(el.innerHTML.indexOf(undefined) < 0 && el.innerHTML.indexOf('NaN') < 0, '运营后台 [' + tab + '] 无 undefined / NaN');
}
ctx.window.AdminView.render(el, { adminTab: 'kpi', models: {}, orderFilter: { point: '', status: '' } });
ok(el.innerHTML.indexOf('1,439,340') > 0, 'KPI 页展示概算总投资 1,439,340 元');
ok(el.innerHTML.indexOf('120.00') > 0, 'KPI 页展示 PERT 期望工期 120.00');
ok(el.innerHTML.indexOf('A→B→C→E→H→I→K→N→O→Q→S→U') > 0, 'KPI 页展示关键路径');

console.log('== 9. 任务书口径一致性 ==');
const T = S.TASKBOOK;
eq(T.slotCount, 1360, '任务书格口总数常量');
eq(T.groupCount, 34, '任务书组数常量');
eq(T.budget, 1439340, '概算总投资 1,439,340');
eq(T.laborCost, 200552, '直接人工 200,552');
eq(T.dayOrder, 4200, '日均外卖 4,200');
eq(T.dayOrder * T.useRate / 100, T.dayCabinet, '4,200 × 55% = 2,310');
eq(T.dayCabinet * T.riderUnitFee * T.opDays + 144000, T.yearRevenue, '年收入 698,400（投柜 554,400 + 广告 144,000）');
eq(T.yearRevenue - T.yearCost, T.yearCash, '年净现金流 398,400');
eq(Math.round(T.budget / T.yearCash * 100) / 100, T.payback, '回收期 3.61 年');
eq(T.pertTE.toFixed(2), '120.00', 'PERT 期望工期 120.00');
eq(String(T.pertVar), '17.2778', 'PERT 方差 17.2778');
eq(String(T.pertSigma), '4.157', 'PERT 标准差 4.157');

console.log('');
console.log('通过 ' + pass + ' 项，失败 ' + fails.length + ' 项');
if (fails.length) {
  console.log('失败明细：');
  fails.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('SELFTEST OK');
