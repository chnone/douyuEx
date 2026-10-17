const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/packages/FishWeeklyRewards/FishWeeklyRewards.js'), 'utf8');
function setup({ count = 3, onPause, onClaim, fail = false } = {}) {
  const math = Object.create(Math);
  math.random = () => 0;
  const context = vm.createContext({ Math: math });
  vm.runInContext(source, context);
  const pending = Array.from({ length: count }, (_, id) => ({ id, claimed: false }));
  const statuses = [], claimed = [], opened = [];
  let popup = null, active = true;
  const view = {
    active: () => active,
    cards: () => pending.filter(card => !card.claimed),
    popup: () => popup,
    status: text => statuses.push(text), busy: () => {},
    pause: async ms => onPause?.(ms, env),
    wait: async (predicate, guard) => {
      guard();
      const result = predicate();
      if (!result) throw new Error('未收到页面成功确认');
      return result;
    },
    open(card) { opened.push(card.id); popup = card; },
    claimButton: pop => pop,
    rewardName: pop => `奖励${pop.id}X1`,
    claim(card) { claimed.push(card.id); if (!fail) card.claimed = true; onClaim?.(env); },
    claimed: pop => pop.claimed,
    close: () => { popup = null; }
  };
  const env = { context, statuses, claimed, opened, view, stop: () => { context.fishWeeklyRewards.stop = true; }, leave: () => { active = false; }, run: () => context.FishWeeklyRewards_run(view) };
  return env;
}
test('逐张打开、领取、确认，汇总本轮奖励', async () => {
  const env = setup();
  await env.run();
  assert.deepEqual(env.claimed, [0, 1, 2]);
  assert.match(env.statuses.at(-1), /领取结束：已确认领取 3 张；奖励0X1、奖励1X1、奖励2X1/);
});
test('没有可领取卡片时不操作', async () => {
  const env = setup({ count: 0 }); await env.run();
  assert.equal(env.claimed.length, 0);
  assert.match(env.statuses.at(-1), /暂无可领取/);
});
test('领取前停止不会点击领取，领取提交后停止仍统计当前成功结果', async () => {
  for (const stopAt of [500]) {
    const env = setup({ onPause: (ms, env) => { if (ms === stopAt) env.stop(); } });
    await env.run(); assert.equal(env.claimed.length, 0);
    assert.match(env.statuses.at(-1), /已停止：已确认领取 0 张/);
  }
  const env = setup({ onClaim: env => env.stop() }); await env.run();
  assert.deepEqual(env.claimed, [0]);
  assert.match(env.statuses.at(-1), /已停止：已确认领取 1 张/);
});
test('未收到成功状态就停止并禁止再次启动，不连续点击', async () => {
  const env = setup({ fail: true }); await env.run(); await env.run();
  assert.deepEqual(env.claimed, [0]);
  assert.match(env.statuses.at(-1), /已确认领取 0 张.*未收到页面成功确认/);
});
test('切换页面或隐藏页面后不再领取', async () => {
  const env = setup({ onPause: (_ms, env) => env.leave() }); await env.run();
  assert.equal(env.claimed.length, 0);
  assert.match(env.statuses.at(-1), /已离开我的周图鉴/);
});
test('重复启动不会并行领取', async () => {
  let release;
  const env = setup({ count: 1, onPause: ms => ms === 500 ? new Promise(resolve => { release = resolve; }) : undefined });
  const run = env.run(); await env.run(); release(); await run;
  assert.deepEqual(env.claimed, [0]);
});
test('卡片状态变化时不继续点击；已有弹窗不擅自领取', async () => {
  const env = setup(); env.view.popup = () => ({}); await env.run();
  assert.equal(env.claimed.length, 0);
  assert.match(env.statuses.at(-1), /请先关闭/);
  const changed = setup({ onPause: (_ms, env) => { env.view.cards = () => []; } });
  await changed.run(); assert.equal(changed.opened.length, 0);
});
test('钓鱼活动路由只加载领奖模块，其他站点和直播间不受影响', () => {
  const calls = [];
  const context = vm.createContext({ URL, initPkg_FishWeeklyRewards: () => calls.push('fish'), initPkg_AnchorStarLottery: () => calls.push('star') });
  vm.runInContext(fs.readFileSync(path.join(root, 'src/routers/router.js'), 'utf8'), context);
  context.initRouter_DouyuRoom_Main = () => calls.push('room');
  context.initRouter('https://www.douyu.com/pages/fish-act/acc?rid=123');
  context.initRouter('https://www.douyu.com/123?next=/pages/fish-act/');
  assert.deepEqual(calls, ['fish', 'room']);
});

test('左下角通知仅接受同源钓鱼 iframe，奖励名称按纯文本显示', () => {
  const messages = [], sourceWindow = {}, handlers = {};
  const context = vm.createContext({ URL,
    window: { location: { origin: 'https://www.douyu.com', href: 'https://www.douyu.com/123' }, addEventListener: (type, handler) => { handlers[type] = handler; } },
    document: { querySelectorAll: () => [{ contentWindow: sourceWindow, src: 'https://www.douyu.com/pages/fish-act/?rid=123' }] },
    showMessage: (...args) => messages.push(args)
  });
  vm.runInContext(source, context);
  context.initPkg_FishWeeklyRewards_NoticeBridge();
  const event = { origin: 'https://www.douyu.com', source: sourceWindow, data: { type: 'douyuex:fish-weekly-reward-notice', text: '<img src=x onerror=alert(1)>', level: 'success' } };
  handlers.message({ ...event, origin: 'https://evil.example' });
  handlers.message({ ...event, source: {} });
  assert.equal(messages.length, 0);
  handlers.message(event);
  assert.equal(messages.length, 1);
  assert.match(messages[0][0], /&lt;img/);
  assert.doesNotMatch(messages[0][0], /<img/);
});


test('领取步骤采用有下限的随机停顿，确认轮询不代替操作间隔', async () => {
  const delays = [];
  const env = setup({ count: 2, onPause: ms => delays.push(ms) });
  env.context.Math.random = () => 0.5;
  await env.run();
  assert.equal(env.claimed.length, 2);
  assert.equal(delays.length, 2);
  const bounds = [[500, 2000], [500, 2000]];
  delays.forEach((delay, index) => assert.ok(delay > bounds[index][0] && delay < bounds[index][1]));
});
