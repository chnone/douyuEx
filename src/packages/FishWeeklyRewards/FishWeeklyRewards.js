// 沿用官方图鉴页面交互；不构造领奖接口，不自动钓鱼或消耗道具。
var fishWeeklyRewards = { initialized: false, running: false, stop: false, needsReload: false };

function FishWeeklyRewards_delay(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function FishWeeklyRewards_run(view) {
  if (fishWeeklyRewards.running || fishWeeklyRewards.needsReload) return;
  fishWeeklyRewards.running = true;
  fishWeeklyRewards.stop = false;
  let completed = 0;
  const rewards = [];
  const check = () => {
    if (!view.active()) throw new Error("已离开我的周图鉴，请重新打开后再领取");
    return !fishWeeklyRewards.stop;
  };
  view.busy(true);
  try {
    if (!check()) return;
    const total = view.cards().length;
    if (!total) {
      view.status("本周暂无可领取奖励");
      return;
    }
    if (view.popup()) throw new Error("请先关闭已打开的奖励详情");
    for (let index = 0; index < total; index++) {
      if (!check()) break;
      const card = view.cards()[0];
      if (!card) break;
      view.status(`准备领取第 ${completed + 1}/${total} 张，可随时停止`);
      await view.pause(FishWeeklyRewards_delay(500, 2000));
      if (!check()) break;
      if (!view.cards().includes(card)) throw new Error("图鉴状态发生变化，请重新检查");
      view.open(card);
      const popup = await view.wait(() => view.popup(), check);
      if (!check()) break;
      const claim = view.claimButton(popup);
      if (!claim) throw new Error("未找到可领取按钮，已停止");
      const reward = view.rewardName(popup);
      view.status(`正在领取第 ${completed + 1}/${total} 张，等待确认…`);
      view.claim(claim);
      // 提交后即使手动停止，也等待本张结果；不重复点击或自动重试。
      await view.wait(() => view.claimed(popup), () => {
        if (!view.active()) throw new Error("页面已离开，当前领取结果未确认");
      });
      completed++;
      if (reward) rewards.push(reward);
      view.status(`已领取 ${completed}/${total} 张${reward ? `：${reward}` : ""}`);
      if (!check()) break;
      view.close(popup);
      await view.wait(() => !view.popup() && !view.cards().includes(card), check);
    }
    view.status(`${fishWeeklyRewards.stop ? "已停止" : "领取结束"}：已确认领取 ${completed} 张${rewards.length ? `；${rewards.join("、")}` : ""}`);
  } catch (error) {
    // 缺少成功确认时锁住本轮，刷新核对后才能重新尝试。
    fishWeeklyRewards.needsReload = true;
    view.status(`已停止：已确认领取 ${completed} 张${rewards.length ? `；${rewards.join("、")}` : ""}。${error.message}。请刷新核对后再试。`);
  } finally {
    fishWeeklyRewards.running = false;
    view.busy(false);
  }
}

function initPkg_FishWeeklyRewards() {
  if (fishWeeklyRewards.initialized) return;
  fishWeeklyRewards.initialized = true;
  // 使用官方独有的模块类名，布局更新时不匹配就不执行，避免点错控件。
  const root = () => document.querySelector(".wrap--z19LH");
  const active = () => {
    const book = root();
    return document.visibilityState === "visible" && !!book &&
      !!book.querySelector(".btns--a72T9.tab2--Ueatu") &&
      !!book.querySelector(".header--DFnbh > .tab1--emaD_");
  };
  const popup = () => document.querySelector(".pop--P1zqP");
  const cards = () => Array.from(root()?.querySelectorAll("li") || []).filter(card =>
    card.querySelector(".needGet--Msxfs")?.textContent.trim() === "点击领取图鉴奖励");
  const controls = document.createElement("div");
  controls.id = "ex-fish-weekly-rewards";
  const start = document.createElement("button");
  start.type = "button";
  start.textContent = "领取周奖励";
  const stop = document.createElement("button");
  stop.type = "button";
  stop.textContent = "停止";
  stop.hidden = true;
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "逐张领取，仅处理已点亮奖励";
  controls.append(start, stop, status);
  const style = document.createElement("style");
  style.textContent = `
    #ex-fish-weekly-rewards { display:flex; align-items:center; gap:6px; margin:4px 10px 8px; padding:6px 8px; border:1px solid #d9f5ff; border-radius:8px; background:linear-gradient(135deg,#def6ff,#b5ddf7); color:#215880; font:12px/1.5 "Microsoft YaHei",sans-serif; }
    #ex-fish-weekly-rewards.is-running { position:fixed; z-index:2147483647; left:8px; right:8px; bottom:12px; margin:0; box-shadow:0 3px 12px #143e7850; }
    #ex-fish-weekly-rewards[hidden],#ex-fish-weekly-rewards button[hidden] { display:none; }
    #ex-fish-weekly-rewards button { flex-shrink:0; padding:4px 10px; border:1px solid #fff2bc; border-radius:14px; background:linear-gradient(#fff1bf,#f7cf70); color:#82551d; box-shadow:inset 0 1px #fff; font:inherit; font-weight:bold; cursor:pointer; }
    #ex-fish-weekly-rewards button:disabled { opacity:.55; cursor:default; }
    #ex-fish-weekly-rewards button:focus-visible { outline:2px solid #176cae; outline-offset:2px; }
    #ex-fish-weekly-rewards [role=status] { min-width:0; max-height:72px; overflow:auto; overflow-wrap:anywhere; }
  `;
  document.head.appendChild(style);
  const view = {
    active, cards, popup,
    status(text) {
      status.textContent = text;
      // 只通知关键结果，避免每个等待步骤刷屏；直播间沿用统一左下角提示。
      if (/^(已领取 |领取结束|已停止：|本周暂无)/.test(text) && window.parent !== window) {
        window.parent.postMessage({ type: "douyuex:fish-weekly-reward-notice", text,
          level: text.includes("请刷新核对") ? "error" : text.startsWith("已停止") ? "info" : "success"
        }, window.location.origin);
      }
    },
    busy(value) {
      controls.classList.toggle("is-running", value);
      if (value) document.body.appendChild(controls);
      else mount();
      start.hidden = value;
      start.disabled = value || fishWeeklyRewards.needsReload;
      start.textContent = fishWeeklyRewards.needsReload ? "刷新后重试" : "领取周奖励";
      stop.hidden = !value;
      stop.disabled = !value;
    },
    pause(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },
    async wait(predicate, guard) {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        // guard 的 false 表示手动停止，仍观察已经发起的页面变化。
        guard();
        const result = predicate();
        if (result) return result;
        await view.pause(200);
      }
      throw new Error("未收到页面成功确认，不再继续领取");
    },
    open(card) { card.scrollIntoView({ block: "center", behavior: "smooth" }); card.click(); },
    claimButton(pop) {
      if (!pop.isConnected || popup() !== pop) return null;
      const button = pop.querySelector(".btn--Th0qg.avaliable--efGiW");
      return button?.textContent.trim() === "领取奖励" ? button : null;
    },
    rewardName(pop) { return pop.querySelector("h3")?.textContent.trim() || ""; },
    claim(button) { button.click(); },
    claimed(pop) { return pop.isConnected && pop.querySelector(".btn--Th0qg.used--_rwlG")?.textContent.trim() === "已领取"; },
    close(pop) {
      const button = pop.querySelector(".close--DFKH_");
      if (!button) throw new Error("奖励弹窗关闭按钮已变化");
      button.click();
    }
  };
  start.addEventListener("click", () => FishWeeklyRewards_run(view));
  stop.addEventListener("click", () => {
    fishWeeklyRewards.stop = true;
    stop.disabled = true;
    view.status("正在停止，等待当前步骤结束…");
  });
  const mount = () => {
    const header = root()?.querySelector(".header--DFnbh");
    if (!fishWeeklyRewards.running && header && controls.parentNode !== header.parentNode) header.after(controls);
    const visible = active();
    controls.hidden = !visible;
    if (fishWeeklyRewards.running && !visible) fishWeeklyRewards.stop = true;
  };
  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", mount);
  window.addEventListener("pagehide", () => { fishWeeklyRewards.stop = true; observer.disconnect(); });
  window.addEventListener("pageshow", event => {
    if (event.persisted) { mount(); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] }); }
  });
}


var fishWeeklyNoticeBridgeInitialized = false;
function initPkg_FishWeeklyRewards_NoticeBridge() {
  if (fishWeeklyNoticeBridgeInitialized) return;
  fishWeeklyNoticeBridgeInitialized = true;
  window.addEventListener("message", event => {
    const data = event.data;
    if (event.origin !== window.location.origin || !data || data.type !== "douyuex:fish-weekly-reward-notice") return;
    const isFishFrame = Array.from(document.querySelectorAll("iframe")).some(frame => {
      if (frame.contentWindow !== event.source) return false;
      try {
        const url = new URL(frame.src, window.location.href);
        return url.origin === window.location.origin && /^\/pages\/fish-act(?:\/|$)/.test(url.pathname);
      } catch (_) { return false; }
    });
    if (!isFishFrame || typeof data.text !== "string" || data.text.length > 2000) return;
    // NoticeJs 支持 HTML，来自活动页的奖励名称必须先转义。
    const text = data.text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    showMessage(`【周图鉴】${text}`, ["success", "info", "error"].includes(data.level) ? data.level : "info", { timeout: 50 });
  });
}
