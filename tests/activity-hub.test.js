const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/packages/ActivityHub/ActivityHub.js'), 'utf8');

test('油猴匹配钓鱼入口无斜杠、带查询参数和图鉴子路由', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const match = main.match(/@match\s+(\S+\/pages\/fish-act\S*)/)[1];
  const pattern = new RegExp('^' + match.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  for (const url of ['https://www.douyu.com/pages/fish-act', 'https://www.douyu.com/pages/fish-act?rid=123', 'https://www.douyu.com/pages/fish-act/acc?rid=123']) assert.ok(pattern.test(url), url);
});

const taskDefinitions = [
  ['weekly', 'fishWeeklyRewards', 'FishWeeklyRewards_runDirect', '图鉴领取'],
  ['star', 'anchorStarLottery', 'AnchorStarLottery_run', '星推荐积分抽奖'],
  ['fishRole', 'fishRoleLottery', 'FishRoleLottery_run', '鱼娘自动召唤'],
  ['fishBait', 'fishBaitPurchase', 'FishBaitPurchase_run', '高级鱼饵 ×3组'],
  ['fishStamp', 'fishStampExchange', 'FishStampExchange_run', '积分全换陪伴印章'],
  ['guard', 'guardGift', 'GuardGift_run', '赠送全力守护 ×1']
];

function setupHub({ toolbarPresent = true } = {}) {
  const nodes = new Map(), documentEvents = {}, windowEvents = {}, runs = [], notices = [];
  let focused = null, hideCalls = 0;
  class Element {
    constructor(tag) {
      this.tag = tag; this.children = []; this.listeners = {}; this.dataset = {};
      this.classes = new Set(); this.classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
    }
    set id(value) { this._id = value; nodes.set(value, this); }
    get id() { return this._id; }
    set innerHTML(value) {
      this.html = value;
      if (this.id !== 'ex-activity-hub') return;
      this.close = new Element('button');
      this.buttons = Array.from(value.matchAll(/<button type="button" data-kind="([^"]+)">([^<]+)<\/button><p[^>]*>([^<]+)<\/p>/g), match => {
        const button = new Element('button'), status = new Element('p');
        button.dataset.kind = match[1]; button.textContent = match[2]; status.textContent = match[3];
        button.nextElementSibling = status;
        return button;
      });
    }
    get innerHTML() { return this.html; }
    appendChild(child) { this.children.push(child); }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    querySelectorAll(selector) { return selector === '[data-kind]' ? this.buttons : []; }
    querySelector(selector) { return selector === '.ex-activity-close' ? this.close : null; }
    focus() { focused = this; }
    click() { if (!this.disabled) this.listeners.click?.(); }
  }
  const toolbar = new Element('div');
  const document = {
    body: new Element('body'), visibilityState: 'visible',
    createElement: tag => new Element(tag),
    querySelector: selector => selector === '.ex-panel__wrap' && toolbarPresent ? toolbar : null,
    getElementById: id => nodes.get(id),
    addEventListener: (name, callback) => { documentEvents[name] = callback; }
  };
  const context = vm.createContext({
    document, window: { addEventListener: (name, callback) => { windowEvents[name] = callback; } },
    rid: '3168536', hideExPanel: () => { hideCalls++; },
    showMessage: (...args) => notices.push(args)
  });
  for (const [kind, stateName, runName] of taskDefinitions) {
    const state = context[stateName] = { running: false, stop: false, needsReload: false };
    context[runName] = (view, roomId) => {
      state.running = true; state.stop = false; view.busy(true);
      runs.push({ kind, state, view, roomId });
    };
  }
  vm.runInContext(source, context);
  context.initPkg_ActivityHub();
  const panel = nodes.get('ex-activity-hub'), entry = nodes.get('ex-activity-entry');
  return {
    context, document, documentEvents, windowEvents, nodes, toolbar, panel, entry, runs, notices,
    button: kind => panel.buttons.find(button => button.dataset.kind === kind),
    focused: () => focused, hideCalls: () => hideCalls,
    finish() { const run = runs.at(-1); run.state.running = false; run.view.busy(false); }
  };
}

test('活动助手新增两个入口，初始化和打开均不会自动执行，重复初始化不重复挂载', () => {
  const env = setupHub();
  assert.deepEqual(env.panel.buttons.map(button => button.dataset.kind), taskDefinitions.map(item => item[0]));
  assert.equal(env.panel.hidden, true);
  assert.match(env.button('fishBait').nextElementSibling.textContent, /900.*12.*鱼翅.*确认.*不自动充值/);
  assert.match(env.button('fishStamp').nextElementSibling.textContent, /只用鱼塘积分.*陪伴印章.*先买贵的.*每日限购/);
  env.context.initPkg_ActivityHub();
  assert.equal(env.toolbar.children.length, 1); assert.equal(env.document.body.children.length, 1);
  env.entry.click();
  assert.equal(env.panel.hidden, false); assert.equal(env.hideCalls(), 1);
  assert.equal(env.focused(), env.panel.close); assert.equal(env.runs.length, 0);
  const absent = setupHub({ toolbarPresent: false });
  assert.equal(absent.panel, undefined); assert.equal(absent.document.body.children.length, 0);
});

for (const [kind, , , label] of taskDefinitions) test(`${label}仍传入当前房间，运行中与所有任务互斥`, () => {
  const env = setupHub(), button = env.button(kind);
  button.click();
  assert.equal(env.runs.length, 1); assert.equal(env.runs[0].kind, kind); assert.equal(env.runs[0].roomId, '3168536');
  assert.equal(button.classes.has('is-running'), true);
  for (const other of env.panel.buttons) {
    assert.equal(other.disabled, other !== button || kind === 'guard');
    if (other !== button) other.listeners.click();
  }
  assert.equal(env.runs.length, 1, '直接派发事件也不能绕过任务互斥');
  if (kind === 'guard') assert.equal(button.textContent, '正在处理赠送…');
  else {
    assert.equal(button.textContent, `停止${label}`);
    button.click();
    assert.equal(env.runs[0].state.stop, true); assert.equal(button.disabled, true);
    assert.match(button.nextElementSibling.textContent, /正在停止/);
    assert.equal(env.runs.length, 1);
  }
  env.finish();
  assert.equal(button.textContent, label); assert.equal(button.classes.has('is-running'), false);
  assert.ok(env.panel.buttons.every(item => item.disabled === false));
});

for (const trigger of ['close', 'escape', 'hidden', 'pagehide']) test(`${trigger}停止全部任务，包括鱼饵购买与印章兑换`, () => {
  const env = setupHub();
  env.entry.click(); env.button('fishBait').click();
  if (trigger === 'close') env.panel.close.click();
  if (trigger === 'escape') env.panel.listeners.keydown({ key: 'Escape' });
  if (trigger === 'hidden') { env.document.visibilityState = 'hidden'; env.documentEvents.visibilitychange(); }
  if (trigger === 'pagehide') env.windowEvents.pagehide();
  for (const [, stateName] of taskDefinitions) assert.equal(env.context[stateName].stop, true, stateName);
  if (trigger === 'close' || trigger === 'escape') {
    assert.equal(env.panel.hidden, true); assert.equal(env.focused(), env.entry);
  }
  assert.equal(env.runs.length, 1);
});

test('页面保持可见不会停止任务，未确认结果锁定本项但不阻塞其他任务', () => {
  const env = setupHub();
  env.button('fishBait').click(); env.documentEvents.visibilitychange();
  assert.equal(env.context.fishBaitPurchase.stop, false);
  env.context.fishBaitPurchase.needsReload = true; env.finish();
  assert.equal(env.button('fishBait').disabled, true); assert.equal(env.button('fishBait').textContent, '刷新后重试');
  env.button('fishBait').click(); assert.equal(env.runs.length, 1);
  env.button('fishStamp').click(); assert.equal(env.runs.length, 2); env.finish();
  assert.equal(env.button('fishBait').disabled, true); assert.equal(env.button('fishStamp').disabled, false);
});

for (const [kind, prefix] of [['fishBait', '鱼饵购买结束'], ['fishStamp', '印章兑换结束']]) test(`${prefix}显示左下角提示并转义动态礼物名称`, () => {
  const env = setupHub(); env.button(kind).click();
  const text = `${prefix}：<img src=x onerror="bad"> & '礼物'`;
  env.runs[0].view.status(text);
  assert.equal(env.button(kind).nextElementSibling.textContent, text);
  assert.equal(env.notices.length, 1); assert.equal(env.notices[0][1], 'success');
  assert.ok(env.notices[0][0].includes('&lt;img'));
  assert.ok(!env.notices[0][0].includes('<img'));
  env.runs[0].view.status('已停止：最后一笔结果未确认');
  assert.equal(env.notices.at(-1)[1], 'info');
});
