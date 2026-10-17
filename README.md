> [!CAUTION]
> **因斗鱼要求，2026-8-7起，DouyuEx 插件将无限期停止更新与发布，并关闭所有下载渠道。**

<p align="center">
    <a href="https://github.com/qianjiachun/douyuEx">
        <img src="https://s4.ax1x.com/2021/12/23/TGMxk8.png" width="150" height="150"/>
    </a>
    <h3 align="center">DouyuEx</h3>
    <br>
    <p align="center">
        <a href="https://github.com/qianjiachun/douyuEx"><img src="https://img.shields.io/github/languages/code-size/qianjiachun/douyuEx?color=blueviolet"></a>
        <a href="https://github.com/qianjiachun/douyuEx"><img src="https://img.shields.io/github/stars/qianjiachun/douyuEx?color=green"></a>
        <a href="https://github.com/qianjiachun/douyuEx"><img src="https://img.shields.io/github/commit-activity/m/qianjiachun/douyuEx?color=9cf"></a>
        <a href="https://github.com/qianjiachun/douyuEx"><img src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
    </p>
    <p align="center">
       Powerful Plugin For DouyuWeb<br>
    </p>
</p>

> `DouyuEx` 是基于 `原生JavaScript` 开发的 `TamperMonkey` 插件，用于增强斗鱼Web端体验。`DouyuEx` 集合斗鱼全端的特色功能，增强原生网页，复杂的操作一键完成，给用户沉浸式的直播体验。代码**开源**，功能**实用**，交互**友好**，不过度改变网页本来的结构，所有功能都在用户可控范围之内。

## 本分支新增：星推金币自动抽奖

基于小淳的[斗鱼自动抽星推金币](https://greasyfork.org/scripts/564995)（2026.05.13.01）整合，原作者及来源保留在模块注释中。

1. 执行 `npm ci`、`npm test`、`npm run build`，将 `dist/douyuex.user.js` 导入 Tampermonkey，或将 `dist/douyuex.js` 全文粘贴到原脚本编辑器保存。
2. 停用单独安装的“斗鱼自动抽星推金币”脚本，避免重复操作；刷新斗鱼页面。
3. 登录后打开[全民星推荐活动页](https://www.douyu.com/pages/new-anchor-support/)，或从直播间打开该活动，在金币余额旁点击“自动抽奖”。
4. 点击时从活动接口读取最新余额，每100金币十连抽，余下每10金币单抽，不足10金币保留；不会自动消耗运行期间新获得的金币。
5. 可点击“停止”，当前已发出的请求返回后停止。完成后刷新页面查看最新余额和探索记录。请求失败、超时或返回异常时停止，不自动重试；核对余额和探索记录后刷新重试。

功能仅在 `/pages/new-anchor-support/` 活动页加载，打开页面不会自行抽奖。房间参数优先取 URL 的 `rid`，其次取斗鱼直播间来源地址；独立打开且没有房间上下文时，沿用原脚本的 `4042402`。请求规则沿用原脚本的每次10金币。

本地测试使用模拟接口，不会消耗真实金币。首次安装后仍需在已登录的实际活动页验证按钮及接口可用性。

## DouyuEx-斗鱼直播间增强插件

## 🌐 官方网站

[https://www.douyuex.com/](https://www.douyuex.com/)


### 🎯 目标
1. 旨在扩展增强原版功能，优化用户体验
2. 安全，不做用户可控范围外的功能
3. 纯粹，不过分影响本来的网页功能
4. 不污染页面的结构
5. 使用简单，架构轻量，功能实用，交互友好
6. 集合移动端、客户端、web端特色功能
7. 原生代码，开发架构易扩展，易维护

### 📦 安装
1. [安装油猴脚本](https://www.crx4chrome.com/crx/1429/)，选择【Download crx file from crx4chrome】，将下载后的文件拖入浏览器进行安装，此步有问题的可以百度
2. 点击上方的安装脚本，安装本插件，若出现缺少";"的提示框，无视即可
3. 安装后，在礼物栏下方/鱼丸鱼翅左方会出现一个精灵球图标，点击显示功能条
- 插件基于TamperMonkey V4.10开发，若插件有无法使用的情况，请尝试[升级油猴版本](https://www.crx4chrome.com/crx/1429/)
- 若出现提示是否允许跨域访问的页面，一律选择**始终允许**即可

### 🚀 声明
- 本插件是本人课余兴趣开发，代码质量请勿吐槽
- 代码可供互联网的同好们参考研究，**引用请注明出处**
- 喜欢本插件的用户不妨点一下收藏或推荐给朋友，有建议或BUG请提交在greasyfork或github
- 本插件仅为提高日常观看体验，不做薅羊毛/恶性竞争等功能
- 作者：小淳 / QQ：189964430 / 交流Q群：977387881

### 💎功能
[功能介绍](https://html.douyuex.com/introduction/)

--------------------------------------------------

## 📕更新内容
[更新内容](https://html.douyuex.com/update/)

--------------------------------------------------

## ⚙如何维护与编译
[项目地址](https://github.com/qianjiachun/douyuEx)

1. 在`./src`下修改代码
2. `npm run build`
3. 把`./dist/douyuex.js`的代码复制到tampermonkey中去



> [如何编译与维护（已过期）](https://qianjiachun.github.io/DouyuEx/compile)

--------------------------------------------------
