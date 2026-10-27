/* tests/browser-check.js —— 实机浏览器自动验证（headless Chrome + CDP，无第三方依赖）
 * 用法：node tests/browser-check.js
 * 作用：真实打开 原型/index.html（file:// 双击等价场景），逐条点击三端功能，断言 DOM 与数据状态，并截图留证。
 * 若本机没有 Chrome，可用 CHROME_PATH 环境变量指定。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'index.html').split(path.sep).join('/').replace(/^([A-Za-z]:)/, '$1');
const PORT = 9333;
const SHOT_DIR = path.join(__dirname, 'screenshots');
const PROFILE = path.join(__dirname, '.chrome-profile');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { fails.push(name + (extra ? ' → ' + extra : '')); console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
  return null;
}

function httpJson(p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: p, timeout: 2000 }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('未找到 Chrome/Edge，跳过实机验证'); process.exit(2); }
  console.log('浏览器: ' + chrome);
  console.log('打开页面: ' + PAGE);

  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    '--hide-scrollbars',
    '--window-size=1440,1100',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    PAGE
  ], { stdio: 'ignore', windowsHide: true });

  let cleanup = () => { try { child.kill('SIGKILL'); } catch (e) {} };
  process.on('exit', cleanup);

  let list = null;
  for (let i = 0; i < 60; i++) {
    try {
      list = await httpJson('/json/list');
      if (list && list.some((t) => t.type === 'page' && t.webSocketDebuggerUrl)) break;
    } catch (e) { /* 等待 devtools 端口就绪 */ }
    await wait(250);
  }
  if (!list) { console.log('无法连接 devtools，跳过'); cleanup(); process.exit(2); }
  const target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  console.log('target: ' + target.url);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      errors.push('exception: ' + (d.exception && d.exception.description ? d.exception.description : d.text));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push('console.error: ' + (m.params.args || []).map((a) => a.value || a.description || '').join(' '));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    }
  });

  function send(method, params) {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    return new Promise((res) => pending.set(id, res));
  }
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (!r.result) throw new Error('CDP evaluate 无返回: ' + JSON.stringify(r));
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error('页面异常: ' + (d.exception ? d.exception.description : d.text));
    }
    return r.result.result.value;
  }
  async function shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (r.result && r.result.data) {
      const f = path.join(SHOT_DIR, name);
      fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
      console.log('    截图 → tests/screenshots/' + name);
    }
  }
  const click = async (sel, ms) => {
    const found = await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()');
    if (!found) throw new Error('元素不存在，无法点击: ' + sel);
    await wait(ms == null ? 160 : ms);
  };
  const setField = async (sel, val, ms) => {
    const found = await evaluate('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.value=' + JSON.stringify(val) + '; e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true})); return true;})()');
    if (!found) throw new Error('表单元素不存在: ' + sel);
    await wait(ms == null ? 160 : ms);
  };
  const text = () => evaluate('document.body.innerText');
  const has = (t, s) => t.indexOf(s) >= 0;

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await wait(900);

  console.log('');
  console.log('== A. 双击打开（file://）首次加载 ==');
  const title = await evaluate('document.title');
  ok(has(title, '校园智能外卖柜'), '页面标题正确', title);
  ok(await evaluate('typeof window.Store === "object" && typeof window.UI === "object" && typeof window.App === "object"'), '三个脚本模块均加载（Store / UI / App）');
  ok(await evaluate('localStorage.getItem("WL_CABINET_PROTO_V1") !== null'), 'localStorage 已写入种子数据（file:// 下可写）');
  ok((await evaluate('window.Store.state().slots.length')) === 1360, '格口池 1,360 个');
  ok((await evaluate('window.Store.state().orders.length')) === 78, '种子订单 78 笔');
  ok((await evaluate('document.querySelectorAll(".point-card").length')) === 6, '骑手端渲染 6 个点位卡片');
  ok((await evaluate('window.App.ui.route')) === 'rider', '默认路由 = 骑手投柜端');
  ok(has(await text(), '骑手投柜端'), '首屏可见「骑手投柜端」');
  await shot('01-rider-home.png');

  console.log('');
  console.log('== B. 三端导航互通 ==');
  await click('[data-route="user"]', 260);
  ok((await evaluate('location.hash')) === '#/user', '导航到用户端（hash = #/user）');
  ok(has(await text(), '用户取餐端'), '页面显示「用户取餐端」');
  await click('[data-route="admin"]', 260);
  ok((await evaluate('location.hash')) === '#/admin', '导航到运营后台（hash = #/admin）');
  ok(has(await text(), '运营后台'), '页面显示「运营后台」');
  await click('[data-route="rider"]', 260);
  ok(has(await text(), '骑手投柜端'), '可再导航回骑手端');

  console.log('');
  console.log('== C. 骑手投柜：选点位 → 选温区 → 推荐格口 → 扫码开柜 → 生成取餐码 ==');
  await click('.point-card[data-pid="P2"]', 200);
  ok((await evaluate('window.App.ui.pointId')) === 'P2', '已选中 P2 点位');
  ok(has(await text(), 'A区14公寓与A区食堂之间'), 'P2 点位名正确（任务书第二节）');
  await click('[data-action="selectZone"][data-zone="保温"]', 200);
  ok((await evaluate('window.App.ui.zone')) === '保温', '已选择温区：保温');
  const recoText = await evaluate('document.querySelector(".reco-slot").innerText');
  ok(/P2-G[0-9]{2}/.test(recoText), '系统给出推荐格口', recoText);
  const recoReason = await evaluate('document.querySelector(".reco-reason").innerText');
  ok(has(recoReason, '占用率最低'), '推荐理由给出算法说明', recoReason.slice(0, 60));
  const p2Before = await evaluate('JSON.stringify(window.Store.pointStats("P2"))');
  const before2 = JSON.parse(p2Before);
  await click('[data-action="store"]', 1400);
  const code = await evaluate('(document.querySelector(".code-big")||{}).innerText || ""');
  ok(/^[0-9]{6}$/.test(code), '投柜成功后生成 6 位取餐码', code);
  const orderInfo = JSON.parse(await evaluate('JSON.stringify(window.Store.findByCode(' + JSON.stringify(code) + '))'));
  ok(orderInfo.status === 'stored', '订单已写入共享数据（状态：在柜待取）');
  ok(orderInfo.order.zone === '保温', '订单温区 = 保温（与所选一致）');
  ok(orderInfo.order.pointId === 'P2', '订单点位 = P2');
  const slotState = await evaluate('window.Store.slotOf(' + JSON.stringify(orderInfo.order.slotId) + ').st');
  ok(slotState === 'occupied', '格口状态 → 占用', orderInfo.order.slotId);
  const p2After = JSON.parse(await evaluate('JSON.stringify(window.Store.pointStats("P2"))'));
  ok(p2After.free === before2.free - 1, 'P2 剩余格口 -1', before2.free + ' → ' + p2After.free);
  ok(p2After.todayIn === before2.todayIn + 1, 'P2 今日投柜 +1');
  await shot('02-rider-success.png');

  console.log('');
  console.log('== D. 运营后台可见该订单（实时订单列表） ==');
  await click('[data-route="admin"]', 260);
  await click('[data-action="adminTab"][data-tab="orders"]', 300);
  const adminText = await text();
  ok(has(adminText, code), '后台实时订单列表出现骑手端刚投的取餐码 ' + code);
  ok(has(adminText, '在柜待取'), '订单状态显示「在柜待取」');
  ok(has(adminText, orderInfo.order.groupId), '柜号显示 ' + orderInfo.order.groupId);
  await shot('03-admin-orders.png');

  console.log('');
  console.log('== E. 用户取餐：输入取餐码 → 显示详情 → 开柜取餐 → 格口释放 ==');
  await click('[data-route="user"]', 260);
  await setField('#codeInput', code);
  await click('[data-action="lookup"]', 300);
  const userText = await text();
  ok(has(userText, '格口号'), '显示格口号');
  ok(has(userText, orderInfo.order.groupId), '显示柜号 ' + orderInfo.order.groupId);
  ok(has(userText, '保温'), '显示温区 保温');
  ok(has(userText, '存放时间'), '显示存放时间');
  ok(has(userText, '免费存放剩余'), '显示免费剩余时长提示');
  ok(has(userText, '超时费 = '), '显示超时费计算公式');
  await shot('04-user-detail.png');
  await click('[data-action="pickup"][data-code="' + code + '"]', 400);
  const pickedInfo = JSON.parse(await evaluate('JSON.stringify(window.Store.findByCode(' + JSON.stringify(code) + '))'));
  ok(pickedInfo.status === 'picked', '订单状态 → 已取餐');
  const slotAfter = await evaluate('window.Store.slotOf(' + JSON.stringify(orderInfo.order.slotId) + ').st');
  ok(slotAfter === 'free', '格口已释放回可用池', orderInfo.order.slotId);
  const p2Final = JSON.parse(await evaluate('JSON.stringify(window.Store.pointStats("P2"))'));
  ok(p2Final.free === before2.free, 'P2 剩余格口恢复为 ' + before2.free);
  ok(has(await text(), '已取餐'), '用户端页面显示「已取餐」');
  ok(!(await evaluate('!!document.querySelector("[data-action=\'pickup\'][data-code=\'' + code + '\']")')), '已取餐后开柜按钮消失（不能重复取餐）');
  await shot('05-user-picked.png');

  console.log('');
  console.log('== F. 超时提醒与超时费计算 ==');
  const overdueCodes = await evaluate('JSON.stringify(window.Store.overdueOrders().map(function(o){return o.code;}))');
  const odList = JSON.parse(overdueCodes);
  ok(odList.length >= 1, '存在超时未取订单', '共 ' + odList.length + ' 笔');
  await setField('#codeInput', odList[0]);
  await click('[data-action="lookup"]', 300);
  const odText = await text();
  ok(has(odText, '超时提醒'), '用户端出现超时提醒横幅');
  const formula = await evaluate('document.querySelector(".formula").innerText');
  ok(has(formula, '免费时长 120 分钟'), '公式含免费时长 120 分钟', formula.slice(0, 70));
  ok(has(formula, '超时费 = '), '公式含超时费计算式');
  const feeText = await evaluate('document.querySelector(".fee-total").innerText');
  ok(/[0-9]+\.[0-9]{2}/.test(feeText), '页面显示应缴超时费金额', feeText);
  console.log('    公式全文: ' + formula.replace(/\n/g, ' '));
  await shot('06-user-overtime.png');

  console.log('');
  console.log('== G. 运营后台超时预警列表 ==');
  await click('[data-route="admin"]', 260);
  await click('[data-action="adminTab"][data-tab="overdue"]', 300);
  const odAdmin = await text();
  ok(has(odAdmin, '超时预警'), '进入超时预警页');
  ok(has(odAdmin, odList[0]), '预警列表包含超时订单 ' + odList[0]);
  ok(has(odAdmin, '推送催取'), '提供催取操作');
  await shot('07-admin-overdue.png');

  console.log('');
  console.log('== H. 运维工单：创建 → 待处理 → 处理中 → 已修复（格口联动） ==');
  await click('[data-action="adminTab"][data-tab="tickets"]', 300);
  const tkBefore = await evaluate('window.Store.state().tickets.length');
  const freeBefore = await evaluate('window.Store.slotsOfGroup("P5-G01").filter(function(s){return s.st==="free";}).length');
  await setField('select[data-model="tPoint"]', 'P5', 260);
  await setField('select[data-model="tGroup"]', 'P5-G01', 200);
  await setField('select[data-model="tType"]', '柜门卡阻', 200);
  await setField('input[data-model="tDesc"]', '自检：副柜 03 号格口门锁不回弹', 120);
  await click('[data-action="newTicket"]', 420);
  const tkAfter = await evaluate('window.Store.state().tickets.length');
  ok(tkAfter === tkBefore + 1, '工单创建成功（数量 +1）');
  const newTicket = JSON.parse(await evaluate('JSON.stringify(window.Store.ticketsSorted()[0])'));
  ok(newTicket.status === 'pending', '新工单状态 = 待处理', newTicket.id);
  const freeAfterTicket = await evaluate('window.Store.slotsOfGroup("P5-G01").filter(function(s){return s.st==="free";}).length');
  ok(freeAfterTicket < freeBefore, '报修后该柜组空闲格口减少（' + freeBefore + ' → ' + freeAfterTicket + '）');
  ok(has(await text(), '待处理'), '工单列表显示「待处理」状态');
  await shot('08-admin-ticket-new.png');
  await click('[data-action="ticketAdvance"][data-id="' + newTicket.id + '"]', 380);
  const tk2 = JSON.parse(await evaluate('JSON.stringify(window.Store.ticketsSorted()[0])'));
  ok(tk2.status === 'processing', '受理后状态流转为「处理中」');
  await click('[data-action="ticketAdvance"][data-id="' + newTicket.id + '"]', 380);
  const tk3 = JSON.parse(await evaluate('JSON.stringify(window.Store.ticketsSorted()[0])'));
  ok(tk3.status === 'fixed', '修复后状态流转为「已修复」');
  const freeFixed = await evaluate('window.Store.slotsOfGroup("P5-G01").filter(function(s){return s.st==="free";}).length');
  ok(freeFixed === freeBefore, '修复后格口恢复可用（' + freeFixed + ' 个）');
  ok(has(await text(), '已修复'), '工单列表显示「已修复」状态');
  await shot('09-admin-ticket-fixed.png');

  console.log('');
  console.log('== I. KPI 报表（实时计算） ==');
  await click('[data-action="adminTab"][data-tab="kpi"]', 300);
  const kpiText = await text();
  ok(has(kpiText, '日投柜量') && has(kpiText, '超时率') && has(kpiText, '格口周转率'), 'KPI 页含日投柜量 / 超时率 / 格口周转率');
  ok(has(kpiText, '1,439,340'), 'KPI 页展示概算总投资 1,439,340 元（与任务书一致）');
  await shot('10-admin-kpi.png');

  console.log('');
  console.log('== J. 刷新页面数据不丢失（localStorage） ==');
  const ordersBefore = await evaluate('window.Store.state().orders.length');
  const ticketsBefore = await evaluate('window.Store.state().tickets.length');
  await send('Page.reload', { ignoreCache: true });
  await wait(1600);
  const ordersAfter = await evaluate('window.Store.state().orders.length');
  const ticketsAfter = await evaluate('window.Store.state().tickets.length');
  ok(ordersAfter === ordersBefore, '刷新后订单数不变（' + ordersBefore + ' → ' + ordersAfter + '）');
  ok(ticketsAfter === ticketsBefore, '刷新后工单数不变（' + ticketsBefore + ' → ' + ticketsAfter + '）');
  ok((await evaluate('window.Store.findByCode(' + JSON.stringify(code) + ').status')) === 'picked', '刷新后订单仍为「已取餐」');
  ok((await evaluate('window.Store.slotOf(' + JSON.stringify(orderInfo.order.slotId) + ').st')) === 'free', '刷新后格口仍为可用');
  await shot('11-after-reload.png');

  console.log('');
  console.log('== K. 无 JS 报错 ==');
  const realErrors = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND/.test(e));
  ok(realErrors.length === 0, '全程无未捕获异常 / console.error', realErrors.slice(0, 3).join(' | '));

  console.log('');
  console.log('浏览器实机断言：通过 ' + pass + ' 项，失败 ' + fails.length + ' 项');
  if (fails.length) { fails.forEach((f) => console.log(' - ' + f)); }
  ws.close();
  cleanup();
  await wait(300);
  fs.rmSync(PROFILE, { recursive: true, force: true });
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.log('实机验证异常：' + e.message);
  process.exit(1);
});
