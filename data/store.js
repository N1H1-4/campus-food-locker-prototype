/*!
 * data/store.js —— 三端共用的唯一模拟数据层（骑手端 / 用户端 / 运营后台 读取同一份 localStorage 数据）
 * 数据源：任务书/项目任务书_v1.md（唯一数据源）。点位、柜型、组数、格口数、工期、概算、效益口径全部取自该文件，原型未另算一套。
 * 任务书未规定的业务口径（超时收费标准、故障停机口径、演示种子订单）均为「假设值」，见下方 RULES.assume 与 README.md。
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'WL_CABINET_PROTO_V1';
  var SCHEMA_VERSION = 3;

  /* ============ 一、任务书 v1 常量（只读，禁止改动） ============ */
  var TASKBOOK = {
    projectName: '哈尔滨商业大学北校区校园智能外卖柜末端配送体系建设项目',
    site: '哈尔滨市松北区学海街1号',
    coord: '126.562773,45.816937',
    campus: 'A / B / C 三区',
    population: 15000,
    pointCount: 6,
    groupCount: 34,
    slotCount: 1360,
    mainCell: 16,
    subCell: 24,
    heatSlot: 340,
    duration: 114,
    planStart: '2026-03-02',
    planEnd: '2026-08-07',
    commitDuration: 122,
    commitEnd: '2026-08-19',
    budget: 1439340,
    budgetWan: '143.93 万元',
    laborHour: 4348,
    laborCost: 200552,
    peakStaff: 11,
    dayOrder: 4200,
    useRate: 55,
    dayCabinet: 2310,
    riderUnitFee: 0.8,
    opDays: 300,
    yearRevenue: 698400,
    yearCost: 300000,
    yearCash: 398400,
    payback: 3.61,
    pertTE: 120.0,
    pertVar: 17.2778,
    pertSigma: 4.157,
    z114: -1.4435,
    p114: '7.44%',
    z122: 0.4812,
    p122: '68.48%',
    criticalPath: 'A→B→C→E→H→I→K→N→O→Q→S→U',
    source: '任务书/项目任务书_v1.md'
  };

  /* ============ 二、点位配置（任务书第二节，逐字一致） ============ */
  var POINTS = [
    { id: 'P1', name: 'A区图书馆北门广场', detail: '图书馆—行政楼—下沉广场交汇', type: '超大', groups: 12, slots: 480,
      cover: 'A区教学区+自习人流，约9,000人', basis: '手绘地图+卫星图双证' },
    { id: 'P2', name: 'A区14公寓与A区食堂之间', detail: '14/15公寓与A区食堂连片', type: '大', groups: 6, slots: 240,
      cover: 'A区10–20公寓住宿群核心', basis: '卫星图：14/15公寓与A区食堂连片' },
    { id: 'P3', name: 'B区1–2公寓与B区食堂之间', detail: '1/2公寓、B区食堂、镜湖', type: '大', groups: 6, slots: 240,
      cover: 'B区1–4公寓住宿，约3,000人', basis: '卫星图：1/2公寓、B区食堂、镜湖' },
    { id: 'P4', name: 'C区5–6公寓与C区食堂之间', detail: '5/6公寓、C区食堂', type: '大', groups: 6, slots: 240,
      cover: 'C区5–9公寓住宿，约3,000人', basis: '卫星图：5/6公寓、C区食堂' },
    { id: 'P5', name: 'A区教学主楼／大课室门厅', detail: '上课时段集中人流', type: '小', groups: 2, slots: 80,
      cover: '上课时段集中人流', basis: '手绘地图：A区教学主楼、大课室' },
    { id: 'P6', name: 'B区食品工程学院实验楼', detail: '食品工程学院、能源与建筑工程学院', type: '小', groups: 2, slots: 80,
      cover: '实验楼课间与夜间，约2,000人', basis: '卫星图：食品工程学院、能源与建筑工程学院' }
  ];

  /* 温区：概算第 4 项「保温/加热分区改造 340 格口（25%）」→ 每组 40 格口中 10 格为保温区（主柜 4 + 副柜 6），34 组 × 10 = 340 格口。 */
  var ZONES = ['常温', '保温'];
  var HEAT_MAIN = 4;
  var HEAT_SUB = 6;

  /* ============ 三、业务规则（任务书未规定 → 标注为假设值） ============ */
  var RULES = {
    freeMinutes: 120,
    stepMinutes: 60,
    feePerStep: 1.0,
    capFee: 5.0,
    assume: [
      '超时计费为假设值：任务书只要求功能，未给出收费标准。本原型按「免费存放 2 小时，超出后每满 1 小时（不足 1 小时按 1 小时计）加收 1.00 元，单笔封顶 5.00 元」执行。',
      '故障停机为假设值：工单创建后该柜组当前空闲格口置为「报修停用」，修复完成自动恢复可用（任务书仅要求「故障工单」功能）。',
      '演示种子订单为模拟数据：近 4 日共 78 笔（前 3 日各 16 笔 + 今日 30 笔），仅用于让看板 / KPI 有初始分布，不代表真实调研结果。',
      '格口周转率口径：当日投柜笔数 ÷ 格口总数（次/格口·日），任务书未定义该指标公式，此处为演示口径。'
    ]
  };

  var TICKET_TYPES = ['柜门卡阻', '触摸屏黑屏', '通信中断（4G 模组）', '加热模块异常', '格口传感器误报', '其他'];
  var TICKET_STATUS = { pending: '待处理', processing: '处理中', fixed: '已修复' };
  var ORDER_STATUS = { stored: '在柜待取', picked: '已取餐' };

  /* ============ 四、工具 ============ */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function pad4(n) { return ('000' + n).slice(-4); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pointById(id) {
    for (var i = 0; i < POINTS.length; i++) if (POINTS[i].id === id) return POINTS[i];
    return null;
  }
  function groupsOf(pointId) {
    var p = pointById(pointId);
    var out = [];
    if (!p) return out;
    for (var g = 1; g <= p.groups; g++) out.push(pointId + '-G' + pad2(g));
    return out;
  }
  function cabinetName(cab) { return cab === 'M' ? '主柜' : '副柜'; }
  function fmtMinute(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* ============ 五、格口池构建 ============ */
  function buildSlots() {
    var out = [];
    for (var i = 0; i < POINTS.length; i++) {
      var p = POINTS[i];
      for (var g = 1; g <= p.groups; g++) {
        var gid = p.id + '-G' + pad2(g);
        for (var c = 1; c <= TASKBOOK.mainCell; c++) {
          out.push({ id: gid + '-M' + pad2(c), zone: c <= HEAT_MAIN ? '保温' : '常温', st: 'free' });
        }
        for (var c2 = 1; c2 <= TASKBOOK.subCell; c2++) {
          out.push({ id: gid + '-S' + pad2(c2), zone: c2 <= HEAT_SUB ? '保温' : '常温', st: 'free' });
        }
      }
    }
    return out;
  }

  /* ============ 六、状态与持久化 ============ */
  var state = null;
  var slotIndex = null;
  var storageOK = true;

  function rebuildIndex() {
    slotIndex = {};
    for (var i = 0; i < state.slots.length; i++) slotIndex[state.slots[i].id] = state.slots[i];
  }

  function save() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOK = true;
      return true;
    } catch (e) {
      storageOK = false;
      return false;
    }
  }

  function readRaw() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      storageOK = false;
      return null;
    }
  }

  function now() { return Date.now() + state.clockOffset; }
  function todayStart(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function slotOf(id) { return slotIndex[id] || null; }
  function slotsOfPoint(pid) {
    var out = [];
    for (var i = 0; i < state.slots.length; i++) if (state.slots[i].id.slice(0, 2) === pid) out.push(state.slots[i]);
    return out;
  }
  function slotsOfGroup(gid) {
    var out = [];
    for (var i = 0; i < state.slots.length; i++) {
      var s = state.slots[i];
      if (s.id.slice(0, 6) === gid) out.push(s);
    }
    return out;
  }

  function ordersOfPoint(pid) {
    var out = [];
    for (var i = 0; i < state.orders.length; i++) if (state.orders[i].pointId === pid) out.push(state.orders[i]);
    return out;
  }

  /* ============ 七、推荐算法 ============ */
  /* 规则：先按温区筛可用格口 → 优先分配至当前占用率最低的柜组（均衡负载）→ 同组内主柜优先（有触摸屏、贴近操作面）→ 格口号升序。 */
  function rankSlots(pid, zone) {
    var p = pointById(pid);
    if (!p) return { ok: false, reason: '点位不存在：' + pid, candidates: [] };
    var groupLoad = {};
    var candidates = [];
    var list = slotsOfPoint(pid);
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.zone !== zone) continue;
      var gid = s.id.slice(0, 6);
      if (!groupLoad[gid]) groupLoad[gid] = { total: 0, occ: 0, free: 0, fault: 0 };
      groupLoad[gid].total++;
      if (s.st === 'occupied') groupLoad[gid].occ++;
      else if (s.st === 'fault') groupLoad[gid].fault++;
      else { groupLoad[gid].free++; candidates.push(s); }
    }
    if (!candidates.length) {
      return { ok: false, reason: '点位 ' + pid + ' 的「' + zone + '」温区当前无可用格口（已被占用或柜组报修停用）', candidates: [] };
    }
    candidates.sort(function (a, b) {
      var ga = groupLoad[a.id.slice(0, 6)];
      var gb = groupLoad[b.id.slice(0, 6)];
      var ra = ga.occ / ga.total;
      var rb = gb.occ / gb.total;
      if (Math.abs(ra - rb) > 0.0001) return ra - rb;
      var cabA = a.id.charAt(7) === 'M' ? 0 : 1;
      var cabB = b.id.charAt(7) === 'M' ? 0 : 1;
      if (cabA !== cabB) return cabA - cabB;
      return a.id < b.id ? -1 : 1;
    });
    var best = candidates[0];
    var gbest = groupLoad[best.id.slice(0, 6)];
    return {
      ok: true,
      point: p,
      zone: zone,
      slot: best,
      groupLoad: groupLoad,
      load: gbest,
      freeInZone: candidates.length,
      candidates: candidates.slice(0, 5).map(function (s) { return s.id; }),
      reason: '按温区「' + zone + '」筛选，' + pid + ' 共 ' + candidates.length + ' 个可用格口；'
        + '优先分配至占用率最低的柜组 ' + best.id.slice(0, 6) + '（占用 ' + gbest.occ + '/' + gbest.total + ' = '
        + (gbest.occ / gbest.total * 100).toFixed(1) + '%），组内主柜优先、格口号升序。'
    };
  }

  /* ============ 八、订单 ============ */
  function genCode() {
    var used = {};
    for (var i = 0; i < state.orders.length; i++) used[state.orders[i].code] = true;
    for (var t = 0; t < 400; t++) {
      var code = String(Math.floor(100000 + Math.random() * 900000));
      if (!used[code]) return code;
    }
    return String(100000 + state.seq.order).slice(-6);
  }

  function createOrder(pid, zone, slotId, riderName) {
    var rank = rankSlots(pid, zone);
    var slot = null;
    if (slotId) {
      var s = slotOf(slotId);
      if (!s) return { ok: false, reason: '格口不存在：' + slotId };
      if (s.id.slice(0, 2) !== pid) return { ok: false, reason: '格口与点位不匹配' };
      if (s.zone !== zone) return { ok: false, reason: '格口温区与所选温区不匹配' };
      if (s.st === 'occupied') return { ok: false, reason: '该格口已被占用' };
      if (s.st === 'fault') return { ok: false, reason: '该格口所在柜组报修停用' };
      slot = s;
    } else {
      if (!rank.ok) return { ok: false, reason: rank.reason };
      slot = rank.slot;
    }
    slot.st = 'occupied';
    var ts = now();
    var code = genCode();
    state.seq.order = state.seq.order + 1;
    var order = {
      id: 'OD' + ('0000' + state.seq.order).slice(-4),
      code: code,
      pointId: pid,
      groupId: slot.id.slice(0, 6),
      cab: slot.id.charAt(7),
      cell: parseInt(slot.id.slice(9), 10),
      slotId: slot.id,
      zone: zone,
      storedAt: ts,
      status: 'stored',
      pickedAt: null,
      minutes: null,
      fee: 0,
      overtime: false,
      rider: riderName || '骑手（模拟）',
      seeded: false
    };
    state.orders.push(order);
    save();
    return { ok: true, order: order, rank: rank };
  }

  function findByCode(code) {
    var c = String(code == null ? '' : code).trim();
    if (!c) return { status: 'empty' };
    var hitStored = null;
    var hitPicked = null;
    for (var i = 0; i < state.orders.length; i++) {
      var o = state.orders[i];
      if (o.code !== c) continue;
      if (o.status === 'stored') hitStored = o;
      else if (!hitPicked || o.pickedAt > hitPicked.pickedAt) hitPicked = o;
    }
    if (hitStored) return { status: 'stored', order: hitStored };
    if (hitPicked) return { status: 'picked', order: hitPicked };
    return { status: 'notfound' };
  }

  function storedMinutes(order, at) {
    var t = at == null ? now() : at;
    return Math.max(0, Math.floor((t - order.storedAt) / 60000));
  }

  function calcFee(order, at) {
    var minutes = order.status === 'picked' && order.minutes != null ? order.minutes : storedMinutes(order, at);
    var over = Math.max(0, minutes - RULES.freeMinutes);
    var hours = Math.ceil(over / RULES.stepMinutes);
    var raw = hours * RULES.feePerStep;
    var fee = Math.min(raw, RULES.capFee);
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    var formula = '存放时长 ' + h + ' 小时 ' + m + ' 分（' + minutes + ' 分钟）'
      + ' − 免费时长 ' + RULES.freeMinutes + ' 分钟 = 超时 ' + over + ' 分钟；'
      + '计费时数 = ⌈' + over + ' ÷ ' + RULES.stepMinutes + '⌉ = ' + hours + ' 小时；'
      + '超时费 = ' + hours + ' × ' + RULES.feePerStep.toFixed(2) + ' 元 = ' + raw.toFixed(2) + ' 元'
      + (raw > RULES.capFee ? '，超过单笔封顶 ' + RULES.capFee.toFixed(2) + ' 元，按封顶计 ' + fee.toFixed(2) + ' 元' : '')
      + '。';
    return { minutes: minutes, overtimeMinutes: over, billHours: hours, raw: raw, fee: fee, isOvertime: minutes > RULES.freeMinutes, formula: formula };
  }

  function pickup(code) {
    var f = findByCode(code);
    if (f.status === 'empty') return { ok: false, reason: '请输入 6 位取餐码' };
    if (f.status === 'notfound') return { ok: false, reason: '未找到取餐码 ' + code + ' 的订单' };
    if (f.status === 'picked') return { ok: false, reason: '该取餐码已于 ' + fmtMinute(f.order.pickedAt) + ' 取餐，不能重复开柜', order: f.order };
    var order = f.order;
    var fee = calcFee(order);
    order.status = 'picked';
    order.pickedAt = now();
    order.minutes = fee.minutes;
    order.fee = fee.fee;
    order.overtime = fee.isOvertime;
    var slot = slotOf(order.slotId);
    if (slot) slot.st = 'free';
    save();
    return { ok: true, order: order, fee: fee };
  }

  /* ============ 九、点位统计与 KPI ============ */
  function pointStats(pid) {
    var total = 0, free = 0, occ = 0, fault = 0;
    var heatFree = 0, heatTotal = 0, normalFree = 0, normalTotal = 0;
    var list = slotsOfPoint(pid);
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      total++;
      if (s.zone === '保温') { heatTotal++; if (s.st === 'free') heatFree++; } else { normalTotal++; if (s.st === 'free') normalFree++; }
      if (s.st === 'free') free++;
      else if (s.st === 'occupied') occ++;
      else fault++;
    }
    var ds = todayStart(now());
    var todayIn = 0, todayOut = 0;
    var os = ordersOfPoint(pid);
    for (var j = 0; j < os.length; j++) {
      if (os[j].storedAt >= ds) todayIn++;
      if (os[j].pickedAt && os[j].pickedAt >= ds) todayOut++;
    }
    return {
      pid: pid, total: total, free: free, occupied: occ, fault: fault,
      rate: total ? occ / total : 0,
      todayIn: todayIn, todayOut: todayOut,
      turns: total ? todayIn / total : 0,
      heatFree: heatFree, heatTotal: heatTotal, normalFree: normalFree, normalTotal: normalTotal
    };
  }

  function allPointStats() {
    return POINTS.map(function (p) {
      var s = pointStats(p.id);
      s.point = p;
      return s;
    });
  }

  function kpis() {
    var ds = todayStart(now());
    var t = now();
    var todayIn = 0, todayPicked = 0, overtime = 0, pickedToday = [];
    var stored = 0, overdueNow = 0;
    for (var i = 0; i < state.orders.length; i++) {
      var o = state.orders[i];
      var isToday = o.storedAt >= ds;
      if (isToday) todayIn++;
      if (o.status === 'stored') {
        stored++;
        if (t - o.storedAt > RULES.freeMinutes * 60000) overdueNow++;
      }
      if (o.pickedAt && o.pickedAt >= ds) {
        todayPicked++;
        if (o.minutes != null) pickedToday.push(o.minutes);
      }
      if (isToday) {
        if (o.status === 'picked') { if (o.minutes != null && o.minutes > RULES.freeMinutes) overtime++; }
        else if (t - o.storedAt > RULES.freeMinutes * 60000) overtime++;
      }
    }
    var totalSlots = 0, occ = 0, fault = 0;
    for (var k = 0; k < state.slots.length; k++) {
      totalSlots++;
      if (state.slots[k].st === 'occupied') occ++;
      else if (state.slots[k].st === 'fault') fault++;
    }
    var avgMin = 0;
    for (var m = 0; m < pickedToday.length; m++) avgMin += pickedToday[m];
    avgMin = pickedToday.length ? avgMin / pickedToday.length : 0;
    var ticketStat = { pending: 0, processing: 0, fixed: 0 };
    for (var n = 0; n < state.tickets.length; n++) ticketStat[state.tickets[n].status]++;
    return {
      totalSlots: totalSlots, occupied: occ, fault: fault, free: totalSlots - occ - fault,
      occupancy: totalSlots ? occ / totalSlots : 0,
      todayIn: todayIn, todayPicked: todayPicked, overtime: overtime,
      overtimeRate: todayIn ? overtime / todayIn : 0,
      turnRate: totalSlots ? todayIn / totalSlots : 0,
      avgMinutes: avgMin, stored: stored, overdueNow: overdueNow,
      ticketStat: ticketStat,
      orderCount: state.orders.length,
      bookTurn: TASKBOOK.dayCabinet / TASKBOOK.slotCount
    };
  }

  /* ============ 十、运维工单 ============ */
  function createTicket(pid, gid, type, desc) {
    if (!pointById(pid)) return { ok: false, reason: '点位不存在' };
    if (groupsOf(pid).indexOf(gid) < 0) return { ok: false, reason: '柜组不存在：' + gid };
    state.seq.ticket = state.seq.ticket + 1;
    var t = now();
    var affected = 0;
    var list = slotsOfGroup(gid);
    for (var i = 0; i < list.length; i++) {
      if (list[i].st === 'free') { list[i].st = 'fault'; affected++; }
    }
    var ticket = {
      id: 'WO-' + pad4(state.seq.ticket),
      pointId: pid,
      groupId: gid,
      type: type || '其他',
      desc: desc || '',
      createdAt: t,
      status: 'pending',
      affected: affected,
      handler: '',
      startedAt: null,
      fixedAt: null,
      logs: [{ ts: t, text: '骑手/巡检报修，工单创建；该柜组 ' + affected + ' 个空闲格口置为「报修停用」。' }]
    };
    state.tickets.push(ticket);
    save();
    return { ok: true, ticket: ticket };
  }

  function advanceTicket(id) {
    var ticket = null;
    for (var i = 0; i < state.tickets.length; i++) if (state.tickets[i].id === id) ticket = state.tickets[i];
    if (!ticket) return { ok: false, reason: '工单不存在' };
    if (ticket.status === 'pending') {
      ticket.status = 'processing';
      ticket.startedAt = now();
      ticket.handler = '运维工程师（模拟）';
      ticket.logs.push({ ts: now(), text: '运维受理，状态置为「处理中」，现场排查中。' });
      save();
      return { ok: true, ticket: ticket };
    }
    if (ticket.status === 'processing') {
      ticket.status = 'fixed';
      ticket.fixedAt = now();
      var freed = 0;
      var list = slotsOfGroup(ticket.groupId);
      for (var j = 0; j < list.length; j++) {
        if (list[j].st === 'fault') { list[j].st = 'free'; freed++; }
      }
      ticket.logs.push({ ts: now(), text: '故障排除，状态置为「已修复」；' + freed + ' 个格口恢复可用。' });
      save();
      return { ok: true, ticket: ticket, freed: freed };
    }
    return { ok: false, reason: '工单已是「已修复」状态，无需再流转' };
  }

  function ticketsSorted() {
    var arr = state.tickets.slice();
    arr.sort(function (a, b) { return b.createdAt - a.createdAt; });
    return arr;
  }

  function ordersSorted() {
    var arr = state.orders.slice();
    arr.sort(function (a, b) { return b.storedAt - a.storedAt; });
    return arr;
  }

  function overdueOrders(at) {
    var t = at == null ? now() : at;
    var out = [];
    for (var i = 0; i < state.orders.length; i++) {
      var o = state.orders[i];
      if (o.status === 'stored' && t - o.storedAt > RULES.freeMinutes * 60000) out.push(o);
    }
    out.sort(function (a, b) { return a.storedAt - b.storedAt; });
    return out;
  }

  /* ============ 十一、种子数据（模拟，非调研数据） ============ */
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var POINT_WEIGHT = [0.40, 0.18, 0.14, 0.14, 0.07, 0.07];
  function pickPoint(rand) {
    var r = rand();
    var acc = 0;
    for (var i = 0; i < POINT_WEIGHT.length; i++) {
      acc += POINT_WEIGHT[i];
      if (r <= acc) return POINTS[i].id;
    }
    return 'P1';
  }
  function pickZone(rand) { return rand() < 0.3 ? '保温' : '常温'; }
  function pickFreeSlot(pid, zone, rand) {
    var list = slotsOfPoint(pid);
    var pool = [];
    for (var i = 0; i < list.length; i++) if (list[i].st === 'free' && list[i].zone === zone) pool.push(list[i]);
    if (!pool.length) {
      pool = [];
      for (var j = 0; j < list.length; j++) if (list[j].st === 'free') pool.push(list[j]);
    }
    if (!pool.length) return null;
    return pool[Math.floor(rand() * pool.length)];
  }

  function seedOrder(pid, zone, storedAt, pickedAt, code, rand) {
    var slot = pickFreeSlot(pid, zone, rand);
    if (!slot) return null;
    slot.st = pickedAt == null ? 'occupied' : 'free';
    state.seq.order = state.seq.order + 1;
    var minutes = pickedAt == null ? null : Math.max(1, Math.round((pickedAt - storedAt) / 60000));
    var o = {
      id: 'OD' + ('0000' + state.seq.order).slice(-4),
      code: code,
      pointId: pid,
      groupId: slot.id.slice(0, 6),
      cab: slot.id.charAt(7),
      cell: parseInt(slot.id.slice(9), 10),
      slotId: slot.id,
      zone: slot.zone,
      storedAt: storedAt,
      status: pickedAt == null ? 'stored' : 'picked',
      pickedAt: pickedAt,
      minutes: minutes,
      fee: 0,
      overtime: minutes != null ? minutes > RULES.freeMinutes : false,
      rider: '骑手（模拟）',
      seeded: true
    };
    if (o.overtime) o.fee = calcFee(o, pickedAt).fee;
    state.orders.push(o);
    return o;
  }

  function seed() {
    var t = Date.now();
    var ds = todayStart(t);
    state = {
      v: SCHEMA_VERSION,
      seededAt: t,
      clockOffset: 0,
      slots: buildSlots(),
      orders: [],
      tickets: [],
      seq: { order: 0, ticket: 0 }
    };
    rebuildIndex();
    var rand = mulberry32(20260302);
    var codeSeq = 200100;

    /* 前 3 日：每日 16 笔，全部已取；其中部分存放超 2 小时（用于让超时率有分布） */
    for (var d = 3; d >= 1; d--) {
      var base = ds - d * 86400000;
      for (var i = 0; i < 16; i++) {
        var pid = pickPoint(rand);
        var zone = pickZone(rand);
        var storedAt = base + (8 * 60 + Math.floor(rand() * 720)) * 60000;
        if (storedAt > t - 70 * 60000) storedAt = t - 150 * 60000;
        var dur;
        var r = rand();
        if (r < 0.62) dur = 12 + Math.floor(rand() * 95);
        else if (r < 0.88) dur = 125 + Math.floor(rand() * 70);
        else dur = 40 + Math.floor(rand() * 60);
        seedOrder(pid, zone, storedAt, storedAt + dur * 60000, String(codeSeq++), rand);
      }
    }

    /* 今日：22 笔已取（其中 3 笔超时），8 笔仍在柜（其中 3 笔已超时） */
    var winMin = Math.max(60, Math.floor((t - ds) / 60000));
    for (var k = 0; k < 22; k++) {
      var pid2 = pickPoint(rand);
      var zone2 = pickZone(rand);
      var frac = (k + 1) / 24;
      var storedAt2 = ds + Math.floor(winMin * frac * 0.8) * 60000;
      if (storedAt2 > t - 8 * 60000) storedAt2 = t - 9 * 60000;
      var dur2 = k < 3 ? 126 + Math.floor(rand() * 50) : 15 + Math.floor(rand() * 90);
      var picked2 = Math.min(storedAt2 + dur2 * 60000, t - 60000);
      var actual = Math.max(3, Math.round((picked2 - storedAt2) / 60000));
      seedOrder(pid2, zone2, storedAt2, picked2, String(codeSeq++), rand);
      var last = state.orders[state.orders.length - 1];
      if (last && last.code === String(codeSeq - 1)) {
        last.minutes = actual;
        last.overtime = actual > RULES.freeMinutes;
        last.fee = last.overtime ? calcFee(last, picked2).fee : 0;
      }
    }
    var offsets = [168, 141, 126, 108, 92, 74, 45, 17];
    for (var m = 0; m < offsets.length; m++) {
      var pid3 = pickPoint(rand);
      var zone3 = pickZone(rand);
      seedOrder(pid3, zone3, t - offsets[m] * 60000, null, String(codeSeq++), rand);
    }

    /* 2 张工单：一张已修复（历史），一张待处理（今日），一张处理中 */
    createTicket('P3', 'P3-G04', '触摸屏黑屏', 'B区食堂点位第 4 组主柜触摸屏无显示，骑手无法扫码开柜。');
    advanceTicket('WO-0001');
    advanceTicket('WO-0001');
    createTicket('P1', 'P1-G11', '柜门卡阻', '图书馆北门广场第 11 组副柜 06 号格口柜门卡住，取餐后无法自动回弹。');
    advanceTicket('WO-0002');
    createTicket('P6', 'P6-G02', '加热模块异常', '食品工程学院实验楼第 2 组保温区温度偏低（巡检上报）。');
    state.seededAt = Date.now();
    save();
  }

  /* ============ 十二、初始化与对外 API ============ */
  function init() {
    var raw = readRaw();
    if (raw && raw.v === SCHEMA_VERSION && raw.slots && raw.slots.length) {
      state = raw;
      if (!state.clockOffset) state.clockOffset = 0;
      if (!state.seq) state.seq = { order: state.orders.length, ticket: state.tickets.length };
      rebuildIndex();
    } else {
      seed();
    }
    return state;
  }

  function resetDemo() {
    try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) { storageOK = false; }
    seed();
    return state;
  }

  function advanceClock(minutes) {
    state.clockOffset = (state.clockOffset || 0) + minutes * 60000;
    save();
    return now();
  }
  function resetClock() {
    state.clockOffset = 0;
    save();
    return now();
  }

  global.Store = {
    TASKBOOK: TASKBOOK,
    POINTS: POINTS,
    ZONES: ZONES,
    RULES: RULES,
    TICKET_TYPES: TICKET_TYPES,
    TICKET_STATUS: TICKET_STATUS,
    ORDER_STATUS: ORDER_STATUS,
    init: init,
    resetDemo: resetDemo,
    save: save,
    isStorageOK: function () { return storageOK; },
    now: now,
    todayStart: todayStart,
    advanceClock: advanceClock,
    resetClock: resetClock,
    clockOffset: function () { return state.clockOffset || 0; },
    pointById: pointById,
    groupsOf: groupsOf,
    cabinetName: cabinetName,
    slotsOfPoint: slotsOfPoint,
    slotsOfGroup: slotsOfGroup,
    slotOf: slotOf,
    rankSlots: rankSlots,
    recommend: function (pid, zone) { return rankSlots(pid, zone); },
    createOrder: createOrder,
    findByCode: findByCode,
    storedMinutes: storedMinutes,
    calcFee: calcFee,
    pickup: pickup,
    pointStats: pointStats,
    allPointStats: allPointStats,
    kpis: kpis,
    createTicket: createTicket,
    advanceTicket: advanceTicket,
    ticketsSorted: ticketsSorted,
    ordersSorted: ordersSorted,
    overdueOrders: overdueOrders,
    ordersOfPoint: ordersOfPoint,
    state: function () { return state; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
