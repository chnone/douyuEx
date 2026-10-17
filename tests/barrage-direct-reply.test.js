const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname, '../src/packages/BarragePanel', name), 'utf8');

function setup(tagName = 'TEXTAREA', nativeReply = '@测试用户：原弹幕内容') {
  const sent = [], errors = [], elements = {};
  const input = {
    tagName, value: '未发送的草稿', innerText: '未发送的草稿', isConnected: true,
    addEventListener(type, listener) { this.listener = listener; },
    removeEventListener() { this.listener = null; },
    focus() {},
  };
  const property = tagName === 'TEXTAREA' ? 'value' : 'innerText';
  const content = { innerText: '原弹幕内容' };
  let clicks = 0, ticks = 0;
  const reply = { isConnected: true, click() { clicks++; input[property] = nativeReply; } };
  const context = vm.createContext({
    document: {
      getElementsByClassName(name) { return name === 'ChatSend-txt' ? [input] : name === 'danmuContent-25f266' ? [content] : []; },
      getElementById(id) { return elements[id]; },
      createElement() { return {}; },
    },
    setTimeout(fn) { ticks++; fn(); },
    sendBarrage(text) { sent.push(text); input[property] = ''; },
    showMessage(text) { errors.push(text); },
  });
  vm.runInContext(source('BarragePanel_Tip.js') + '\n' + source('BarragePanel.js'), context);
  return { context, input, property, reply, sent, errors, elements, content, clicks: () => clicks, ticks: () => ticks };
}

for (const tag of ['TEXTAREA', 'DIV']) {
  test(`播放器直接回复发送完整引用一次并保留草稿：${tag}`, async () => {
    const s = setup(tag);
    await s.context.BarragePanelTip_directReply(s.reply);
    assert.deepEqual(s.sent, ['@测试用户：原弹幕内容']);
    assert.equal(s.input[s.property], '未发送的草稿');
    assert.equal(s.clicks(), 1);
    assert.deepEqual(s.errors, []);
  });
}

test('读取原生回复时重复点击不会重复发送', async () => {
  const s = setup();
  await Promise.all([s.context.BarragePanelTip_directReply(s.reply), s.context.BarragePanelTip_directReply(s.reply)]);
  assert.equal(s.sent.length, 1);
  assert.equal(s.clicks(), 1);
});

test('原生回复未填入或格式异常时不发送旧草稿，并允许重新尝试', async () => {
  for (const value of ['', '只有正文没有作者']) {
    const s = setup('TEXTAREA', value);
    await s.context.BarragePanelTip_directReply(s.reply);
    assert.deepEqual(s.sent, []);
    assert.equal(s.errors.length, 1);
    assert.equal(s.input.value, '未发送的草稿');
    assert.ok(s.ticks() <= 20);
    s.reply.click = () => { s.input.value = '@新用户：新内容'; };
    await s.context.BarragePanelTip_directReply(s.reply);
    assert.deepEqual(s.sent, ['@新用户：新内容']);
  }
});

test('等待原生异步填入后发送，用户开始编辑则取消发送', async () => {
  const s = setup('TEXTAREA', '');
  s.context.setTimeout = fn => {
    s.input.value = '@异步用户：内容';
    fn();
  };
  await s.context.BarragePanelTip_directReply(s.reply);
  assert.deepEqual(s.sent, ['@异步用户：内容']);
  s.context.setTimeout = fn => {
    s.input.value = '用户刚输入的内容';
    s.input.listener({ isTrusted: true });
    fn();
  };
  await s.context.BarragePanelTip_directReply(s.reply);
  assert.equal(s.sent.length, 1);
  assert.equal(s.input.value, '用户刚输入的内容');
});

test('聊天区菜单只添加一个入口；切换弹幕后发送新作者及内容，普通回复仍只填输入框', () => {
  const s = setup();
  const parent = { appendChild(node) { s.elements[node.id] = node; } };
  s.elements.barragePanel__mute = {};
  s.elements.barragePanel__search = {};
  s.context.setReplyBarrageButton(parent);
  const button = s.elements.barragePanel__directReply;
  s.context.setReplyBarrageButton(parent);
  assert.equal(s.elements.barragePanel__directReply, button);
  s.context.setBarrgePanelFunc(parent, '甲');
  s.elements.barragePanel__reply.onclick();
  assert.equal(s.input.value, '@甲：原弹幕内容');
  assert.deepEqual(s.sent, []);
  s.content.innerText = '另一条内容';
  s.context.setBarrgePanelFunc(parent, '乙');
  button.onclick();
  assert.deepEqual(s.sent, ['@乙：另一条内容']);
});
