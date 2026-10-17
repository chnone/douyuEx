const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const base = path.join(__dirname, '../src/packages/FishWeeklyRewards');
const source = ['FishWeeklyRewards.js', 'FishWeeklyRewards_Direct.js'].map(file => fs.readFileSync(path.join(base, file), 'utf8')).join('\n');
const config = { data: { fishingConfig: { fishConfig: {
  fishList: [{ id: 12, userWeekAwardList: [{ awardType: 1, awardName: '鱼丸', num: 50 }] }, { id: 13, userWeekAwardList: [] }],
  achieve: { weekAwardAchieveList: [
    { accType: 1, achieveNum: 100, awardType: 1, awardName: '鱼丸', num: 500 },
    { accType: 2, achieveNum: 5, awardType: 1, awardName: '鱼丸', num: 1000 }
  ] }
} } } };
function setup({ cards, post, pause, configError = false } = {}) {
  cards ||= [{ accType: 1, count: 100, status: 1 }, { accType: 8, count: 1, fishId: 12, status: 1 }];
  const requests = [], statuses = [], waits = [], busy = [];
  let active = 0, maxActive = 0, configRequests = 0;
  const math = Object.create(Math); math.random = () => 0.5;
  const context = vm.createContext({ URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Math: math,
    getCCN: () => 'csrf&=中文',
    sleep: async ms => { waits.push(ms); await pause?.(env); },
    GM_xmlhttpRequest: options => {
      configRequests++;
      assert.equal(options.anonymous, true);
      if (configError) options.onerror();
      else options.onload({ status: 200, responseText: 'DYConfigCallback(' + JSON.stringify(config) + ');' });
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      maxActive = Math.max(maxActive, ++active);
      try {
        if (options.method === 'POST') {
          const params = new URLSearchParams(options.body);
          const result = await post?.(env, params);
          if (result) return result;
          cards.find(card => Number(card.accType) === Number(params.get('accType'))).status = 2;
          return { ok: true, json: async () => ({ error: 0 }) };
        }
        return { ok: true, json: async () => ({ error: 0, data: { accList: structuredClone(cards) } }) };
      } finally { active--; }
    }
  });
  vm.runInContext(source, context);
  const view = { status: text => statuses.push(text), busy: value => busy.push(value) };
  const env = { context, cards, requests, statuses, waits, busy, view,
    run: () => context.FishWeeklyRewards_runDirect(view, '3168536'),
    stop: () => { context.fishWeeklyRewards.stop = true; },
    posts: () => requests.filter(item => item.options.method === 'POST'), maxActive: () => maxActive,
    configRequests: () => configRequests };
  return env;
}

test('无需页面DOM，逐张领取我的周奖励；鱼类和成就参数正确，CSRF正确编码', async () => {
  const env = setup(); await env.run();
  assert.equal(env.posts().length, 2);
  assert.equal(env.maxActive(), 1);
  assert.deepEqual(env.waits, [1250]);
  for (const call of env.requests) {
    const params = call.options.method === 'POST' ? new URLSearchParams(call.options.body) : new URL(call.url).searchParams;
    assert.equal(params.get('rid'), '3168536');
    assert.equal(params.get('type'), '2');
    assert.equal(params.get('period'), '1');
    assert.equal(call.options.credentials, 'include');
    if (call.options.method === 'POST') assert.equal(params.get('ctn'), 'csrf&=中文');
  }
  assert.equal(new URLSearchParams(env.posts()[0].options.body).has('fishId'), false);
  assert.equal(new URLSearchParams(env.posts()[1].options.body).get('fishId'), '12');
  assert.match(env.statuses.at(-1), /领取结束：已确认领取 2 张；鱼丸×500、鱼丸×50/);
});

test('跳过未达成、已领取、不可领、无奖励卡片并去重', async () => {
  const env = setup({ cards: [
    { accType: 1, count: 100, status: 0 }, { accType: 2, count: 5, status: 2 },
    { accType: 8, count: 1, fishId: 12, status: 3 }, { accType: 8, count: 1, fishId: 13, status: 1 }
  ] });
  await env.run(); assert.equal(env.posts().length, 0);
  assert.match(env.statuses.at(-1), /暂无可领取/);
  const dup = setup({ cards: [{ accType: 1, count: 100, status: 1 }, { accType: 1, count: 100, status: 1 }] });
  await dup.run(); assert.equal(dup.posts().length, 1);
});

test('随机间隔期间停止，不提交下一张；下次手动点击重新读取', async () => {
  const env = setup({ pause: env => env.stop() }); await env.run();
  assert.equal(env.posts().length, 1);
  assert.match(env.statuses.at(-1), /已停止：已确认领取 1 张/);
  await env.run(); assert.equal(env.posts().length, 2);
  assert.equal(env.configRequests(), 2);
});

test('在途领取成功后停止仍统计结果，重复启动不产生并行任务', async () => {
  let release;
  const env = setup({ post: () => new Promise(resolve => { release = resolve; }) });
  const run = env.run();
  await env.run();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  env.stop(); release(); await run;
  assert.equal(env.posts().length, 1);
  assert.match(env.statuses.at(-1), /已停止：已确认领取 1 张/);
});

test('另一标签页已领取的卡片跳过，不追加本轮新获得的卡片', async () => {
  const env = setup({ pause: env => {
    env.cards[1].status = 2;
    env.cards.push({ accType: 2, count: 5, status: 1 });
  } });
  await env.run(); assert.equal(env.posts().length, 1);
  assert.match(env.statuses.at(-1), /跳过 1 张/);
});

for (const [name, result] of [
  ['业务错误', { ok: true, json: async () => ({ error: 9, msg: '操作频繁' }) }],
  ['缺失成功标记', { ok: true, json: async () => ({ data: {} }) }],
  ['HTTP错误', { ok: false, status: 500 }]
]) test(`${name}即停止，不自动重试`, async () => {
  const env = setup({ post: () => result }); await env.run(); await env.run();
  assert.equal(env.posts().length, 1);
  assert.equal(env.context.fishWeeklyRewards.needsReload, true);
  assert.match(env.statuses.at(-1), /已确认领取 0 张.*刷新核对/);
});

test('配置或卡片参数异常不提交领取，JSONP只解析数据，不执行代码', async () => {
  const failed = setup({ configError: true }); await failed.run();
  assert.equal(failed.posts().length, 0);
  const bad = setup({ cards: [{ accType: 1, count: null, status: 1 }] }); await bad.run();
  assert.equal(bad.posts().length, 0);
  assert.throws(() => bad.context.FishWeeklyRewards_parseConfig('DYConfigCallback({});doSomething();'), /JSON|Unexpected|配置/);
});
