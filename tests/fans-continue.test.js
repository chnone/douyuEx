const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/packages/FansContinue/FansContinue.js', 'utf8');
function setup({ tag = 'DIV', uid = '99', disabled = false, response = { res: '0' }, gifts = [], rooms = ['11', '22'], giftReply, inputText = '草稿', duringClick } = {}) {
  const messages = [], sent = [], requests = [], waits = [];
  let handler, unsubscribed = 0, clickHandler, prompt, active = 0, maximum = 0;
  const input = { tagName: tag, value: inputText, innerText: inputText, dispatchEvent() {} };
  const read = () => tag === 'TEXTAREA' ? input.value : input.innerText;
  const write = text => { if (tag === 'TEXTAREA') input.value = text; else input.innerText = text; };
  const button = { dataset: {}, disabled, classList: { contains: () => false }, getAttribute: () => null,
    click() { sent.push({ text: read(), plain: this.dataset.exPlainMessage }); write(''); duringClick?.({ input, write }); handler?.(response); }
  };
  const context = vm.createContext({ URLSearchParams, AbortController, Event, setTimeout, clearTimeout,
    rid: '123', getCookieValue: () => uid,
    unsafeWindow: { socketProxy: { socketStream: { subscribe(type, fn) { assert.equal(type, 'chatres'); handler = fn; return { unsubscribe() { unsubscribed++; } }; } } } },
    document: { querySelector: selector => selector === '.ChatSend-txt' ? input : button,
      getElementsByClassName: () => [{ addEventListener: (_, fn) => { clickHandler = fn; } }] },
    localStorage: { getItem: () => null, setItem() {} },
    PostbirdAlertBox: { prompt(options) { prompt = options; } },
    DOMParser: class { parseFromString() { return { querySelectorAll: () => rooms.map(id => ({ getAttribute: () => id })) }; } },
    sleep: async ms => { waits.push(ms); },
    showMessage: (...args) => messages.push(args),
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('/donate/')) {
        active++; maximum = Math.max(maximum, active);
        try { return { ok: true, json: async () => giftReply ? await giftReply(new URLSearchParams(options.body)) : { msg: 'success' } }; }
        finally { active--; }
      }
      return { ok: true, text: async () => 'mock badge page', json: async () => ({ data: { list: gifts } }) };
    }
  });
  vm.runInContext(source, context);
  return { context, sent, messages, requests, input, button, read, waits, get unsubscribed() { return unsubscribed; },
    clickIcon() { context.initPkg_FansContinue_Func(); clickHandler(); return prompt; } };
}
for (const tag of ['DIV', 'TEXTAREA']) test(`${tag}: 当前房间只发送666，保留草稿且不加小尾巴`, async () => {
  const e = setup({ tag }); await e.context.FansContinue_startSend(1);
  assert.deepEqual(e.sent, [{ text: '666', plain: '1' }]);
  assert.equal(e.read(), '草稿'); assert.equal(e.button.dataset.exPlainMessage, undefined);
  assert.equal(e.unsubscribed, 1);
  assert.ok(e.messages.some(([text]) => text.includes('当前房间666已发送')));
  assert.ok(e.messages.some(([text]) => text.includes('没有荧光棒')));
  assert.equal(e.requests.filter(r => r.options.method === 'POST').length, 0);
});
test('取消或无效数量不会发送弹幕或礼物', async () => {
  const e = setup(); e.clickIcon().onCancel();
  for (const value of ['', '-1', '1.5', 'Infinity']) e.clickIcon().onConfirm(value);
  assert.equal(e.sent.length, 0); assert.equal(e.requests.length, 0);
  assert.equal(e.context.fansContinuePromptOpen, false);
});
test('重复点击确认框期间不创建第二个确认框', () => {
  const e = setup(), first = e.clickIcon();
  assert.equal(e.clickIcon(), first);
  assert.ok(e.messages.some(([s]) => s.includes('请勿重复点击')));
});
test('没有登录或发送按钮被禁用时不发送，荧光棒仍按原流程处理', async () => {
  for (const options of [{ uid: '' }, { disabled: true }]) {
    const e = setup(options); await e.context.FansContinue_startSend(1);
    assert.equal(e.sent.length, 0); assert.equal(e.read(), '草稿');
    assert.equal(e.requests.length, 1); assert.equal(e.context.fansContinueRunning, false);
  }
});
test('回执失败不重发、不显示成功', async () => {
  const e = setup({ response: { res: '288' } }); await e.context.FansContinue_startSend(1);
  assert.equal(e.sent.length, 1);
  assert.ok(e.messages.some(([s]) => s.includes('发送失败')));
  assert.ok(!e.messages.some(([s]) => s.includes('666已发送')));
});
test('运行锁覆盖等待回执和送荧光棒全过程', async () => {
  let release;
  const e = setup({ gifts: [{ id: 268, count: 5 }], rooms: ['11'], giftReply: () => new Promise(resolve => { release = resolve; }) });
  const run = e.context.FansContinue_startSend(1);
  await e.context.FansContinue_startSend(1);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await e.context.FansContinue_startSend(1);
  assert.equal(e.sent.length, 1);
  release({ msg: 'success' }); await run;
  assert.equal(e.context.fansContinueRunning, false);
});
test('荧光棒房间去重和平均数量正确；弹幕仍只发当前房间一次', async () => {
  const e = setup({ gifts: [{ id: 2358, count: 7 }], rooms: ['11', '11', 'bad', '22'] });
  await e.context.FansContinue_startSend(0);
  const posts = e.requests.filter(r => r.options.method === 'POST').map(r => Object.fromEntries(new URLSearchParams(r.options.body)));
  assert.deepEqual(posts.map(p => [p.roomId, p.propId, p.propCount]), [['11', '2358', '3'], ['22', '2358', '3']]);
  assert.equal(e.sent.length, 1); assert.deepEqual(e.waits, [250, 250]);
});
test('荧光棒失败后停止、不重试、不重复发送666', async () => {
  const e = setup({ gifts: [{ id: 268, count: 5 }], giftReply: () => ({ msg: '<失败>' }) });
  await e.context.FansContinue_startSend(1);
  assert.equal(e.requests.filter(r => r.options.method === 'POST').length, 1);
  assert.equal(e.sent.length, 1); assert.equal(e.context.fansContinueRunning, false);
  assert.ok(e.messages.some(([s]) => s.includes('&lt;失败&gt;')));
});
test('发送过程中输入的新草稿不会被覆盖', async () => {
  const e = setup({ duringClick: ({ write }) => write('新的草稿') });
  await e.context.FansContinue_sendCurrentBarrage(); assert.equal(e.read(), '新的草稿');
});
test('无回执只提示已提交，不重试也不误报成功', async () => {
  const e = setup({ response: {} });
  e.context.setTimeout = (fn, ms) => setTimeout(fn, ms === 6000 ? 0 : ms);
  await e.context.FansContinue_startSend(1);
  assert.equal(e.sent.length, 1);
  assert.ok(e.messages.some(([s]) => s.includes('尚未收到确认')));
  assert.ok(!e.messages.some(([s]) => s.includes('666已发送')));
});
