const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sources = ['FishShop', 'FishBaitPurchase'].map(name => fs.readFileSync(`src/packages/FishShop/${name}.js`, 'utf8')).join('\n');
const officialFixture = JSON.parse(fs.readFileSync('tests/fixtures/fish-bait-gift-contract.json', 'utf8'));
const bait = { baitLv: 3, giftId: 24942, giftNum: 4, singleGiftNum: 300, giftPrice: 0.1, giftName: '旧名字' };
const gift = { id: 24942, name: '新活动礼物', donateStatus: 1, priceInfo: { price: 10, priceType: 'YUCHI' } };
function setup({ baitOverride = {}, giftOverride = {}, post, publicRead, wait, fixture = false, stringData = false } = {}) {
  const calls = [], publicCalls = [], states = [], busy = [], confirms = [], delays = [];
  const unexpectedRequests = [];
  let now = Date.parse('2026-11-01T10:00:00+08:00'), uid = '99';
  const context = vm.createContext({
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return now; } },
    rid: '123', document: { hidden: false },
    getCookieValue: () => uid,
    window: { confirm: message => { confirms.push(message); throw new Error('一键购买不得调用第二次确认'); } },
    sleep: async delay => { delays.push(delay); if (wait) await wait(context); },
    GM_xmlhttpRequest(options) {
      publicCalls.push(options);
      const url = new URL(options.url);
      const isConfig = url.origin === 'https://webconf.douyucdn.cn' && url.pathname === '/resource/common/activity/actfans_w.json';
      const isSingle = url.origin === 'https://gift.douyucdn.cn' && url.pathname === '/api/gift/v5/web/single';
      const expectedKeys = isConfig ? ['_'] : ['_', 'gid', 'skinId'];
      const valid = (isConfig || isSingle) && options.method === 'GET' && options.anonymous === true &&
        JSON.stringify([...url.searchParams.keys()].sort()) === JSON.stringify(expectedKeys) &&
        /^\d+$/.test(url.searchParams.get('_') || '') &&
        (!isSingle || (/^[1-9]\d*$/.test(url.searchParams.get('gid') || '') && url.searchParams.get('skinId') === '0'));
      if (!valid) {
        unexpectedRequests.push(options.url);
        throw new Error(`测试拒绝未核实的公开接口：${options.url}`);
      }
      if (publicRead && publicRead(options, context, publicCalls.length) === false) return;
      let data;
      if (isConfig) {
        data = fixture ? structuredClone(officialFixture.config) : { data: { fishingConfig: { baitConfig: { baitList: [{ ...bait, ...baitOverride }] } } } };
      } else {
        const selected = fixture ? structuredClone(officialFixture.single.data.giftList[0]) : { ...gift, ...giftOverride };
        const detail = { giftList: String(selected.id) === url.searchParams.get('gid') ? [selected] : [] };
        data = { error: 0, data: stringData ? JSON.stringify(detail) : detail };
      }
      options.onload({ status: 200, responseText: isConfig ? `DYConfigCallback(${JSON.stringify(data)});` : JSON.stringify(data) });
    },
    fetch: async (url, options) => { calls.push({ url, options }); return post ? post(url, options, context) : { ok: true, json: async () => ({ error: 0, data: {} }) }; }
  });
  vm.runInContext(sources, context);
  const view = { status: value => states.push(value), busy: value => busy.push(value) };
  return { context, calls, publicCalls, states, busy, confirms, delays, unexpectedRequests, setUid: value => { uid = value; }, tick: (ms = 3000) => { now += ms; }, async run(room = '123') {
    await context.FishBaitPurchase_run(view, room);
    assert.deepEqual(unexpectedRequests, [], '公开查询必须使用已核实的接口和参数，不能由泛化mock掩盖错误路由');
  } };
}

const flushAsync = () => new Promise(resolve => setImmediate(resolve));
const deliverConfig = (options, override = {}) => options.onload({ status: 200, responseText: JSON.stringify({ data: { fishingConfig: { baitConfig: { baitList: [{ ...bait, ...override }] } } } }) });
const deliverGift = (options, override = {}) => options.onload({ status: 200, responseText: JSON.stringify({ error: 0, data: { giftList: [{ ...gift, ...override }] } }) });
const success = () => ({ ok: true, json: async () => ({ error: 0, data: {} }) });

test('点击即按高级等级匹配礼物，核价后串行三笔各4个，不二次确认', async () => {
  const e = setup(); await e.run();
  assert.equal(e.calls.length, 3);
  assert.equal(e.publicCalls.length, 6);
  assert.ok(e.publicCalls.every(c => c.anonymous && c.method === 'GET'));
  for (const call of e.publicCalls.filter(call => new URL(call.url).hostname === 'gift.douyucdn.cn')) {
    const url = new URL(call.url);
    assert.equal(url.pathname, '/api/gift/v5/web/single');
    assert.equal(url.searchParams.get('gid'), '24942');
    assert.equal(url.searchParams.get('skinId'), '0');
    assert.equal(url.searchParams.has('rid'), false);
  }
  assert.equal(e.confirms.length, 0);
  assert.ok(e.states.some(text => /新活动礼物.*4.*0.4 鱼翅/.test(text)));
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
  assert.deepEqual(e.delays, [350, 350]);
});

test('礼物ID、名称换期自动适配，不查招募令文本', async () => {
  const e = setup({ baitOverride: { giftId: 88888 }, giftOverride: { id: 88888, name: '冬日限定' } });
  await e.run();
  assert.equal(e.calls.length, 3);
  assert.ok(e.states.some(text => text.includes('冬日限定')));
  assert.equal(e.confirms.length, 0);
  assert.equal(new URLSearchParams(e.calls[0].options.body).get('giftId'), '88888');
  assert.ok(e.publicCalls.filter(call => new URL(call.url).hostname === 'gift.douyucdn.cn').every(call => new URL(call.url).searchParams.get('gid') === '88888'));
});

for (const [name, options] of [
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

test('重复点击、完成后双击不多买；冷却后再次主动操作会重新核价', async () => {
  let release;
  const e = setup({ publicRead(options, _context, count) { if (count === 1) { release = () => options.onerror(); return false; } } });
  const task = e.run(); await e.run(); assert.equal(e.publicCalls.length, 1); release(); await task;
  await e.run(); assert.equal(e.publicCalls.length, 1);
  e.tick(); await e.run(); assert.equal(e.calls.length, 3);
  await e.run(); assert.equal(e.calls.length, 3);
  e.tick(); await e.run(); assert.equal(e.calls.length, 6); assert.equal(e.confirms.length, 0);
  assert.equal(e.publicCalls.length, 13);
});

test('配置读取期间停止、切账号、切房间、隐藏和跨天都不扣费', async () => {
  for (const change of [e => { e.context.fishBaitPurchase.stop = true; }, e => e.setUid('100'), e => { e.context.rid = '456'; }, e => { e.context.document.hidden = true; }, e => e.tick(86400000)]) {
    let release;
    const e = setup({ publicRead(options, _context, count) { if (count === 1) { release = () => options.onload({ status: 200, responseText: JSON.stringify({ data: { fishingConfig: { baitConfig: { baitList: [bait] } } } }) }); return false; } } });
    const task = e.run(); change(e); release(); await task; assert.equal(e.calls.length, 0);
  }
});

test('第二组前礼物改名停止，不沿用首组的旧礼物名称', async () => {
  const changed = setup({ publicRead(options, _context, count) { if (count === 4) { options.onload({ status: 200, responseText: JSON.stringify({ error: 0, data: { giftList: [{ ...gift, name: '又改名' }] } }) }); return false; } } });
  await changed.run(); assert.equal(changed.calls.length, 1); assert.match(changed.states.at(-1), /1\/3.*已变化/);
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
      if (count === 3) {
        options.onload({ status: 200, responseText: JSON.stringify({ data: { fishingConfig: { baitConfig: { baitList: [{ ...bait, ...override }] } } } }) });
        return false;
      }
    } });
    await e.run(); assert.equal(e.calls.length, 1); assert.match(e.states.at(-1), /已停止.*1\/3.*300/);
    assert.ok(e.publicCalls.filter(call => new URL(call.url).pathname.endsWith('/single')).every(call => new URL(call.url).searchParams.get('gid') === '24942'), '中途改期时不擅自改买新礼物或将旧详情用于新ID');
  }
});

test('首笔必须等初始配置和single详情都核实，首组不重复查询', async () => {
  const held = new Map();
  const e = setup({ publicRead(options, _context, count) {
    if (count <= 2) { held.set(count, options); return false; }
  } });
  const task = e.run();
  assert.equal(e.publicCalls.length, 1); assert.equal(e.calls.length, 0);
  deliverConfig(held.get(1)); await flushAsync();
  assert.equal(e.publicCalls.length, 2); assert.equal(e.calls.length, 0);
  deliverGift(held.get(2)); await task;
  assert.equal(e.calls.length, 3); assert.equal(e.publicCalls.length, 6); assert.equal(e.confirms.length, 0);
});

test('第二组配置和详情并行发出，两项都成功才允许第二笔', async () => {
  const held = new Map();
  const e = setup({ publicRead(options, _context, count) {
    if (count === 3 || count === 4) { held.set(count, options); return false; }
  } });
  const task = e.run(); await flushAsync();
  assert.equal(e.calls.length, 1); assert.equal(e.publicCalls.length, 4);
  assert.match(held.get(3).url, /webconf\.douyucdn\.cn/); assert.match(held.get(4).url, /gift\.douyucdn\.cn/);
  deliverGift(held.get(4)); await flushAsync();
  assert.equal(e.calls.length, 1, '详情先返回时不能使用上一组的旧配置');
  deliverConfig(held.get(3)); await task;
  assert.equal(e.calls.length, 3); assert.equal(e.publicCalls.length, 6);
});

for (const failed of [3, 4]) test(`第二组并行核价第${failed === 3 ? '配置' : '详情'}项失败，另一项晚到也不继续扣费`, async () => {
  const held = new Map();
  const e = setup({ publicRead(options, _context, count) {
    if (count === 3 || count === 4) { held.set(count, options); return false; }
  } });
  const task = e.run(); await flushAsync();
  assert.equal(held.size, 2); assert.equal(e.calls.length, 1);
  held.get(failed).onerror(); await task;
  if (failed === 3) deliverGift(held.get(4)); else deliverConfig(held.get(3));
  await flushAsync();
  assert.equal(e.calls.length, 1); assert.equal(e.publicCalls.length, 4);
  assert.match(e.states.at(-1), /已停止.*1\/3.*未继续扣费/);
  assert.equal(e.context.fishBaitPurchase.needsReload, false, '只读失败不得当作未知扣费');
});

test('第二组并行核价期间停止、切账号、切房间、跨天或隐藏页面，均不发送第二笔', async () => {
  for (const change of [
    e => { e.context.fishBaitPurchase.stop = true; }, e => e.setUid('100'), e => { e.context.rid = '456'; },
    e => e.tick(86400000), e => { e.context.document.hidden = true; }
  ]) {
    const held = new Map();
    const e = setup({ publicRead(options, _context, count) {
      if (count === 3 || count === 4) { held.set(count, options); return false; }
    } });
    const task = e.run(); await flushAsync();
    assert.equal(held.size, 2); change(e);
    deliverConfig(held.get(3)); deliverGift(held.get(4)); await task;
    assert.equal(e.calls.length, 1); assert.match(e.states.at(-1), /已停止.*1\/3.*300/);
  }
});

test('配置和single同步涨价也不继续按新价买剩余组', async () => {
  const e = setup({ publicRead(options, _context, count) {
    if (count === 3) { deliverConfig(options, { giftPrice: 0.2 }); return false; }
    if (count === 4) { deliverGift(options, { priceInfo: { price: 20, priceType: 'YUCHI' } }); return false; }
  } });
  await e.run(); assert.equal(e.calls.length, 1); assert.match(e.states.at(-1), /1\/3.*已变化/);
});

test('加速只并行只读核价：三次POST始终串行，前笔未返回不查询或提交后组', async () => {
  const releases = [];
  let active = 0, maxActive = 0;
  const e = setup({ post: () => new Promise(resolve => {
    active++; maxActive = Math.max(maxActive, active);
    releases.push(() => { active--; resolve(success()); });
  }) });
  const task = e.run(); await flushAsync();
  assert.equal(e.calls.length, 1); assert.equal(e.publicCalls.length, 2);
  await flushAsync(); assert.equal(e.calls.length, 1); assert.equal(e.publicCalls.length, 2);
  releases[0](); await flushAsync();
  assert.equal(e.calls.length, 2); assert.equal(e.publicCalls.length, 4);
  await flushAsync(); assert.equal(e.calls.length, 2); assert.equal(e.publicCalls.length, 4);
  releases[1](); await flushAsync();
  assert.equal(e.calls.length, 3); assert.equal(e.publicCalls.length, 6);
  releases[2](); await task;
  assert.equal(maxActive, 1); assert.equal(active, 0); assert.deepEqual(e.delays, [350, 350]);
  assert.match(e.states.at(-1), /3\/3.*900/);
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
]) test(`${name}不扣费`, async () => {
  const e = setup({ publicRead(options) { options.onload(reply); return false; } }); await e.run();
  assert.equal(e.calls.length, 0); assert.equal(e.confirms.length, 0);
});

test('礼物列表重复ID不扣费', async () => {
  const e = setup({ publicRead(options, _context, count) {
    if (count === 2) { options.onload({ status: 200, responseText: JSON.stringify({ error: 0, data: { giftList: [gift, gift] } }) }); return false; }
  } }); await e.run(); assert.equal(e.calls.length, 0); assert.equal(e.confirms.length, 0);
});

for (const stringData of [false, true]) test(`真实公开配置回归：普通礼物栏没有鱼饵礼物，single详情${stringData ? '字符串' : '对象'}仍可核价`, async () => {
  const target = officialFixture.config.data.fishingConfig.baitConfig.baitList.find(item => item.baitLv === 3).giftId;
  assert.equal(officialFixture.roomList.data.giftList.length, 67);
  assert.ok(!officialFixture.roomList.data.giftList.some(item => item.id === target));
  assert.equal(officialFixture.single.data.giftList[0].id, target);
  const e = setup({ fixture: true, stringData });
  await e.run();
  assert.equal(e.calls.length, 3);
  assert.equal(e.confirms.length, 0);
  assert.ok(e.states.some(text => text.includes('招募令')));
  assert.equal(e.publicCalls.length, 6);
  assert.ok(e.publicCalls.every(call => !new URL(call.url).pathname.endsWith('/list')));
  assert.equal(e.context.fishBaitPurchase.needsReload, false);
});

for (const [name, payload] of [
  ['详情找不到该礼物', { error: 0, data: { giftList: [] } }],
  ['详情返回其他ID', { error: 0, data: { giftList: [{ ...gift, id: 88888 }] } }],
  ['详情返回重复目标', { error: 0, data: { giftList: [gift, gift] } }],
  ['详情缺少列表', { error: 0, data: {} }],
  ['详情列表不是数组', { error: 0, data: { giftList: { gift } } }],
  ['详情缺少成功状态', { data: { giftList: [gift] } }],
  ['详情业务错误', { error: 5, msg: 'not found', data: { giftList: [gift] } }],
  ['详情嵌套JSON无效', { error: 0, data: 'not json' }],
  ['详情现价为空', { error: 0, data: { giftList: [{ ...gift, priceInfo: { price: null, priceType: 'YUCHI' } }] } }],
  ['详情现价为零', { error: 0, data: { giftList: [{ ...gift, priceInfo: { price: 0, priceType: 'YUCHI' } }] } }]
]) test(`${name}不确认、不扣费且不锁死未提交操作`, async () => {
  const e = setup({ publicRead(options) {
    if (new URL(options.url).pathname.endsWith('/single')) {
      options.onload({ status: 200, responseText: JSON.stringify(payload) });
      return false;
    }
  } });
  await e.run();
  assert.equal(e.calls.length, 0); assert.equal(e.confirms.length, 0);
  assert.equal(e.context.fishBaitPurchase.needsReload, false);
  assert.match(e.states.at(-1), /已停止.*未继续扣费/);
});

test('详情HTTP错误不回退到普通赠礼或跳过核价', async () => {
  const e = setup({ publicRead(options) {
    if (new URL(options.url).pathname.endsWith('/single')) {
      options.onload({ status: 503, responseText: '{}' }); return false;
    }
  } });
  await e.run(); assert.equal(e.calls.length, 0); assert.equal(e.confirms.length, 0);
  assert.equal(e.publicCalls.length, 2); assert.equal(e.context.fishBaitPurchase.needsReload, false);
});

test('测试替身拒绝未知接口或错误查询参数，不再将任意GET伪装为有效礼物', () => {
  const e = setup();
  for (const url of [
    'https://gift.douyucdn.cn/api/gift/v5/web/list?rid=123&_=1',
    'https://gift.douyucdn.cn/api/gift/v5/web/single?gid=24942&skinId=0&rid=123&_=1',
    'https://gift.douyucdn.cn/api/gift/v5/web/single?giftId=24942&skinId=0&_=1',
    'https://gift.douyucdn.cn/api/gift/v5/web/single?gid=24942&skinId=1&_=1',
    'https://example.com/api/gift/v5/web/single?gid=24942&skinId=0&_=1'
  ]) {
    assert.throws(() => e.context.GM_xmlhttpRequest({ method: 'GET', anonymous: true, url }), /未核实的公开接口/);
  }
  assert.equal(e.calls.length, 0);
});
