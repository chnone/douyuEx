const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/packages/FishRoleLottery/FishRoleLottery.js'), 'utf8');
const response = (data, error = 0) => ({ ok: true, json: async () => ({ error, data }) });
function setup({ score = 9, refunds = [], read, draw, wait, uid = '123' } = {}) {
  const calls = [], statuses = [], busy = [], delays = [];
  let balance = score, index = 0, account = uid;
  const context = vm.createContext({
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    getCCN: () => 'token&中文', getCookieValue: () => account,
    sleep: async ms => { delays.push(ms); if (wait) await wait(); },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (options.method !== 'POST') return read ? read() : response({ lotteryInfo: { score: balance, batch100Lock: 0 } });
      if (draw) return draw(url, options);
      const refund = refunds[index++] || 0;
      balance = Number(balance) - Number(new URLSearchParams(options.body).get('batch')) + refund;
      return response({ cardList: [], awardList: [], resolveInfo: { num: refund ? 1 : 0, totalScore: refund } });
    }
  });
  vm.runInContext(source, context);
  const view = { status: value => statuses.push(value), busy: value => busy.push(value) };
  return { context, calls, statuses, busy, delays, view, setAccount: value => { account = value; }, run: (room = '3168536') => context.FishRoleLottery_run(view, room), posts: () => calls.filter(c => c.options.method === 'POST') };
}
const batches = env => env.posts().map(c => Number(new URLSearchParams(c.options.body).get('batch')));

test('9 次机会首抽返还 3 次，最终召唤 12 次；按最新余额切换十连', async () => {
  const env = setup({ refunds: [3] });
  await env.run();
  assert.deepEqual(batches(env), [1, 10, 1]);
  assert.match(env.statuses.at(-1), /召唤 12 次.*重复形象 1 张、返还 3 次.*剩余 0 次/);
  assert.equal(env.calls.length, 7);
  for (const delay of env.delays) assert.ok(delay >= 500 && delay <= 2000);
  for (const call of env.calls) {
    const url = new URL(call.url);
    assert.equal(url.origin, 'https://www.douyu.com');
    assert.equal(call.options.credentials, 'include');
    assert.equal(call.options.cache, 'no-store');
    if (call.options.method === 'POST') {
      assert.equal(url.pathname, '/japi/revenuenc/web/actfans/userLottery/lottery');
      const params = new URLSearchParams(call.options.body);
      assert.deepEqual([...params.keys()].sort(), ['batch', 'ctn', 'rid']);
      assert.equal(params.get('rid'), '3168536');
      assert.equal(params.get('ctn'), 'token&中文');
    } else {
      assert.equal(url.pathname, '/japi/revenuenc/web/actfans/userLottery/panelInfo');
      assert.equal(url.searchParams.get('rid'), '3168536');
    }
  }
});

test('返还可连续发生，剩余机会不下降时仍按服务端余额继续', async () => {
  const env = setup({ score: 1, refunds: [1, 1, 2] });
  await env.run();
  assert.deepEqual(batches(env), [1, 1, 1, 1, 1]);
  assert.match(env.statuses.at(-1), /召唤 5 次.*返还 4 次/);
});

test('百连未解锁时仅十连；超过 100 次也不会使用百连', async () => {
  const env = setup({ score: 105 }); await env.run();
  assert.deepEqual(batches(env), [...Array(10).fill(10), ...Array(5).fill(1)]);
});
for (const score of [0, '0']) test(`余额 ${JSON.stringify(score)} 不发起召唤`, async () => {
  const env = setup({ score }); await env.run();
  assert.equal(env.posts().length, 0); assert.match(env.statuses.at(-1), /剩余 0 次/);
});
for (const score of [null, undefined, '', -1, 1.5, '1万', true, Number.MAX_SAFE_INTEGER + 1]) test(`异常余额 ${String(score)} 停止`, async () => {
  const env = setup({ read: () => response({ lotteryInfo: { score } }) }); await env.run();
  assert.equal(env.posts().length, 0); assert.match(env.statuses.at(-1), /数据异常/);
});

test('只读 GET 停止后不会 POST', async () => {
  let release; const env = setup({ read: () => new Promise(r => { release = r; }) });
  const task = env.run(); env.context.fishRoleLottery.stop = true;
  release(response({ lotteryInfo: { score: 9 } })); await task;
  assert.equal(env.posts().length, 0); assert.match(env.statuses.at(-1), /已停止/);
});
test('在途召唤停止仍统计结果，不提交下一轮；重复调用不启动第二条队列', async () => {
  let release; const env = setup({ score: 10, draw: () => new Promise(r => { release = r; }) });
  const task = env.run(); await env.run();
  while (!release) await new Promise(setImmediate);
  env.context.fishRoleLottery.stop = true;
  release(response({ cardList: [], resolveInfo: { num: 2, totalScore: 3 } })); await task;
  assert.deepEqual(batches(env), [10]); assert.equal(env.calls.length, 2);
  assert.match(env.statuses.at(-1), /已停止.*召唤 10 次.*返还 3 次.*剩余机会请重新打开/);
  assert.deepEqual(env.busy, [true, false]);
});
test('等待间隔停止后不再请求；下次主动运行重新读余额', async () => {
  let env; env = setup({ score: 1, wait: () => { env.context.fishRoleLottery.stop = true; } });
  await env.run(); await env.run();
  assert.equal(env.posts().length, 1); assert.equal(env.calls.length, 3);
});
test('核对余额期间切换账号即停止', async () => {
  let env; env = setup({ read: () => { env.setAccount('456'); return response({ lotteryInfo: { score: 9 } }); } });
  await env.run(); assert.equal(env.posts().length, 0); assert.match(env.statuses.at(-1), /账号已切换/);
});
for (const [label, draw] of [
  ['余额不足', () => ({ ok: true, json: async () => ({ error: 5, msg: '机会不足' }) })],
  ['HTTP 错误', () => ({ ok: false, status: 503 })],
  ['网络错误', () => { throw new Error('网络错误'); }],
  ['超时', () => { const e = new Error(); e.name = 'AbortError'; throw e; }],
  ['无成功标记', () => ({ ok: true, json: async () => ({ data: {} }) })],
  ['JSON 错误', () => ({ ok: true, json: async () => { throw new Error('JSON'); } })]
]) test(`${label}后不重试，不将结果未知的请求记为成功`, async () => {
  const env = setup({ draw }); await env.run(); await env.run();
  assert.equal(env.posts().length, 1); assert.equal(env.context.fishRoleLottery.needsReload, true);
  assert.match(env.statuses.at(-1), /已确认召唤 0 次.*未重试/);
});
test('召唤成功但刷新余额失败，保留已确认次数并停止', async () => {
  let reads = 0; const env = setup({ read: () => ++reads === 1 ? response({ lotteryInfo: { score: 10 } }) : response({}) });
  await env.run(); assert.deepEqual(batches(env), [10]); assert.match(env.statuses.at(-1), /已确认召唤 10 次.*未重试/);
});
test('返还数据不完整时不把未知数据报作零，仍以权威余额决定停止', async () => {
  let reads = 0; const env = setup({ read: () => response({ lotteryInfo: { score: reads++ ? 0 : 1 } }), draw: () => response({}) });
  await env.run(); assert.match(env.statuses.at(-1), /部分返还数据未能读取.*剩余 0 次/);
});
test('未登录或无效房间不访问接口', async () => {
  const env = setup({ uid: '' }); await env.run(); assert.equal(env.calls.length, 0);
  const second = setup(); await second.run('bad'); assert.equal(second.calls.length, 0);
});

test('官方无回收响应按零记录；畸形返还数据标记未知', () => {
  const env = setup();
  assert.equal(env.context.FishRoleLottery_refunds({ cardList: [] }).chances, 0);
  for (const resolveInfo of [null, [], { num: null }, { totalScore: -1 }, { totalScore: 'bad' }]) {
    assert.equal(env.context.FishRoleLottery_refunds({ resolveInfo }), null);
  }
});
test('成功标记为字符串零也支持；运行结束按钮恢复', async () => {
  let reads = 0; const env = setup({
    read: () => response({ lotteryInfo: { score: reads++ ? '0' : '1' } }, '0'),
    draw: () => response({ cardList: [], resolveInfo: { num: '0', totalScore: '0' } }, '0')
  });
  await env.run(); assert.equal(env.posts().length, 1);
  assert.match(env.statuses.at(-1), /鱼娘召唤结束/); assert.deepEqual(env.busy, [true, false]);
});
