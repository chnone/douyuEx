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

function setupTipBar({ hasReply = true, hasContainer = true } = {}) {
  let mutations = 0;
  const sent = [], nativeClicks = [];
  class Element {
    constructor(tag = 'div', text = '') {
      this.tag = tag; this.textContent = text; this.children = []; this.className = '';
      this.classList = { add: name => { if (!this.className.split(' ').includes(name)) this.className += ` ${name}`; } };
    }
    get nextElementSibling() {
      if (!this.parentElement) return null;
      return this.parentElement.children[this.parentElement.children.indexOf(this) + 1] || null;
    }
    insertBefore(node, reference) {
      if (node.parentElement) node.parentElement.children.splice(node.parentElement.children.indexOf(node), 1);
      const index = reference ? this.children.indexOf(reference) : this.children.length;
      assert.ok(index >= 0);
      this.children.splice(index, 0, node); node.parentElement = this; mutations++;
    }
    appendChild(node) { this.insertBefore(node, null); }
    matches(selector) { return selector.split(',').map(item => item.trim()).includes(this.tag); }
    getElementsByClassName(name) {
      return this.children.flatMap(child => [...(child.className.split(' ').includes(name) ? [child] : []), ...child.getElementsByClassName(name)]);
    }
    querySelector(selector) {
      const id = selector.match(/\[id='([^']+)'\]/)?.[1];
      for (const child of this.children) {
        if (child.id === id) return child;
        const nested = child.querySelector(selector);
        if (nested) return nested;
      }
      return null;
    }
    click() { this.onclick?.({ stopPropagation() {} }); }
  }
  const container = new Element(), bar = new Element(), native = {};
  container.appendChild(bar);
  for (const name of ['赞', '举报', ...(hasReply ? ['回复'] : []), '收藏']) {
    const button = new Element('div', name);
    button.className = 'labelfisrt-407af4'; button.onclick = () => nativeClicks.push(name);
    native[name] = button; bar.appendChild(button);
    if (name === '赞') {
      const separator = new Element('p', '|'); separator.className = 'sugun-e3fbf6'; bar.appendChild(separator);
    }
  }
  const selected = new Element(); selected.innerText = '选中弹幕正文';
  const context = vm.createContext({
    document: {
      getElementById(id) {
        if (id === 'comment-dzjy-container') return hasContainer ? container : null;
        if (id === 'comment-higher-container') return selected;
        return container.querySelector(`[id='${id}']`);
      },
      createElement: tag => new Element(tag)
    },
    sendBarrage: text => sent.push(text)
  });
  vm.runInContext(source('BarragePanel_Tip.js'), context);
  return {
    context, container, bar, native, nativeClicks, sent, Element, mutations: () => mutations,
    actions: () => bar.children.filter(child => child.tag !== 'p').map(child => child.textContent),
    render() { context.renderBarragePanelTip(); context.setBarragePanelTipFunc(); }
  };
}

test('播放器操作栏将直接回复和+1放在中间，保留四个原生按钮及分隔线', () => {
  const env = setupTipBar();
  const original = Object.values(env.native), separator = env.bar.children[1];
  env.render();
  assert.deepEqual(env.actions(), ['赞', '举报', '直接回复', '+1', '回复', '收藏']);
  assert.ok(env.bar.className.includes('ex-barrage-tip-actions'));
  assert.equal(env.bar.children.filter(node => node.tag === 'p').length, 1);
  assert.ok(env.bar.children.includes(separator));
  for (const node of original) { assert.ok(env.bar.children.includes(node)); node.click(); }
  assert.deepEqual(env.nativeClicks, ['赞', '举报', '回复', '收藏']);
  assert.deepEqual(env.sent, []);
});

test('重复渲染不增加或来回移动按钮，+1仍只发送选中的弹幕', () => {
  const env = setupTipBar(); env.render();
  const plus = env.bar.querySelector("[id='barrage-panel-tip__+1']");
  const direct = env.bar.querySelector("[id='barrage-panel-tip__direct-reply']");
  const before = env.mutations();
  env.render(); env.render();
  assert.equal(env.mutations(), before);
  assert.equal(env.bar.querySelector("[id='barrage-panel-tip__+1']"), plus);
  assert.equal(env.bar.querySelector("[id='barrage-panel-tip__direct-reply']"), direct);
  plus.click(); assert.deepEqual(env.sent, ['选中弹幕正文']);
});

test('直接回复保持绑定当前原生回复，宿主替换回复节点后重新绑定', () => {
  const env = setupTipBar(), selected = [];
  env.context.BarragePanelTip_directReply = reply => selected.push(reply);
  env.render();
  const direct = env.bar.querySelector("[id='barrage-panel-tip__direct-reply']");
  direct.click(); assert.equal(selected[0], env.native['回复']);
  const replacement = new env.Element('button', '回复'); replacement.className = 'labelfisrt-407af4';
  const old = env.native['回复'];
  env.bar.insertBefore(replacement, old);
  env.bar.children.splice(env.bar.children.indexOf(old), 1); old.parentElement = null;
  env.render(); direct.click();
  assert.equal(selected[1], replacement);
  assert.deepEqual(env.actions(), ['赞', '举报', '直接回复', '+1', '回复', '收藏']);
  assert.deepEqual(env.sent, []);
});

test('宿主尚未出现回复按钮时不猜测目标，出现后补入中间且无重复', () => {
  const env = setupTipBar({ hasReply: false }); env.render();
  assert.deepEqual(env.actions(), ['赞', '举报', '收藏', '+1']);
  const reply = new env.Element('a', '回复'); reply.className = 'labelfisrt-407af4';
  env.bar.insertBefore(reply, env.native['收藏']); env.render();
  assert.deepEqual(env.actions(), ['赞', '举报', '直接回复', '+1', '回复', '收藏']);
  const absent = setupTipBar({ hasContainer: false }); absent.context.renderBarragePanelTip();
  assert.deepEqual(absent.actions(), ['赞', '举报', '回复', '收藏']);
});

test('紧凑样式仅作用于播放器操作栏，不再全局加宽宿主按钮', () => {
  const css = source('BarragePanel.css');
  assert.match(css, /#comment-dzjy-container \.ex-barrage-tip-actions\s*\{[^}]*gap:\s*4px/s);
  assert.match(css, /#comment-dzjy-container \.ex-barrage-tip-actions > \.labelfisrt-407af4\s*\{[^}]*padding:\s*0 5px !important/s);
  assert.ok(!css.includes('padding: 0 17px'));
  assert.ok(!/^\.thirdBtn-06cde5/m.test(css));
});
