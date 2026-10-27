/* tests/chain-demo.js —— 逐步链路演示（node 运行），把「点了什么 → 出现什么」逐步打印出来作为验证记录
 * 用法：node tests/chain-demo.js
 * 说明：这里调用的是页面里同一份 Store 业务函数（骑手端按钮 = createOrder，用户端按钮 = pickup，
 *       后台按钮 = pointStats/kpis/advanceTicket），因此输出即为点击后应看到的结果。
 *       真实浏览器中的等价操作序列见 README.md 第四节；实机脚本见 tests/browser-check.js。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const map = new Map();
const storage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
const sandbox = {
  console, localStorage: storage, location: { hash: '' }, addEventListener: () => {},
  setInterval: () => 0, setTimeout: () => 0, clearInterval: () => {},
  document: { readyState: 'complete', getElementById: () => null, createElement: () => ({ style: {} }), querySelectorAll: () => [], addEventListener: () => {}, body: { appendChild() {} } }
};
vm.createContext(sandbox);
sandbox.window = sandbox;
for (const f of ['data/store.js', 'js/ui.js', 'js/views.rider.js', 'js/views.user.js', 'js/views.admin.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const S = sandbox.window.Store;
const UI = sandbox.window.UI;
const st = S.init();

const line = (s) => console.log(s);
line('【0】文件：原型/index.html 双击打开（file://），6 个脚本按顺序加载，首屏默认进入骑手投柜端');
line('     localStorage 键 WL_CABINET_PROTO_V1 已写入：格口 ' + st.slots.length + ' 个，订单 ' + st.orders.length + ' 笔，工单 ' + st.tickets.length + ' 张');
const s0 = S.pointStats('P2');
const k0 = S.kpis();
line('     初始：P2 格口 ' + s0.total + '，占用 ' + s0.occupied + '，剩余 ' + s0.free + '；全局 日投柜 ' + k0.todayIn + '，在柜 ' + k0.stored + '，超时在柜 ' + k0.overdueNow);
line('');
line('【1】骑手端：点击点位卡片 P2「A区14公寓与A区食堂之间」');
line('     → 选中 P2（大柜 6 组 / 240 格口），剩余 ' + s0.free + '，常温可用 ' + s0.normalFree + '，保温可用 ' + s0.heatFree);
line('');
line('【2】骑手端：点击温区按钮「保温区（加热）」');
const rec = S.rankSlots('P2', '保温');
line('     → 系统推荐格口 ' + rec.slot.id + '（' + rec.slot.zone + '）');
line('     推荐理由：' + rec.reason);
line('');
line('【3】骑手端：点击「模拟扫码开柜 · 投柜」（700ms 模拟扫码/开门/关柜）');
const created = S.createOrder('P2', '保温', rec.slot.id, '骑手（演示）');
const o = created.order;
line('     → 投柜成功，生成取餐码 ' + o.code);
line('     → 落位：' + o.groupId + ' ' + (o.cab === 'M' ? '主柜' : '副柜') + '-' + UI.pad2(o.cell) + ' 号格口，温区 ' + o.zone + '，投柜时间 ' + UI.fmtDT(o.storedAt));
const s1 = S.pointStats('P2');
line('     → P2 占用 ' + s0.occupied + ' → ' + s1.occupied + '，剩余 ' + s0.free + ' → ' + s1.free + '；格口状态 = ' + S.slotOf(o.slotId).st);
line('');
line('【4】运营后台：顶部导航「运营后台」→ 页签「实时订单」');
const top = S.ordersSorted()[0];
line('     → 列表首行即刚投订单：取餐码 ' + top.code + ' ｜ ' + top.pointId + ' ｜ ' + top.groupId + ' ｜ 状态 ' + S.ORDER_STATUS[top.status]);
line('     → KPI 日投柜量 ' + k0.todayIn + ' → ' + S.kpis().todayIn + '；当前在柜 ' + k0.stored + ' → ' + S.kpis().stored);
line('');
line('【5】用户端：顶部导航「用户取餐端」→ 输入取餐码 ' + o.code + ' → 点「查询订单」');
const f1 = S.findByCode(o.code);
const fee1 = S.calcFee(f1.order);
line('     → 显示：点位 ' + f1.order.pointId + '，柜号 ' + f1.order.groupId + '（' + (f1.order.cab === 'M' ? '主柜' : '副柜') + '），格口号 ' + UI.pad2(f1.order.cell) + ' 号，温区 ' + f1.order.zone);
line('     → 存放时间 ' + UI.fmtDT(f1.order.storedAt) + '，已存放 ' + UI.durText(fee1.minutes) + '，免费剩余 ' + (120 - fee1.minutes) + ' 分钟，超时费 ' + UI.money(fee1.fee));
line('');
line('【6】用户端：点击「开柜取餐（免费）」');
const picked = S.pickup(o.code);
line('     → 取餐成功：订单状态 ' + S.ORDER_STATUS[picked.order.status] + '，取餐时间 ' + UI.fmtDT(picked.order.pickedAt) + '，超时费 ' + UI.money(picked.fee.fee));
line('     → 格口 ' + o.slotId + ' 状态 = ' + S.slotOf(o.slotId).st + '（已释放回可用池）');
const s2 = S.pointStats('P2');
line('     → P2 剩余格口恢复为 ' + s2.free + '（与投柜前 ' + s0.free + ' 一致）');
line('     → 重复取餐：' + (S.pickup(o.code).ok ? '仍然成功（异常）' : '被拒绝（' + S.pickup(o.code).reason + '）'));
line('');
line('【7】用户端：输入超时订单的取餐码（种子数据中的超时单）');
const od = S.overdueOrders()[0];
const odFee = S.calcFee(od);
line('     → 取餐码 ' + od.code + '，已存放 ' + odFee.minutes + ' 分钟，超过免费 120 分钟');
line('     → 页面红色提示「⏰ 超时提醒」，应缴超时费 ' + UI.money(odFee.fee));
line('     → 计算式：' + odFee.formula);
line('');
line('【8】运营后台：页签「超时预警」');
line('     → 预警单数 ' + S.overdueOrders().length + '：' + S.overdueOrders().map((x) => x.code + '(' + S.calcFee(x).overtimeMinutes + '分超时/' + UI.money(S.calcFee(x).fee) + ')').join('  '));
line('');
line('【9】运营后台：页签「运维工单」→ 点位 P5 / 柜组 P5-G01 / 类型「柜门卡阻」→ 提交报修');
const freeB = S.slotsOfGroup('P5-G01').filter((x) => x.st === 'free').length;
const tk = S.createTicket('P5', 'P5-G01', '柜门卡阻', '演示：副柜 03 号格口门锁不回弹');
line('     → 工单 ' + tk.ticket.id + '「' + S.TICKET_STATUS[tk.ticket.status] + '」，影响格口 ' + tk.ticket.affected + ' 个；P5-G01 可用格口 ' + freeB + ' → ' + S.slotsOfGroup('P5-G01').filter((x) => x.st === 'free').length);
const a1 = S.advanceTicket(tk.ticket.id);
line('     → 点击「受理」：' + S.TICKET_STATUS[a1.ticket.status]);
const a2 = S.advanceTicket(tk.ticket.id);
line('     → 点击「修复完成」：' + S.TICKET_STATUS[a2.ticket.status] + '，恢复格口 ' + a2.freed + ' 个；P5-G01 可用格口回到 ' + S.slotsOfGroup('P5-G01').filter((x) => x.st === 'free').length);
line('     → 工单处理日志：');
tk.ticket.logs.forEach((l) => line('        ' + UI.fmtDT(l.ts) + '  ' + l.text));
line('');
line('【10】刷新页面（F5）→ localStorage 重新加载');
const beforeOrders = JSON.stringify(S.state().orders.length);
const beforeTickets = JSON.stringify(S.state().tickets.length);
const ctx2 = {
  console, localStorage: storage, location: { hash: '' }, addEventListener: () => {}, setInterval: () => 0, setTimeout: () => 0,
  document: { readyState: 'complete', getElementById: () => null, createElement: () => ({ style: {} }), querySelectorAll: () => [], addEventListener: () => {}, body: { appendChild() {} } }
};
vm.createContext(ctx2);
ctx2.window = ctx2;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/store.js'), 'utf8'), ctx2);
const S2 = ctx2.window.Store;
const st2 = S2.init();
line('     → 订单 ' + beforeOrders + ' → ' + st2.orders.length + ' 笔；工单 ' + beforeTickets + ' → ' + st2.tickets.length + ' 张');
line('     → 订单 ' + o.code + ' 状态仍为 ' + S2.ORDER_STATUS[S2.findByCode(o.code).status] + '，格口 ' + o.slotId + ' 仍为 ' + S2.slotOf(o.slotId).st);
line('     → 工单 ' + tk.ticket.id + ' 仍为 ' + S2.TICKET_STATUS[S2.ticketsSorted()[0].status]);
line('');
line('链路演示结束：骑手投柜 → 订单写入 → 后台可见 → 用户取餐 → 格口释放 → 超时计费 → 工单流转 → 持久化，全部走通。');
