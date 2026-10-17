const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/packages/GuardGift/GuardGift.js', 'utf8');
const baseGift = { id: 24478, name: '全力守护', donateStatus: 1, priceInfo: { price: 10, priceType: 'YUCHI' } };
function setup({ gift = baseGift, gifts, configError, response = { error: 0, msg: 'success' }, post, holdPrice = false, uid = '99' } = {}) {
  const requests = [], states = [], busy = [], configRequests = [];
  let priceOptions, currentUid = uid, now = 100000;
  const date = class extends Date { static now() { return now; } };
  const c = vm.createContext({ URLSearchParams, AbortController, setTimeout, clearTimeout, Date: date,
    getCookieValue: () => currentUid,
    GM_xmlhttpRequest(options) { configRequests.push(options); priceOptions = options; if (!holdPrice) deliver(); },
    fetch: async (url, options) => { requests.push({ url, options }); if (post) return post(); return { ok: true, json: async () => response }; }
  });
  function deliver() {
    if (configError) return priceOptions.onerror();
    priceOptions.onload({ status: 200, responseText: JSON.stringify({ error: 0, data: JSON.stringify({ giftList: gifts || [gift] }) }) });
  }
  vm.runInContext(source, c);
  const view = { status: text => states.push(text), busy: value => busy.push(value) };
  return { c, view, requests, states, busy, configRequests, deliver, setUid(value) { currentUid = value; }, tick() { now += 3000; } };
}
test('核对官方名称ID价格后，向指定当前房间付费赠送1个', async () => {
  const e = setup(); await e.c.GuardGift_run(e.view, '3168536');
  assert.equal(e.configRequests.length, 1); assert.equal(e.configRequests[0].anonymous, true);
  assert.match(e.configRequests[0].url, /rid=3168536/);
  assert.equal(e.requests.length, 1);
  const r = e.requests[0];
  assert.equal(r.url, 'https://www.douyu.com/japi/gift/donate/mainsite/v1');
  assert.equal(r.options.credentials, 'include');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(r.options.body)), { giftId: '24478', giftCount: '1', roomId: '3168536', bizExt: '{"yzxq":{}}' });
  assert.ok(e.states.at(-1).includes('赠送成功'));
  assert.ok(e.states.at(-1).includes('0.1 鱼翅'));
  assert.deepEqual(e.busy, [true, false]);
});
for (const [name, gift] of [
  ['超过1元上限', { ...baseGift, priceInfo: { price: 101, priceType: 'YUCHI' } }],
  ['未知币种', { ...baseGift, priceInfo: { price: 10, priceType: 'OTHER' } }],
  ['鱼丸币种', { ...baseGift, priceInfo: { price: 10, priceType: 'YUWAN' } }],
  ['空价格', { ...baseGift, priceInfo: { price: null, priceType: 'YUCHI' } }],
  ['小数价格', { ...baseGift, priceInfo: { price: 0.1, priceType: 'YUCHI' } }],
  ['同ID异名', { ...baseGift, name: '别的礼物' }],
  ['同名异ID', { ...baseGift, id: 123 }],
  ['禁止赠送', { ...baseGift, donateStatus: 0 }]
]) test(`${name}不发起付费请求`, async () => {
  const e = setup({ gift }); await e.c.GuardGift_run(e.view, '123');
  assert.equal(e.requests.length, 0); assert.match(e.states.at(-1), /未发起付费赠送/);
  assert.equal(e.c.guardGift.running, false);
});
test('恰好上限允许；每次手动操作重新核价', async () => {
  const e = setup({ gift: { ...baseGift, priceInfo: { price: '100', priceType: 'YUCHI' } } });
  await e.c.GuardGift_run(e.view, '123'); e.tick(); await e.c.GuardGift_run(e.view, '123');
  assert.equal(e.configRequests.length, 2); assert.equal(e.requests.length, 2);
});
test('运行中重复点击和成功后快速双击都不会多扣一次', async () => {
  const e = setup({ holdPrice: true }); const run = e.c.GuardGift_run(e.view, '123');
  await e.c.GuardGift_run(e.view, '123'); e.deliver(); await run;
  await e.c.GuardGift_run(e.view, '123');
  assert.equal(e.configRequests.length, 1); assert.equal(e.requests.length, 1);
});
test('核价期间关闭或切换账号不赠送', async () => {
  for (const change of [e => { e.c.guardGift.stop = true; }, e => e.setUid('100')]) {
    const e = setup({ holdPrice: true }); const run = e.c.GuardGift_run(e.view, '123');
    change(e); e.deliver(); await run; assert.equal(e.requests.length, 0);
  }
});
test('已提交后关闭仍等待实际结果，不追加请求', async () => {
  let release;
  const e = setup({ post: () => new Promise(resolve => { release = resolve; }) });
  const run = e.c.GuardGift_run(e.view, '123');
  while (!release) await new Promise(resolve => setImmediate(resolve));
  e.c.guardGift.stop = true; release({ ok: true, json: async () => ({ error: 0 }) }); await run;
  assert.equal(e.requests.length, 1); assert.match(e.states.at(-1), /赠送成功/);
});
for (const [name, options] of [
  ['余额不足', { response: { error: 1, msg: '鱼翅不足' } }],
  ['缺少成功标记', { response: { msg: 'success' } }],
  ['HTTP错误', { post: async () => ({ ok: false, status: 500 }) }],
  ['超时', { post: async () => { const e = new Error(); e.name = 'AbortError'; throw e; } }],
  ['非JSON', { post: async () => ({ ok: true, json: async () => { throw new Error('非JSON'); } }) }]
]) test(`${name}不重试并锁定，提示核对消费记录`, async () => {
  const e = setup(options); await e.c.GuardGift_run(e.view, '123'); e.tick(); await e.c.GuardGift_run(e.view, '123');
  assert.equal(e.requests.length, 1); assert.equal(e.c.guardGift.needsReload, true);
  assert.match(e.states.at(-1), /消费记录/); assert.ok(!e.states.at(-1).startsWith('赠送成功'));
});
test('配置失败、未登录、非法房间均不提交', async () => {
  for (const [options, room] of [[{ configError: true }, '123'], [{ uid: '' }, '123'], [{}, '../123']]) {
    const e = setup(options); await e.c.GuardGift_run(e.view, room); assert.equal(e.requests.length, 0);
  }
});
