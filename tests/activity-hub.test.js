const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/packages/ActivityHub/ActivityHub.js'), 'utf8');

test('活动入口携带当前房间并直接打开图鉴，不携带自动开始指令', () => {
  const ctx = vm.createContext({ URL, window: { location: { origin: 'https://www.douyu.com' } } });
  vm.runInContext(source, ctx);
  assert.equal(ctx.ActivityHub_url('weekly', 3168536), 'https://www.douyu.com/pages/fish-act/acc?rid=3168536&exActivity=weekly');
  assert.equal(ctx.ActivityHub_url('star', 3168536), 'https://www.douyu.com/pages/new-anchor-support/?rid=3168536&exActivity=star');
  assert.throws(() => ctx.ActivityHub_url('weekly', 'abc'), /未识别到直播间/);
});

test('关闭面板停止任务的消息仅接受同源父窗口，其他来源和开始指令无效', () => {
  const parent = {}, handlers = {};
  let stops = 0;
  const ctx = vm.createContext({ window: { parent, location: { origin: 'https://www.douyu.com' }, addEventListener: (type, fn) => { handlers[type] = fn; } } });
  vm.runInContext(source, ctx);
  ctx.ActivityHub_onStop(() => stops++);
  const event = { origin: 'https://www.douyu.com', source: parent, data: { type: 'douyuex:activity-stop' } };
  handlers.message({ ...event, source: {} });
  handlers.message({ ...event, origin: 'https://evil.example' });
  handlers.message({ ...event, data: { type: 'start' } });
  assert.equal(stops, 0);
  handlers.message(event);
  assert.equal(stops, 1);
});

test('油猴匹配钓鱼入口无斜杠、带查询参数和图鉴子路由', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const match = main.match(/@match\s+(\S+\/pages\/fish-act\S*)/)[1];
  const pattern = new RegExp('^' + match.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  for (const url of ['https://www.douyu.com/pages/fish-act', 'https://www.douyu.com/pages/fish-act?rid=123', 'https://www.douyu.com/pages/fish-act/acc?rid=123']) assert.ok(pattern.test(url), url);
});
