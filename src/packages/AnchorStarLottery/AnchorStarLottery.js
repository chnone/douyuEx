// 基于小淳「斗鱼自动抽星推金币」2026.05.13.01 整合。
// https://greasyfork.org/scripts/564995
var anchorStarLottery = { initialized: false, running: false, stop: false, needsReload: false };

function initPkg_AnchorStarLottery() {
  if (anchorStarLottery.initialized) return;
  anchorStarLottery.initialized = true;

  const style = document.createElement("style");
  style.textContent = `
    #ex-anchor-star-lottery { display:inline-flex; flex-shrink:0; align-items:center; margin:0 4px; padding:0; background:none; font-size:12px; line-height:1.5; }
    #ex-anchor-star-lottery button { box-sizing:border-box; min-width:62px; height:24px; padding:0 6px; border:1px solid #e4f5ff; border-radius:12px; background:linear-gradient(180deg,#91c9ff 0%,#627ff4 48%,#6554df 100%); box-shadow:inset 0 1px 1px #ffffff80,0 1px 3px #4359c540; color:#fff; font:inherit; font-weight:600; text-shadow:0 1px 1px #3a4ab966; white-space:nowrap; cursor:pointer; transition:filter .15s,box-shadow .15s; }
    #ex-anchor-star-lottery button:hover:not(:disabled) { filter:brightness(1.08); box-shadow:inset 0 1px 1px #ffffffaa,0 2px 5px #4359c550; }
    #ex-anchor-star-lottery button:active:not(:disabled) { filter:brightness(.96); box-shadow:inset 0 1px 3px #3847aa55; }
    #ex-anchor-star-lottery button:disabled { opacity:.6; cursor:default; }
    #ex-anchor-star-lottery button:focus-visible { outline:2px solid #4a55cd; outline-offset:2px; }
    #ex-anchor-star-lottery [role=status] { position:fixed; bottom:16px; left:16px; z-index:99999; box-sizing:border-box; width:280px; max-width:calc(100vw - 32px); padding:10px 12px; border:1px solid #e4f5ff; border-radius:12px; background:linear-gradient(135deg,#edfaff,#e7e7ff); box-shadow:0 3px 12px #4359c526; color:#3b51a4; white-space:normal; overflow-wrap:anywhere; cursor:default; }
    #ex-anchor-star-lottery [role=status]:empty { display:none; }
  `;
  document.head.appendChild(style);

  const controls = document.createElement("span");
  controls.id = "ex-anchor-star-lottery";
  const start = document.createElement("button");
  start.type = "button";
  start.textContent = "自动抽奖";
  start.title = "使用当前星推金币，先十连抽，再单抽；不足10金币保留";
  const stop = document.createElement("button");
  stop.type = "button";
  stop.textContent = "停止";
  stop.hidden = true;
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  controls.append(start, stop, status);

  const view = {
    status(text) { status.textContent = text; },
    busy(value) {
      start.disabled = value || anchorStarLottery.needsReload;
      start.hidden = value;
      start.textContent = anchorStarLottery.needsReload ? "刷新后重试" : value ? "抽奖中…" : "自动抽奖";
      stop.hidden = !value;
      stop.disabled = !value;
    }
  };
  start.addEventListener("click", () => AnchorStarLottery_run(view));
  stop.addEventListener("click", () => {
    anchorStarLottery.stop = true;
    stop.disabled = true;
    view.status("正在停止，等待当前请求返回…");
  });

  // 活动页异步加载、切换页签时可能重建余额区域，复用同一组控件和运行状态。
  const mount = () => {
    const balance = document.querySelector('[class*="index-module__balance--"]');
    if (balance && !balance.contains(controls)) balance.insertBefore(controls, balance.children[1] || null);
  };
  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("pagehide", () => {
    anchorStarLottery.stop = true;
    observer.disconnect();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      mount();
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
}

function AnchorStarLottery_roomId() {
  const page = new URL(window.location.href);
  const roomId = page.searchParams.get("rid");
  if (/^[1-9]\d*$/.test(roomId || "")) return roomId;
  // 在直播间内打开的活动 iframe，优先沿用来源直播间。
  try {
    const parent = new URL(document.referrer);
    if (/(^|\.)douyu\.com$/.test(parent.hostname)) {
      const match = parent.pathname.match(/^\/(?:beta\/)?([1-9]\d*)\/?$/);
      if (match) return match[1];
    }
  } catch (_) {}
  // 独立打开活动页且无房间上下文时，沿用原脚本参数。
  return "4042402";
}

async function AnchorStarLottery_request(path, num, roomId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const options = { credentials: "include", cache: "no-store", signal: controller.signal };
  if (num !== undefined) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" };
    options.body = new URLSearchParams({ ctn: getCCN(), rid: roomId, num: String(num) }).toString();
  }
  try {
    const response = await fetch("https://www.douyu.com/japi/livebiznc/web/anchorstardiscover" + path, options);
    if (!response.ok) throw new Error("请求失败（HTTP " + response.status + "）");
    const result = await response.json();
    // 必须明确返回成功；缺少 error 的响应不能当成已完成。
    if (!result || (result.error !== 0 && result.error !== "0")) {
      throw new Error(result && (result.message || result.msg) || "接口未返回成功状态");
    }
    return result.data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("请求超时，结果尚未确认");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function AnchorStarLottery_run(view) {
  if (anchorStarLottery.running || anchorStarLottery.needsReload) return;
  anchorStarLottery.running = true;
  anchorStarLottery.stop = false;
  let completed = 0;
  let total = 0;
  view.busy(true);
  try {
    view.status("正在读取最新金币余额…");
    const info = await AnchorStarLottery_request("/user/lottery/info");
    const rawCoins = info && info.myCoin;
    const coins = typeof rawCoins === "number" || (typeof rawCoins === "string" && /^\d+$/.test(rawCoins)) ? Number(rawCoins) : NaN;
    if (!Number.isSafeInteger(coins) || coins < 0) throw new Error("未能读取有效金币余额");
    total = Math.floor(coins / 10);
    if (!total) {
      view.status("金币不足10，未执行抽奖");
      return;
    }
    const roomId = AnchorStarLottery_roomId();
    // 以开始时余额为上限，不循环消耗抽奖期间新获得的金币。
    while (completed < total && !anchorStarLottery.stop) {
      const num = total - completed >= 10 ? 10 : 1;
      view.status(`抽奖中：已完成 ${completed}/${total} 次`);
      await AnchorStarLottery_request("/user/lottery/do", num, roomId);
      completed += num;
      view.status(`抽奖中：已完成 ${completed}/${total} 次`);
      if (completed < total && !anchorStarLottery.stop) await sleep(500);
    }
    view.status(`${completed === total ? "抽奖完毕" : "已停止"}：完成 ${completed}/${total} 次，消耗 ${completed * 10} 金币。刷新页面查看余额和探索记录。`);
  } catch (error) {
    // POST 超时或断网时服务端可能已扣币，禁止自动重试或继续下一批。
    anchorStarLottery.needsReload = true;
    view.status(`已停止，已确认完成 ${completed} 次：${error.message || "请求失败"}。请刷新页面核对余额和探索记录后重试。`);
  } finally {
    anchorStarLottery.running = false;
    view.busy(false);
  }
}
