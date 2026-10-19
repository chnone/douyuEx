const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/packages/BagInfo/BagInfo_Expiring.js', 'utf8');
const gift = { id: 268, name: '粉丝荧光棒', expiry: 1, count: 3, propType: 2, isClick: 1, batchInfo: { 100: {} } };
function setup(items = [gift], options = {}) {
  let list = structuredClone(items), uid = '99', now = Date.parse('2026-10-19T12:00:00+08:00');
  const requests = [], posts = [], messages = [], buttons = {
    Backpack__expiring: {}, Backpack__clearbag: {}
  };
  const c = vm.createContext({ URLSearchParams, AbortController, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return now; } }, rid: '3168536',
    document: { hidden: false, getElementById: id => buttons[id] },
    getCookieValue: () => uid,
    sleep: async () => { if (options.sleep) await options.sleep(e); },
    showMessage: (text, type) => messages.push({ text, type }),
    fetch: async (url, config) => {
      requests.push({ url, config });
      if (config.method === 'POST') {
        const body = Object.fromEntries(new URLSearchParams(config.body)); posts.push(body);
        if (options.post) return options.post(e);
        const item = list.find(item => String(item.id) === body.propId);
        item.count--;
        if (options.afterSend) options.afterSend(item, e);
        return { ok: true, json: async () => ({ error: 0 }) };
      }
      if (options.read) await options.read(e);
      return { ok: true, json: async () => options.listResult || ({ error: 0, data: { list: structuredClone(list) } }) };
    }
  });
  vm.runInContext(source, c);
  const e = { c, requests, posts, messages, buttons, list, setUid: value => { uid = value; }, advance: ms => { now += ms; } };
  return e;
}
test('标记0/API expiry1才赠送；保持当前房间、背包接口和单个数量', async () => {
  const e = setup([gift, { ...gift, id: 2, expiry: 2 }, { ...gift, id: 3, expiry: 3 }, { ...gift, id: 4, expiry: 0 }]);
  await e.c.BagInfo_sendToday();
  assert.equal(e.posts.length, 3);
  for (const body of e.posts) assert.deepEqual(body, { propId: '268', propCount: '1', roomId: '3168536', bizExt: '{"yzxq":{}}' });
  assert.ok(e.requests.filter(r => r.config.method === 'POST').every(r => r.url.endsWith('/prop/donate/mainsite/v5')));
  assert.match(e.messages.at(-1).text, /粉丝荧光棒 ×3/);
  assert.equal(e.buttons.Backpack__clearbag.disabled, false);
});
for (const [name, update] of [
  ['喇叭', { name: '分区喇叭' }], ['改名卡', { name: '改名卡' }],
  ['功能道具', { propType: 13 }], ['未知类型', { propType: 99 }], ['缺少类型', { propType: undefined }],
  ['禁用', { isClick: 0 }], ['缺少可用标记', { isClick: undefined }], ['特殊业务', { bizTag: 'biz_interact' }],
  ['空到期值', { expiry: null }], ['布尔到期值', { expiry: true }], ['非法数量', { count: '3bad' }],
  ['负数', { count: -1 }], ['零库存', { count: 0 }], ['小数', { count: 0.5 }], ['超大数量', { count: 1e20 }],
  ['非法id', { id: true }], ['永久时间', { met: -1 }], ['已过期', { met: 1 }],
  ['到期时间与标记矛盾', { met: Date.parse('2026-10-20T23:59:59+08:00') / 1000 }]
]) test(`${name}跳过`, async () => {
  const e = setup([{ ...gift, ...update }]); await e.c.BagInfo_sendToday(); assert.equal(e.posts.length, 0);
});
test('数字字符串和有效的今日截止时间可处理', async () => {
  const e = setup([{ ...gift, id: '268', count: '1', expiry: '1', isClick: '1', propType: '3', met: Date.parse('2026-10-19T23:59:59+08:00') / 1000 }]);
  await e.c.BagInfo_sendToday(); assert.equal(e.posts.length, 1);
});
test('同礼物今天库存消耗后标记变为明天，不能把剩余数量送掉', async () => {
  const e = setup([{ ...gift, count: 100 }], { afterSend(item) { item.expiry = 2; } });
  await e.c.BagInfo_sendToday(); assert.equal(e.posts.length, 1); assert.equal(e.list[0].count, 99);
});
test('重复id不同期限无法指定批次时跳过', async () => {
  const e = setup([gift, { ...gift, expiry: 2 }]); await e.c.BagInfo_sendToday(); assert.equal(e.posts.length, 0);
});
test('读到的库存未减少时停止，避免重复消费', async () => {
  const e = setup([gift], { afterSend(item) { item.count++; } }); await e.c.BagInfo_sendToday();
  assert.equal(e.posts.length, 1); assert.match(e.messages.at(-1).text, /库存变化/);
});
test('每次重新查到期状态，不使用打开背包时的旧列表', async () => {
  const e = setup([gift], { read(e) { if (e.requests.length === 2) e.list[0].expiry = 2; } });
  await e.c.BagInfo_sendToday(); assert.equal(e.posts.length, 0);
});
for (const [name, change] of [
  ['点击停止', e => e.c.BagInfo_sendToday()], ['隐藏页面', e => { e.c.document.hidden = true; }],
  ['切换房间', e => { e.c.rid = '999'; }], ['切换账号', e => e.setUid('88')],
  ['跨天', e => e.advance(86400000)]
]) test(`${name}不再发送下一笔`, async () => {
  const e = setup([gift], { sleep: change }); await e.c.BagInfo_sendToday(); assert.equal(e.posts.length, 1);
});
test('并行重复点击只停止，已发送的结果仍统计', async () => {
  let resolve;
  const e = setup([gift], { post: () => new Promise(r => { resolve = r; }) });
  const run = e.c.BagInfo_sendToday(); while (!resolve) await new Promise(r => setImmediate(r));
  await e.c.BagInfo_sendToday(); resolve({ ok: true, json: async () => ({ error: 0 }) }); await run;
  assert.equal(e.posts.length, 1); assert.match(e.messages.at(-1).text, /已停止.*×1/);
});
for (const [name, post] of [
  ['请求失败', async () => { throw new Error('network'); }],
  ['超时', async () => { const e = new Error(); e.name = 'AbortError'; throw e; }],
  ['HTTP异常', async () => ({ ok: false, status: 500 })],
  ['缺少成功状态', async () => ({ ok: true, json: async () => ({}) })],
  ['服务拒绝', async () => ({ ok: true, json: async () => ({ error: 1, msg: '操作频繁' }) })]
]) test(`${name}停止且不自动或再次点击重试`, async () => {
  const e = setup([gift], { post }); await e.c.BagInfo_sendToday(); e.advance(3000); await e.c.BagInfo_sendToday();
  assert.equal(e.posts.length, 1); assert.equal(e.c.bagExpiring.needsReload, true);
  assert.match(e.messages.at(-1).text, /已确认送出 0 个.*未重试/);
});
test('空背包、无可送礼物、非法列表都不发送', async () => {
  for (const options of [{}, { listResult: { error: 0, data: {} } }, { listResult: { error: 5 } }]) {
    const e = setup([], options); await e.c.BagInfo_sendToday(); assert.equal(e.posts.length, 0);
  }
});
test('清空背包运行时不能并行启动；未登录不能发送', async () => {
  const e = setup(); e.c.bagExpiring.clearRunning = true; await e.c.BagInfo_sendToday(); assert.equal(e.requests.length, 0);
  e.c.bagExpiring.clearRunning = false; e.setUid(''); await e.c.BagInfo_sendToday(); assert.equal(e.requests.length, 0);
});
test('提示不插入道具名称中的HTML', async () => {
  const e = setup([{ ...gift, count: 1, name: '<img src=x onerror=alert(1)>' }]); await e.c.BagInfo_sendToday();
  assert.ok(e.messages.every(m => !m.text.includes('<img')));
});
