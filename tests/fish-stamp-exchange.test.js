const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/packages/FishShop/FishShop.js', 'utf8') + '\n' + fs.readFileSync('src/packages/FishShop/FishStampExchange.js', 'utf8');
const stamp = (index, cost, num) => ({ awardIndex: index, exchangeWei: cost, num, awardId: 3410, awardName: '陪伴印章' });
const tiers = [stamp('small', 50, 10), stamp('medium', 150, 30), stamp('large', 250, 50)];
const config = { marketingAwardList: [{ awardType: 5, awardList: tiers }] };
const response = (data, error = 0) => ({ ok: true, json: async () => ({ error, data }) });

function setup({ balance = 1813, quotas = { small: 2, medium: 2, large: 2 }, configuration = config, panel, post, wait, uid = '99', extra = [] } = {}) {
  const calls = [], statuses = [], busy = [], publicCalls = [], delays = [];
  let account = uid, now = 1793534400000, points = balance, counts = { ...quotas }, reads = 0;
  const date = class extends Date { static now() { return now; } };
  const context = vm.createContext({ URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Date: date,
    document: { hidden: false }, rid: '3168536',
    getCookieValue: () => account, getCCN: () => 'token&中文',
    GM_xmlhttpRequest(options) { publicCalls.push(options); options.onload({ status: 200, responseText: `DYConfigCallback(${JSON.stringify({ data: configuration })});` }); },
    sleep: async ms => { delays.push(ms); if (wait) await wait(); },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (options.method !== 'POST') {
        reads++;
        const data = { num: points, convertList: [...tiers.map(t => ({ index: t.awardIndex, type: 1, consumeNum: t.exchangeWei,
          status: counts[t.awardIndex] === 0 ? 2 : points < t.exchangeWei ? 0 : 1, circle: 1,
          awardInfo: { awardName: '陪伴印章', awardId: 3410, awardNumShow: t.num }
        })), ...extra] };
        return panel ? panel(data, reads) : response(data);
      }
      if (post) return post(url, options);
      const tier = tiers.find(t => t.awardIndex === new URLSearchParams(options.body).get('index'));
      points -= tier.exchangeWei; counts[tier.awardIndex]--;
      return response({ awardInfo: { awardName: '陪伴印章' } });
    }
  });
  vm.runInContext(source, context);
  const view = { status: text => statuses.push(text), busy: value => busy.push(value) };
  return { context, calls, statuses, busy, publicCalls, delays, view,
    setAccount: value => { account = value; }, tick: (ms = 3000) => { now += ms; }, setPoints: value => { points = value; },
    run: (room = '3168536') => context.FishStampExchange_run(view, room), posts: () => calls.filter(c => c.options.method === 'POST') };
}
const order = env => env.posts().map(call => new URLSearchParams(call.options.body).get('index'));

test('限购逐档生效：贵档买完再买便宜档，保留无法兑换的余额', async () => {
  const env = setup(); await env.run();
  assert.deepEqual(order(env), ['large', 'large', 'medium', 'medium', 'small', 'small']);
  assert.match(env.statuses.at(-1), /印章兑换结束.*兑换 6 次、陪伴印章 180 个，使用 900 积分；剩余 913 积分.*限购/);
  assert.equal(env.calls.length, 13); assert.deepEqual(env.busy, [true, false]);
  assert.ok(env.delays.every(ms => ms >= 500));
  assert.equal(env.publicCalls.length, 1); assert.equal(env.publicCalls[0].anonymous, true);
  for (const call of env.calls) {
    const url = new URL(call.url);
    assert.equal(url.origin, 'https://www.douyu.com'); assert.equal(call.options.credentials, 'include'); assert.equal(call.options.cache, 'no-store');
    if (call.options.method === 'POST') {
      assert.equal(url.pathname, '/japi/revenuenc/web/actfans/convert/convertOpt');
      const params = new URLSearchParams(call.options.body);
      assert.deepEqual([...params.keys()].sort(), ['ctn', 'index', 'rid']);
      assert.equal(params.get('rid'), '3168536'); assert.equal(params.get('ctn'), 'token&中文');
    } else {
      assert.equal(url.pathname, '/japi/revenuenc/web/actfans/convert/convertPanel'); assert.equal(url.searchParams.get('rid'), '3168536');
    }
  }
});

test('贵档余额不足即退到中小档，余款不足50不花', async () => {
  const env = setup({ balance: 413 }); await env.run();
  assert.deepEqual(order(env), ['large', 'medium']); assert.match(env.statuses.at(-1), /80 个.*400 积分；剩余 13 积分/);
});
test('全站倒计时或贵档已限购时买下一可用档；不兑换其他商品或付费商品', async () => {
  const env = setup({ balance: 500, panel(data) {
    data.convertList.find(t => t.index === 'large').status = 3;
    return response(data);
  }, extra: [
    { index: 'paid', type: 2, status: 1, consumeNum: 1, awardInfo: { awardName: '陪伴印章', awardId: 3410, awardNumShow: 500 } },
    { index: 'other', type: 1, status: 1, consumeNum: 1, awardInfo: { awardName: '鱼丸', awardId: 0, awardNumShow: 1000 } }
  ] });
  await env.run(); assert.deepEqual(order(env), ['medium', 'medium', 'small', 'small']);
});
test('官方配置更换档位index仍按配置核对，不写死商品编号', () => {
  const env = setup();
  const catalog = env.context.FishStampExchange_catalog({ marketingAwardList: [{ awardType: '5', awardList: [stamp('seasonal_2026', '250', '50')] }] });
  const panel = env.context.FishStampExchange_panel({ num: '300', convertList: [{ index: 'seasonal_2026', type: '1', status: '1', consumeNum: '250', awardInfo: { awardName: '陪伴印章', awardNumShow: '50' } }] }, catalog);
  assert.equal(panel.items[0].index, 'seasonal_2026'); assert.equal(panel.balance, 300);
});
for (const balance of [0, 49, '0']) test(`积分 ${JSON.stringify(balance)} 不提交`, async () => {
  const env = setup({ balance }); await env.run(); assert.equal(env.posts().length, 0); assert.match(env.statuses.at(-1), /印章兑换结束/);
});
for (const value of [null, '', undefined, true, -1, 0.1, '1万', Number.MAX_SAFE_INTEGER + 1]) test(`异常积分 ${String(value)} 不提交`, async () => {
  const env = setup({ panel: data => response({ ...data, num: value }) }); await env.run(); assert.equal(env.posts().length, 0); assert.match(env.statuses.at(-1), /积分异常/);
});
for (const [label, change] of [
  ['价格变化', row => { row.consumeNum++; }], ['数量变化', row => { row.awardInfo.awardNumShow++; }],
  ['同ID异名', row => { row.awardInfo.awardName = '鱼丸'; }], ['同名异ID', row => { row.awardInfo.awardId = 123; }],
  ['付费兑换', row => { row.type = 2; }], ['未知类型', row => { row.type = 3; }], ['未知限购状态', row => { row.status = 4; }]
]) test(`${label}不按猜测执行`, async () => {
  const env = setup({ panel(data) { change(data.convertList[0]); return response(data); } });
  await env.run(); assert.equal(env.posts().length, 0); assert.match(env.statuses.at(-1), /已停止/);
});
test('重复index和缺失商品列表停止；不把空列表当作有商品', async () => {
  for (const panel of [data => response({ ...data, convertList: null }), data => response({ ...data, convertList: [...data.convertList, data.convertList[0]] })]) {
    const env = setup({ panel }); await env.run(); assert.equal(env.posts().length, 0); assert.match(env.statuses.at(-1), /异常|重复/);
  }
  const empty = setup({ panel: data => response({ ...data, convertList: [] }) }); await empty.run(); assert.equal(empty.posts().length, 0);
});
test('配置缺失或奖励身份不匹配不访问商城写接口', async () => {
  for (const configuration of [{}, { marketingAwardList: [{ awardType: 6, awardList: tiers }] }, { marketingAwardList: [{ awardType: 5, awardList: [{ ...tiers[0], awardId: 1 }] }] }]) {
    const env = setup({ configuration }); await env.run(); assert.equal(env.posts().length, 0); assert.match(env.statuses.at(-1), /配置/);
  }
});
test('启动中的重复调用和结束后快速双击不会再兑换', async () => {
  let release; const env = setup({ balance: 250, post: () => new Promise(resolve => { release = resolve; }) });
  const task = env.run(); await env.run();
  while (!release) await new Promise(setImmediate);
  env.context.fishStampExchange.stop = true;
  release(response({})); await task; await env.run();
  assert.deepEqual(order(env), ['large']); assert.match(env.statuses.at(-1), /已停止.*兑换 1 次.*50 个.*剩余积分待核对/);
});
test('GET期间停止、切换房间、账号、跨天、隐藏页面都不提交', async () => {
  for (const change of [
    e => { e.context.fishStampExchange.stop = true; }, e => { e.context.rid = '2'; }, e => e.setAccount('1'),
    e => e.tick(86400000), e => { e.context.document.hidden = true; }
  ]) {
    let env; env = setup({ panel(data) { change(env); return response(data); } });
    await env.run(); assert.equal(env.posts().length, 0); assert.match(env.statuses.at(-1), /已停止/);
  }
});
test('两次兑换间停止不再查询或兑换，下次手动开始重读余额', async () => {
  let env; env = setup({ wait: () => { env.context.fishStampExchange.stop = true; } });
  await env.run(); assert.equal(env.posts().length, 1); assert.equal(env.calls.length, 2);
  env.tick(); await env.run(); assert.equal(env.posts().length, 2); assert.equal(env.publicCalls.length, 2);
});
for (const [label, post] of [
  ['服务器错误', () => response({}, 1)], ['缺少成功标记', () => ({ ok: true, json: async () => ({ data: {} }) })],
  ['HTTP错误', () => ({ ok: false, status: 500 })], ['JSON错误', () => ({ ok: true, json: async () => { throw new Error('JSON'); } })],
  ['网络错误', () => { throw new Error('Network'); }], ['超时', () => { const error = new Error(); error.name = 'AbortError'; throw error; }]
]) test(`${label}不重试且不计成功，锁定直到刷新`, async () => {
  const env = setup({ post }); await env.run(); env.tick(); await env.run();
  assert.equal(env.posts().length, 1); assert.equal(env.context.fishStampExchange.needsReload, true);
  assert.match(env.statuses.at(-1), /兑换 0 次.*最后一笔结果未确认.*未重试/);
});
test('成功后余额未下降、降幅错误或新增积分均停止，不重复消费', async () => {
  for (const delta of [0, -1, 100]) {
    const env = setup({ panel: (data, reads) => response({ ...data, num: reads > 1 ? 1813 + delta : data.num }) });
    await env.run(); assert.deepEqual(order(env), ['large']); assert.equal(env.context.fishStampExchange.needsReload, true);
    assert.match(env.statuses.at(-1), /兑换 1 次.*50 个.*积分变化与兑换价格不一致/);
  }
});
test('兑换成功后刷新失败保留已确认数量并停止', async () => {
  const env = setup({ panel: (data, reads) => response(reads > 1 ? {} : data) }); await env.run();
  assert.deepEqual(order(env), ['large']); assert.match(env.statuses.at(-1), /兑换 1 次.*50 个.*剩余积分待核对/);
});
test('尚未登录、错误房间、初始页面隐藏不访问接口', async () => {
  const loggedOut = setup({ uid: '' }); await loggedOut.run(); assert.equal(loggedOut.calls.length, 0); assert.equal(loggedOut.publicCalls.length, 0);
  const room = setup(); await room.run('../123'); assert.equal(room.calls.length, 0); assert.equal(room.publicCalls.length, 0);
  const hidden = setup(); hidden.context.document.hidden = true; await hidden.run(); assert.equal(hidden.calls.length, 0); assert.equal(hidden.publicCalls.length, 0);
});
