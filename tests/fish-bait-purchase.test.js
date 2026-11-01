const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sources = ['FishShop', 'FishBaitPurchase'].map(name => fs.readFileSync(`src/packages/FishShop/${name}.js`, 'utf8')).join('\n');
const bait = { baitLv: 3, giftId: 24942, giftNum: 4, singleGiftNum: 300, giftPrice: 0.1, giftName: '旧名字' };
const gift = { id: 24942, name: '新活动礼物', donateStatus: 1, priceInfo: { price: 10, priceType: 'YUCHI' } };
function setup({ baitOverride = {}, giftOverride = {}, confirm = true, post, publicRead, wait } = {}) {
  const calls = [], publicCalls = [], states = [], busy = [], confirms = [], delays = [];
  let now = Date.parse('2026-11-01T10:00:00+08:00'), uid = '99';
  const context = vm.createContext({
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return now; } },
    rid: '123', document: { hidden: false },
    getCookieValue: () => uid,
    window: { confirm: message => { confirms.push(message); return typeof confirm === 'function' ? confirm(context) : confirm; } },
    sleep: async delay => { delays.push(delay); if (wait) await wait(context); },
    GM_xmlhttpRequest(options) {
      publicCalls.push(options);
      if (publicRead && publicRead(options, context, publicCalls.length) === false) return;
      const data = options.url.includes('webconf.')
        ? { data: { fishingConfig: { baitConfig: { baitList: [ { ...bait, ...baitOverride } ] } } } }
        : { error: 0, data: JSON.stringify({ giftList: [ { ...gift, ...giftOverride } ] }) };
      options.onload({ status: 200, responseText: options.url.includes('webconf.') ? `DYConfigCallback(${JSON.stringify(data)});` : JSON.stringify(data) });
    },
    fetch: async (url, options) => { calls.push({ url, options }); return post ? post(url, options, context) : { ok: true, json: async () => ({ error: 0, data: {} }) }; }
  });
  vm.runInContext(sources, context);
  const view = { status: value => states.push(value), busy: value => busy.push(value) };
  return { context, calls, publicCalls, states, busy, confirms, delays, setUid: value => { uid = value; }, tick: (ms = 3000) => { now += ms; }, run: (room = '123') => context.FishBaitPurchase_run(view, room) };
}

test('动态按高级等级匹配礼物，三笔各4个并携带高级鱼饵业务字段', async () => {
  const e = setup(); await e.run();
  assert.equal(e.calls.length, 3);
  assert.equal(e.publicCalls.length, 8);
  assert.ok(e.publicCalls.every(c => c.anonymous && c.method === 'GET'));
  assert.equal(e.confirms.length, 1);
  assert.match(e.confirms[0], /新活动礼物.*4 × 3 = 12/);
  assert.match(e.confirms[0], /900.*\n合计 1.2 鱼翅/);
  for (const call of e.calls) {
    assert.equal(call.url, 'https://www.douyu.com/japi/gift/donate/mainsite/v3');
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.credentials, 'include');
    const params = Object.fromEntries(new URLSearchParams(call.options.body));
    assert.equal(params.giftId, '24942'); assert.equal(params.giftCount, '4'); assert.equal(params.roomId, '123');
    assert.equal(params.skinId, '0');
    assert.deepEqual(JSON.parse(params.bizExt), { type: 'fishingBait', bizId: 3 });
  }
  assert.match(e.states.at(-1), /鱼饵购买结束.*3\/3.*900.*12.*1.2 鱼翅/);
  assert.deepEqual(e.busy, [true, false]);
  assert.deepEqual(e.delays, [700, 700]);
});

test('礼物ID、名称换期自动适配，不查招募令文本', async () => {
  const e = setup({ baitOverride: { giftId: 88888 }, giftOverride: { id: 88888, name: '冬日限定' } });
  await e.run();
  assert.equal(e.calls.length, 3);
  assert.match(e.confirms[0], /冬日限定/);
  assert.equal(new URLSearchParams(e.calls[0].options.body).get('giftId'), '88888');
});

for (const [name, options] of [
  ['取消确认', { confirm: false }],
  ['改为5个礼物一组', { baitOverride: { giftNum: 5 } }],
  ['改为其他鱼饵数量', { baitOverride: { singleGiftNum: 301 } }],
  ['不再是高级', { baitOverride: { baitLv: 2 } }],
  ['非法ID', { baitOverride: { giftId: null } }],
  ['零价', { baitOverride: { giftPrice: 0 } }],
  ['缺失价格', { baitOverride: { giftPrice: '' } }],
  ['小数精度异常', { baitOverride: { giftPrice: 0.101 } }],
  ['礼物禁送', { giftOverride: { donateStatus: 0 } }],
  ['错误币种', { giftOverride: { priceInfo: { price: 10, priceType: 'YUWAN' } } }],
  ['现价与活动不一致', { giftOverride: { priceInfo: { price: 11, priceType: 'YUCHI' } } }],
  ['无名称', { giftOverride: { name: '' } }]
]) test(`${name}不扣费`, async () => { const e = setup(options); await e.run(); assert.equal(e.calls.length, 0); assert.equal(e.context.fishBaitPurchase.running, false); });

test('重复点击、完成后双击不多买；再次主动操作需要再次确认', async () => {
  let release;
  const e = setup({ publicRead(options, _context, count) { if (count === 1) { release = () => options.onerror(); return false; } } });
  const task = e.run(); await e.run(); assert.equal(e.publicCalls.length, 1); release(); await task;
  await e.run(); assert.equal(e.publicCalls.length, 1);
  e.tick(); await e.run(); assert.equal(e.calls.length, 3);
  await e.run(); assert.equal(e.calls.length, 3);
  e.tick(); await e.run(); assert.equal(e.calls.length, 6); assert.equal(e.confirms.length, 2);
});

test('配置读取期间停止、切账号、切房间、隐藏和跨天都不扣费', async () => {
  for (const change of [e => { e.context.fishBaitPurchase.stop = true; }, e => e.setUid('100'), e => { e.context.rid = '456'; }, e => { e.context.document.hidden = true; }, e => e.tick(86400000)]) {
    let release;
    const e = setup({ publicRead(options, _context, count) { if (count === 1) { release = () => options.onload({ status: 200, responseText: JSON.stringify({ data: { fishingConfig: { baitConfig: { baitList: [bait] } } } }) }); return false; } } });
    const task = e.run(); change(e); release(); await task; assert.equal(e.calls.length, 0);
  }
});

test('确认期间切房间、点击取消不提交；首笔前重新核价变化不提交', async () => {
  const e = setup({ confirm(context) { context.rid = '456'; return true; } }); await e.run(); assert.equal(e.calls.length, 0);
  const changed = setup({ publicRead(options, _context, count) { if (count === 4) { options.onload({ status: 200, responseText: JSON.stringify({ error: 0, data: { giftList: [{ ...gift, name: '又改名' }] } }) }); return false; } } });
  await changed.run(); assert.equal(changed.calls.length, 0); assert.match(changed.states.at(-1), /已变化/);
});

test('首组后停止只统计已确认组，不补买剩余两组', async () => {
  const e = setup({ wait(context) { context.fishBaitPurchase.stop = true; } }); await e.run();
  assert.equal(e.calls.length, 1); assert.match(e.states.at(-1), /已停止.*1\/3.*300/);
});

test('在途请求后停止仍统计返回成功，不发下一组', async () => {
  let release;
  const e = setup({ post: () => new Promise(resolve => { release = resolve; }) });
  const task = e.run(); while (!release) await new Promise(resolve => setImmediate(resolve));
  e.context.fishBaitPurchase.stop = true;
  release({ ok: true, json: async () => ({ error: 0 }) }); await task;
  assert.equal(e.calls.length, 1); assert.match(e.states.at(-1), /1\/3/);
});

for (const [name, post] of [
  ['余额不足', async () => ({ ok: true, json: async () => ({ error: 1, msg: '鱼翅不足' }) })],
  ['无明确成功', async () => ({ ok: true, json: async () => ({ data: {} }) })],
  ['HTTP失败', async () => ({ ok: false, status: 500 })],
  ['超时', async () => { const error = new Error(); error.name = 'AbortError'; throw error; }],
  ['非JSON', async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })]
]) test(`${name}停止且锁定不重试`, async () => {
  const e = setup({ post }); await e.run(); e.tick(); await e.run();
  assert.equal(e.calls.length, 1); assert.equal(e.context.fishBaitPurchase.needsReload, true);
  assert.match(e.states.at(-1), /0\/3.*最后一笔结果未确认.*未重试/);
});

test('未登录、非法房间不读配置也不扣费', async () => {
  const e = setup(); e.setUid(''); await e.run(); assert.equal(e.publicCalls.length, 0);
  const f = setup(); await f.run('../123'); assert.equal(f.publicCalls.length, 0);
});

test('第二组前礼物改期或价格变化保留首组统计且不继续', async () => {
  for (const override of [{ giftId: 88888 }, { giftPrice: 0.2 }]) {
    const e = setup({ publicRead(options, _context, count) {
      if (count === 5) {
        options.onload({ status: 200, responseText: JSON.stringify({ data: { fishingConfig: { baitConfig: { baitList: [{ ...bait, ...override }] } } } }) });
        return false;
      }
    } });
    await e.run(); assert.equal(e.calls.length, 1); assert.match(e.states.at(-1), /已停止.*1\/3.*300/);
  }
});

test('第二笔失败保留首笔成功数量，锁定且不补交', async () => {
  let count = 0;
  const e = setup({ post: async () => { if (++count === 2) throw new Error('connection lost'); return { ok: true, json: async () => ({ error: 0 }) }; } });
  await e.run(); e.tick(); await e.run();
  assert.equal(e.calls.length, 2); assert.match(e.states.at(-1), /1\/3.*300.*最后一笔结果未确认/);
  assert.equal(e.context.fishBaitPurchase.needsReload, true);
});

for (const [name, reply] of [
  ['配置HTTP错误', { status: 500, responseText: '{}' }],
  ['配置非JSON', { status: 200, responseText: 'invalid' }],
  ['重复高级配置', { status: 200, responseText: JSON.stringify({ data: { fishingConfig: { baitConfig: { baitList: [bait, bait] } } } }) }]
]) test(`${name}不确认不扣费`, async () => {
  const e = setup({ publicRead(options) { options.onload(reply); return false; } }); await e.run();
  assert.equal(e.calls.length, 0); assert.equal(e.confirms.length, 0);
});

test('礼物列表重复ID不扣费', async () => {
  const e = setup({ publicRead(options, _context, count) {
    if (count === 2) { options.onload({ status: 200, responseText: JSON.stringify({ error: 0, data: { giftList: [gift, gift] } }) }); return false; }
  } }); await e.run(); assert.equal(e.calls.length, 0); assert.equal(e.confirms.length, 0);
});
