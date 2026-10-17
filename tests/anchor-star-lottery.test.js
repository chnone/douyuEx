const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/packages/AnchorStarLottery/AnchorStarLottery.js"), "utf8");

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function setup({ coins = 237, lottery, info, href = "https://www.douyu.com/pages/new-anchor-support/?rid=123", referrer = "" } = {}) {
  const calls = [], statuses = [], busy = [];
  let active = 0, maxActive = 0;
  let balance = coins;
  const context = vm.createContext({
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    window: { location: { href } }, document: { referrer },
    getCCN: () => "token&=中文", sleep: () => Promise.resolve(),
    fetch: async (url, options) => {
      calls.push({ url, options });
      maxActive = Math.max(maxActive, ++active);
      try {
        if (options.method === "POST") {
          const result = await (lottery ? lottery(url, options) : response({ error: 0, data: {} }));
          balance = Number(balance) - Number(new URLSearchParams(options.body).get("num")) * 10;
          return result;
        }
        return await (info ? info() : response({ error: 0, data: { myCoin: balance } }));
      } finally { active--; }
    }
  });
  vm.runInContext(source, context);
  const view = { status: text => statuses.push(text), busy: value => busy.push(value) };
  return { context, calls, statuses, busy, view, maxActive: () => maxActive, refill: value => { balance = value; }, run: () => context.AnchorStarLottery_run(view) };
}

test("237金币分成两次十连和三次单抽；串行且编码参数", async () => {
  const env = setup();
  await env.run();
  const posts = env.calls.filter(call => call.options.method === "POST");
  assert.deepEqual(posts.map(call => new URLSearchParams(call.options.body).get("num")), ["10", "10", "1", "1", "1"]);
  assert.equal(env.maxActive(), 1);
  for (const { options } of posts) {
    const body = new URLSearchParams(options.body);
    assert.equal(body.get("rid"), "123");
    assert.equal(body.get("ctn"), "token&=中文");
    assert.equal(options.credentials, "include");
    assert.notEqual(options.mode, "no-cors");
  }
  assert.match(env.statuses.at(-1), /完成 23 次，累计消耗 230 金币/);
  assert.deepEqual(env.busy, [true, false]);
});

for (const coins of [0, 9, "9"]) {
  test(`${coins}金币不发送抽奖请求`, async () => {
    const env = setup({ coins });
    await env.run();
    assert.equal(env.calls.length, 1);
    assert.match(env.statuses.at(-1), /金币不足10/);
  });
}

for (const coins of [null, undefined, "1.2万", -1, 10.5, "", Number.MAX_SAFE_INTEGER + 1]) {
  test(`无效金币余额 ${String(coins)} 停止`, async () => {
    const env = setup({ info: () => response({ error: 0, data: { myCoin: coins } }) });
    await env.run();
    assert.equal(env.calls.length, 1);
    assert.match(env.statuses.at(-1), /未能读取有效金币余额/);
  });
}

test("重复点击只启动一条队列，下一次点击重新读取余额", async () => {
  let release;
  const env = setup({ coins: 10, lottery: () => new Promise(resolve => { release = resolve; }) });
  const first = env.run();
  await env.run();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  release(response({ error: "0", data: {} }));
  await first;
  assert.equal(env.calls.length, 3);
  env.context.fetch = async () => response({ error: 0, data: { myCoin: 0 } });
  await env.run();
  assert.match(env.statuses.at(-1), /金币不足10/);
});

test("运行中停止等待当前批次结束，不继续后续请求", async () => {
  let release;
  const env = setup({ lottery: () => new Promise(resolve => { release = resolve; }) });
  const run = env.run();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  env.context.anchorStarLottery.stop = true;
  release(response({ error: 0, data: { prizeList: [{ prizeDesc: "星光棒", prizeNum: 66 }] } }));
  await run;
  assert.equal(env.calls.length, 2);
  assert.match(env.statuses.at(-1), /已停止：完成 10 次/);
  assert.match(env.statuses.at(-1), /获得星光棒 66 个/);
});

test("读取余额时停止，不发送POST", async () => {
  let release;
  const env = setup({ info: () => new Promise(resolve => { release = resolve; }) });
  const run = env.run();
  env.context.anchorStarLottery.stop = true;
  release(response({ error: 0, data: { myCoin: 100 } }));
  await run;
  assert.equal(env.calls.length, 1);
  assert.match(env.statuses.at(-1), /已停止/);
});

for (const [name, lottery] of [
  ["业务失败", () => response({ error: 12022, message: "余额不足" })],
  ["未登录", () => response({ error: 1, message: "请先登录" })],
  ["HTTP失败", () => response({}, 503)],
  ["网络失败", () => { throw new Error("网络中断"); }],
  ["超时", () => { const error = new Error(); error.name = "AbortError"; throw error; }],
  ["非JSON响应", () => ({ ok: true, json: () => { throw new Error("Invalid JSON"); } })],
  ["缺少成功标记", () => response({ data: {} })],
  ["空成功标记", () => response({ error: null })]
]) {
  test(`${name}后停止，不报完成、不重试`, async () => {
    const env = setup({ lottery });
    await env.run();
    await env.run();
    assert.equal(env.calls.length, 2);
    assert.equal(env.context.anchorStarLottery.needsReload, true);
    assert.match(env.statuses.at(-1), /已确认完成 0 次/);
    assert.doesNotMatch(env.statuses.at(-1), /抽奖完毕/);
    assert.deepEqual(env.busy, [true, false]);
  });
}

test("后续批次失败仅累计已确认成功的次数", async () => {
  let count = 0;
  const env = setup({ lottery: () => response(++count === 1 ? { error: 0 } : { error: 1, message: "失败" }) });
  await env.run();
  assert.equal(env.calls.length, 4);
  assert.match(env.statuses.at(-1), /已确认完成 10 次/);
});

test("房间上下文优先查询参数，其次斗鱼来源页，最后保留原脚本默认值", () => {
  assert.equal(setup().context.AnchorStarLottery_roomId(), "123");
  assert.equal(setup({ href: "https://www.douyu.com/pages/new-anchor-support/", referrer: "https://www.douyu.com/beta/456" }).context.AnchorStarLottery_roomId(), "456");
  assert.equal(setup({ href: "https://www.douyu.com/pages/new-anchor-support/?rid=bad", referrer: "https://evil.example/789" }).context.AnchorStarLottery_roomId(), "4042402");
});

test("只有活动页进入新路由，直播间保持原路由", () => {
  const calls = [];
  const context = vm.createContext({ URL, initPkg_AnchorStarLottery: () => calls.push("lottery") });
  vm.runInContext(fs.readFileSync(path.join(root, "src/routers/router.js"), "utf8"), context);
  context.initRouter_DouyuRoom_Main = () => calls.push("room");
  context.initRouter("https://www.douyu.com/pages/new-anchor-support/?rid=123");
  context.initRouter("https://www.douyu.com/123");
  context.initRouter("https://www.douyu.com/123?next=/pages/new-anchor-support/");
  assert.deepEqual(calls, ["lottery", "room", "room"]);
  assert.match(fs.readFileSync(path.join(root, "src/main.js"), "utf8"), /@match\s+\*:\/\/\*\.douyu\.com\/pages\/new-anchor-support\/\*/);
});

function mockDom() {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.innerHTML = ""; }
    appendChild(child) {
      if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
      child.parent = this;
      this.children.push(child);
      return child;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    insertBefore(child, reference) {
      this.appendChild(child);
      if (reference) {
        this.children.pop();
        this.children.splice(this.children.indexOf(reference), 0, child);
      }
    }
    contains(child) { return this.children.includes(child); }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
  }
  const observers = [], events = {};
  const document = {
    cookie: "", referrer: "", head: new Element("head"), body: new Element("body"), balance: null,
    createElement: tag => new Element(tag),
    getElementsByTagName: () => [new Element("html")],
    querySelector(selector) { return selector.includes("balance--") ? this.balance : null; }
  };
  const window = { location: { href: "https://www.douyu.com/pages/new-anchor-support/" }, addEventListener: (name, callback) => { events[name] = callback; } };
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
  }
  return { document, window, MutationObserver, observers, events, Element };
}

test("异步挂载、幂等初始化、重建后保留控件及停止状态", async () => {
  const env = setup();
  const dom = mockDom();
  Object.assign(env.context, dom);
  vm.runInContext(fs.readFileSync(path.join(root, "src/packages/ActivityHub/ActivityHub.js"), "utf8"), env.context);
  env.context.initPkg_AnchorStarLottery();
  env.context.initPkg_AnchorStarLottery();
  assert.equal(dom.document.head.children.length, 1);
  assert.equal(dom.observers.length, 1);
  assert.equal(env.calls.length, 0, "初始化不得发送请求");
  dom.document.balance = new dom.Element("div");
  dom.observers[0].callback();
  dom.observers[0].callback();
  assert.equal(dom.document.balance.children.length, 1);
  const controls = dom.document.balance.children[0];
  const [start, stop] = controls.children;
  const status = dom.document.body.children.find(child => child.id === "ex-anchor-star-lottery-status");
  assert.ok(status, "提示应挂载到 body，脱离余额区域层叠上下文");
  assert.equal(controls.contains(status), false);
  assert.equal(stop.hidden, true);
  let release;
  env.context.fetch = () => new Promise(resolve => { release = resolve; });
  const run = start.listeners.click();
  assert.equal(start.disabled, true);
  assert.equal(stop.hidden, false);
  dom.document.balance = new dom.Element("div");
  dom.observers[0].callback();
  assert.equal(dom.document.balance.children[0], controls);
  stop.listeners.click();
  release(response({ error: 0, data: { myCoin: 100 } }));
  await run;
  assert.match(status.textContent, /已停止：完成 0 次/);
  assert.equal(start.disabled, false);
  assert.equal(stop.hidden, true);
  dom.events.pagehide();
  assert.equal(dom.observers[0].connected, false);
  dom.events.pageshow({ persisted: true });
  assert.equal(dom.observers[0].connected, true);
});

test("源码完整拼接后能在活动页启动，且不会初始化直播间或发送请求", async () => {
  const dom = mockDom();
  let requests = 0;
  const context = vm.createContext({
    ...dom, URL, URLSearchParams, AbortController, Blob, setTimeout, clearTimeout,
    fetch: () => { requests++; throw new Error("不应发送请求"); },
    GM_getValue: (_key, fallback) => fallback,
    console, navigator: { userAgent: "test" }, self: dom.window,
    localStorage: { getItem: () => null }
  });
  function files(dir) {
    return fs.readdirSync(dir).flatMap(name => {
      const filename = path.join(dir, name);
      return fs.statSync(filename).isDirectory() ? files(filename) : filename.endsWith(".js") && name !== "main.js" ? [filename] : [];
    });
  }
  const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
  const combined = files(path.join(root, "src")).map(file => fs.readFileSync(file, "utf8")).join("\n");
  await vm.runInContext(main.replace("// 编译器标记 勿删", () => combined), context);
  assert.equal(requests, 0);
  assert.equal(dom.observers.length, 1);
  dom.document.balance = new dom.Element("div");
  dom.observers[0].callback();
  assert.equal(dom.document.balance.children[0].id, "ex-anchor-star-lottery");
});


test("跨批次累加星光棒，排除金币和其他奖品，每次启动重新计数", async () => {
  const env = setup({ coins: 110, lottery: () => response({ error: 0, data: { prizeList: [
    { prizeDesc: "星光棒", prizeNum: 20 },
    { prizeDesc: "星光棒", prizeNum: "10" },
    { prizeDesc: "金币", prizeNum: 5 },
    { prizeDesc: "鉴星官勋章", prizeNum: 1 }
  ] } }) });
  await env.run();
  assert.match(env.statuses.at(-1), /抽奖完毕.*获得星光棒 60 个/);
  env.refill(110);
  await env.run();
  assert.match(env.statuses.at(-1), /获得星光棒 60 个/);
});

test("后续请求失败保留已确认星光棒数量", async () => {
  let batch = 0;
  const env = setup({ lottery: () => {
    if (++batch > 1) throw new Error("网络中断，当前批次结果未确认");
    return response({ error: 0, data: { prizeList: [{ prizeDesc: "星光棒", prizeNum: 500 }] } });
  } });
  await env.run();
  assert.match(env.statuses.at(-1), /已确认完成 10 次，获得星光棒 500 个/);
});

test("完整奖励中没有星光棒时显示零，缺失或异常奖励标注统计不完整", async () => {
  const env = setup({ coins: 10, lottery: () => response({ error: 0, data: { prizeList: [{ prizeDesc: "金币", prizeNum: 5 }] } }) });
  await env.run();
  assert.match(env.statuses.at(-1), /获得星光棒 0 个/);
  assert.doesNotMatch(env.statuses.at(-1), /未能读取/);
  for (const data of [undefined, {}, { prizeList: [] }, { prizeList: [null] },
    { prizeList: [{ prizeDesc: "星光棒", prizeNum: "bad" }] },
    { prizeList: [{ prizeDesc: "星光棒", prizeNum: -1 }] },
    { prizeList: [{ prizeDesc: "星光棒", prizeNum: 0.5 }] },
    { prizeList: [{ prizeDesc: "星光棒", prizeNum: 10 }, {}] }
  ]) {
    const env = setup({ coins: 10, lottery: () => response({ error: 0, data }) });
    await env.run();
    assert.match(env.statuses.at(-1), /完成 1 次/);
    assert.match(env.statuses.at(-1), /部分奖励未能读取/);
  }
});

test("返还金币继续抽：1000金币加50返还可抽105次，每批先核对余额", async () => {
  let balance = 1000, batches = 0;
  const env = setup({
    info: () => response({ error: 0, data: { myCoin: balance } }),
    lottery: (_url, options) => {
      balance -= Number(new URLSearchParams(options.body).get('num')) * 10;
      if (++batches === 1) balance += 50;
      return response({ error: 0, data: { prizeList: [{ prizeDesc: '星光棒', prizeNum: 1 }] } });
    }
  });
  await env.run();
  const posts = env.calls.filter(call => call.options.method === 'POST');
  assert.equal(posts.reduce((sum, call) => sum + Number(new URLSearchParams(call.options.body).get('num')), 0), 105);
  assert.equal(env.calls.length, posts.length * 2 + 1);
  assert.equal(balance, 0);
  assert.match(env.statuses.at(-1), /完成 105 次.*剩余 0 金币/);
});

test("中奖后余额查询失败保留已确认结果并停止，不猜余额继续抽", async () => {
  let reads = 0;
  const env = setup({ info: () => ++reads === 1 ? response({ error: 0, data: { myCoin: 100 } }) : response({ error: 9, msg: '余额暂不可用' }) });
  await env.run(); await env.run();
  assert.equal(env.calls.filter(call => call.options.method === 'POST').length, 1);
  assert.match(env.statuses.at(-1), /已确认完成 10 次.*余额暂不可用/);
});

test("领取返还后读取余额期间停止，不再提交下一轮", async () => {
  let reads = 0, release;
  const env = setup({ info: () => ++reads === 1 ? response({ error: 0, data: { myCoin: 100 } }) : new Promise(resolve => { release = resolve; }) });
  const run = env.run();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  env.context.anchorStarLottery.stop = true;
  release(response({ error: 0, data: { myCoin: 50 } }));
  await run;
  assert.equal(env.calls.filter(call => call.options.method === 'POST').length, 1);
  assert.match(env.statuses.at(-1), /已停止：完成 10 次.*剩余 50 金币/);
});
