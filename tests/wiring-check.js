/* tests/wiring-check.js —— 静态接线自检（node 运行，不参与页面加载）
 * 用法：node tests/wiring-check.js
 * 无浏览器环境下替代「点击验证」的静态契约校验：
 *   1) 三个视图渲染出的每个 data-action 都能在 app.js 的事件表里找到处理器（不会出现「点了没反应」）；
 *   2) 每个 data-model 字段都被 app.js 处理；
 *   3) app.js / 视图引用的 DOM id 都能在 index.html 或渲染结果中找到；
 *   4) index.html 引用的 css/js 文件真实存在、无任何外部 URL（保证双击离线可用）；
 *   5) 直接调用 app.js 的 action 处理器，验证工单表单默认值兜底、重置数据等 UI 层逻辑。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { fails.push(name + (extra ? ' → ' + extra : '')); console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); }
}

function makeStorage() {
  const map = new Map();
  return { map, api: { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) } };
}
function fakeEl() {
  return { style: {}, appendChild() {}, select() {}, setAttribute() {}, removeChild() {}, classList: { add() {} } };
}
function makeContext(storage, withApp) {
  const sandbox = {
    console,
    localStorage: storage.api,
    location: { hash: '' },
    addEventListener: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    navigator: {},
    document: {
      readyState: 'complete',
      getElementById: () => null,
      createElement: fakeEl,
      querySelectorAll: () => [],
      addEventListener: () => {},
      body: { appendChild() {}, removeChild() {} }
    }
  };
  vm.createContext(sandbox);
  sandbox.window = sandbox;
  return sandbox;
}
function load(sandbox, files) {
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}

const BASE = ['data/store.js', 'js/ui.js', 'js/views.rider.js', 'js/views.user.js', 'js/views.admin.js'];

console.log('== 1. 视图渲染产物中的 data-action 是否都有处理器 ==');
const storage1 = makeStorage();
const ctx = makeContext(storage1, false);
load(ctx, BASE);
const S = ctx.window.Store;
S.init();

const el = { innerHTML: '' };
const htmlParts = [];
function grab() { htmlParts.push(el.innerHTML); }

const overdue = S.ordersSorted().filter((o) => o.status === 'stored')[0];
const pickedOne = S.ordersSorted().filter((o) => o.status === 'picked')[0];

ctx.window.RiderView.render(el, { pointId: 'P1', zone: '常温', slotId: null, scanning: false, lastOrderId: null }); grab();
ctx.window.RiderView.render(el, { pointId: 'P3', zone: '保温', slotId: null, scanning: true, lastOrderId: null }); grab();
ctx.window.RiderView.render(el, { pointId: 'P3', zone: '保温', slotId: null, scanning: false, lastOrderId: pickedOne.id }); grab();
ctx.window.UserView.render(el, { userCode: '', lookup: null }); grab();
ctx.window.UserView.render(el, { userCode: overdue.code, lookup: S.findByCode(overdue.code) }); grab();
ctx.window.UserView.render(el, { userCode: pickedOne.code, lookup: S.findByCode(pickedOne.code) }); grab();
ctx.window.UserView.render(el, { userCode: '000000', lookup: { status: 'notfound' } }); grab();
ctx.window.UserView.render(el, { userCode: '12', lookup: { status: 'empty' } }); grab();
for (const tab of ['board', 'orders', 'overdue', 'tickets', 'kpi']) {
  ctx.window.AdminView.render(el, { adminTab: tab, models: {}, orderFilter: { point: '', status: '' } }); grab();
  ctx.window.AdminView.render(el, { adminTab: tab, models: { tPoint: 'P4', tGroup: 'P4-G03', tType: '柜门卡阻', tDesc: 'x' }, orderFilter: { point: 'P1', status: 'stored' } }); grab();
}
const allHtml = htmlParts.join('');
const usedActions = Array.from(new Set((allHtml.match(/data-action="[a-zA-Z]+"/g) || []).map((m) => m.slice(13, -1))));
const usedModels = Array.from(new Set((allHtml.match(/data-model="[a-zA-Z]+"/g) || []).map((m) => m.slice(12, -1))));
console.log('  渲染样本中出现的 data-action：' + usedActions.join(', '));
console.log('  渲染样本中出现的 data-model：' + usedModels.join(', '));

const storage2 = makeStorage();
const ctx2 = makeContext(storage2, true);
load(ctx2, BASE.concat(['js/app.js']));
const App = ctx2.window.App;
const handlerNames = Object.keys(App.actions);
console.log('  app.js 已注册的处理器：' + handlerNames.join(', '));
const missing = usedActions.filter((a) => handlerNames.indexOf(a) < 0);
ok(missing.length === 0, '所有 data-action 均有处理器（不会「点了没反应」）', missing.length ? '缺少 ' + missing.join(',') : usedActions.length + ' 个动作全覆盖');
ok(usedActions.length >= 10, '渲染样本覆盖 ≥10 个交互动作', '实际 ' + usedActions.length);

console.log('== 2. data-model 字段是否都被 app.js 读取 ==');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const unhandled = usedModels.filter((m) => appSrc.indexOf('models.' + m) < 0 && appSrc.indexOf("'" + m + "'") < 0);
ok(unhandled.length === 0, '所有 data-model 字段都有读取逻辑', unhandled.join(',') || usedModels.join(','));

console.log('== 3. DOM id 引用是否都能命中 ==');
const indexPath = path.join(ROOT, 'index.html');
const indexSrc = fs.readFileSync(indexPath, 'utf8');
const viewIds = ["view", "toast", "clock", "clockOffset", "storageWarn"];
const viewIdMissing = viewIds.filter((id) => indexSrc.indexOf('id="' + id + '"') < 0);
ok(viewIdMissing.length === 0, 'index.html 中的挂载点 id 齐全', viewIdMissing.join(',') || viewIds.join(','));
ok(allHtml.indexOf('id="codeInput"') >= 0, '用户端渲染出 #codeInput（查询框）');
const svg = ctx2.window.UI;
ok(typeof svg.esc === 'function' && typeof svg.toast === 'function', 'UI 工具函数可用');

console.log('== 4. index.html 资源与离线可用性 ==');
const refs = [];
indexSrc.replace(/(?:src|href)="([^"]+)"/g, (m, p1) => { refs.push(p1); return m; });
const localRefs = refs.filter((r) => r.indexOf('#') !== 0 && r.indexOf('http') !== 0);
const missingFiles = localRefs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
ok(missingFiles.length === 0, 'index.html 引用的本地文件都存在', localRefs.join(', '));
ok(refs.every((r) => r.indexOf('http://') !== 0 && r.indexOf('https://') !== 0 && r.indexOf('//cdn') < 0), '无任何外部 CDN / 网络依赖（双击离线可用）');
const scriptRe = /<script src="([^"]+)"><\/script>/g;
const scripts = [];
let mm;
while ((mm = scriptRe.exec(indexSrc))) scripts.push(mm[1]);
ok(scripts.length === 6, 'index.html 引入 6 个脚本（store/ui/3 视图/app）', scripts.join(' '));
ok(scripts[0].indexOf('data/store.js') === 0, 'store.js 最先加载（数据层先于视图）');
ok(scripts[scripts.length - 1].indexOf('js/app.js') === 0, 'app.js 最后加载（创建视图后再启动路由）');
const navRoutes = (indexSrc.match(/data-route="[a-z]+"/g) || []).map((s) => s.slice(12, -1));
ok(navRoutes.join(',') === 'rider,user,admin', '顶部导航含三端入口', navRoutes.join(','));

console.log('== 5. 直接调用 UI 层动作（等价于点击） ==');
const S2 = ctx2.window.Store;
const tkBefore = S2.state().tickets.length;
App.ui.models = {};
App.actions.newTicket();
const tk = S2.ticketsSorted()[0];
ok(S2.state().tickets.length === tkBefore + 1, '工单表单未选点位/柜组时按默认值兜底创建成功', tk.id + ' → ' + tk.groupId);
ok(tk.status === 'pending', '新工单初始状态 = 待处理');
App.actions.ticketAdvance({ getAttribute: () => tk.id });
ok(S2.ticketsSorted()[0].status === 'processing', '点击「受理」→ 处理中');
App.actions.ticketAdvance({ getAttribute: () => tk.id });
ok(S2.ticketsSorted()[0].status === 'fixed', '点击「修复完成」→ 已修复');
App.actions.ff({ getAttribute: () => '60' });
ok(S2.clockOffset() === 3600000, '「快进 1h」按钮改变模拟时钟');
App.actions.resetClock({});
ok(S2.clockOffset() === 0, '「回真实时间」按钮清零时钟');
App.actions.selectPoint({ getAttribute: () => 'P5' });
ok(App.ui.pointId === 'P5', '点击 P5 点位卡片后 UI 状态切换');
ok(/^P5-G[0-9]{2}-[MS][0-9]{2}$/.test(App.ui.slotId || ''), '选中点位后立即给出推荐格口', App.ui.slotId);
App.actions.selectZone({ getAttribute: () => '保温' });
ok(App.ui.zone === '保温', '切换温区按钮生效');
ok(S2.slotOf(App.ui.slotId) && S2.slotOf(App.ui.slotId).zone === '保温', '推荐格口温区与所选一致', App.ui.slotId);
const h = ctx2.window.location;
App.actions.gotoUser({ getAttribute: () => overdue.code });
ok(App.ui.userCode === overdue.code, '「去用户端」按钮带入取餐码');
ok(App.ui.lookup && App.ui.lookup.status === 'stored', '跳转后自动完成查询');
App.actions.resetData();
ok(S2.state().orders.length === 78, '「重置演示数据」恢复种子数据（78 笔）');
ok(S2.state().tickets.length === 3, '重置后工单恢复 3 张');

console.log('');
console.log('接线自检：通过 ' + pass + ' 项，失败 ' + fails.length + ' 项');
if (fails.length) { fails.forEach((f) => console.log(' - ' + f)); process.exit(1); }
console.log('WIRING OK');
