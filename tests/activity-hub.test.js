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
