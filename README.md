> [!CAUTION]
> **原作者公告：因斗鱼要求，2026-8-7起，DouyuEx 插件将无限期停止更新与发布，并关闭所有下载渠道。**
>
> 本仓库是 `chnone/douyuEx` 的个人维护分支。下方保留原项目介绍和作者信息；本分支的安装与更新请按[更新插件](#更新插件)操作。

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

## 更新插件

当前星推金币功能位于 [`feat/anchor-star-lottery` 分支](https://github.com/chnone/douyuEx/tree/feat/anchor-star-lottery)，脚本版本为 **2026.10.17.01**。下载源码时请选这个分支，`master` 暂未包含此功能。

本仓库目前不提交 `dist` 编译产物，需要先在本地生成安装脚本。插件内的“版本更新”和原项目网站仍指向原作者的渠道，不能用它们获取本分支的更新。

### 1. 获取并编译脚本

电脑需要已安装 Node.js（带 npm）和 Git。首次获取，在终端执行：

```sh
git clone --branch feat/anchor-star-lottery https://github.com/chnone/douyuEx.git
cd douyuEx
npm ci
npm test
npm run build
```

如果之前已经克隆了本仓库，且本地没有需要保留的未提交修改，在仓库目录执行：

```sh
git switch feat/anchor-star-lottery
git pull --ff-only origin feat/anchor-star-lottery
npm ci
npm test
npm run build
```

构建完成后使用 `dist/douyuex.user.js`。`src/main.js` 只是源码入口，不是完整安装脚本，请勿直接导入。

### 2. 在油猴中更新

以下以 Edge 浏览器的 Tampermonkey（油猴）为例。先确认浏览器已安装并启用 Tampermonkey。

1. 点击浏览器工具栏的油猴图标，打开“管理面板”。
2. 已安装 DouyuEx 的用户，点击 **DouyuEx-斗鱼直播间增强插件**，进入脚本编辑器。
3. 用文本编辑器打开刚生成的 `dist/douyuex.user.js`，复制**全部内容**；在油猴的原脚本编辑器中全选旧代码、粘贴替换，再保存（Windows：`Ctrl+S`；macOS：`Command+S`）。这是在原条目中更新代码，无需删除原脚本。
4. 返回管理面板，确认 DouyuEx 已启用，版本显示为 **2026.10.17.01**。

也可以使用管理面板的“实用工具”导入脚本文件，或将脚本全文粘贴到文本导入区域。如果弹出版本确认页，核对名称和版本后选择“更新”；如果提示“重新安装”并警告重置配置，请取消，改用上面的原脚本编辑器替换方式。

首次安装的用户可直接通过“实用工具”导入 `dist/douyuex.user.js`，在确认页选择“安装”。

### 3. 停用旧脚本并验证

1. 如果单独安装过 **斗鱼自动抽星推金币**，在油猴管理面板中关闭它的开关，保持 DouyuEx 启用，避免两套逻辑同时运行。
2. 刷新已打开的斗鱼页面。登录后打开或刷新[全民星推荐活动页](https://www.douyu.com/pages/new-anchor-support/)。
3. 金币余额旁出现“自动抽奖”按钮，说明活动页模块已加载。**打开页面不会自动开始抽奖**；点击按钮后才会消耗活动金币。
4. 如果按钮没有出现，先核对脚本版本和启用状态、旧脚本是否已停用，以及地址是否为上述活动页，再刷新页面。直播间页面不会显示这个按钮。

后续更新本分支时，重新拉取代码、编译，并重复油猴更新和刷新步骤；版本号以当次生成脚本顶部的 `@version` 为准。

## 本分支新增：星推金币自动抽奖

基于小淳的[斗鱼自动抽星推金币](https://greasyfork.org/scripts/564995)（2026.05.13.01）整合，原作者及来源保留在模块注释中。

1. 按[更新插件](#更新插件)完成安装或更新。
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
本分支请按上方[更新插件](#更新插件)操作。安装后，在直播间礼物栏下方/鱼丸鱼翅左方会出现一个精灵球图标，点击显示功能条。

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
