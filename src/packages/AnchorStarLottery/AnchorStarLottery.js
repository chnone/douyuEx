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
    #ex-anchor-star-lottery-status { position:fixed; bottom:16px; left:16px; z-index:2147483647; box-sizing:border-box; width:280px; max-width:calc(100vw - 32px); padding:10px 12px; border:1px solid #e4f5ff; border-radius:12px; background:linear-gradient(135deg,#edfaff,#e7e7ff); box-shadow:0 3px 12px #4359c526; color:#3b51a4; font:12px/1.5 "Microsoft YaHei",sans-serif; text-align:left; pointer-events:none; white-space:normal; overflow-wrap:anywhere; cursor:default; }
    #ex-anchor-star-lottery-status:empty { display:none; }
  `;
  document.head.appendChild(style);

  const controls = document.createElement("span");
  controls.id = "ex-anchor-star-lottery";
  const start = document.createElement("button");
  start.type = "button";
  start.textContent = "自动抽奖";
  start.title = "包含中奖返还的金币，先十连抽，再单抽；抽至不足10金币，可随时停止";
  const stop = document.createElement("button");
  stop.type = "button";
  stop.textContent = "停止";
  stop.hidden = true;
  const status = document.createElement("span");
  status.id = "ex-anchor-star-lottery-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  controls.append(start, stop);
  // 脱离余额区域的层叠上下文，防止任务奖品图标盖住提示。
  document.body.appendChild(status);

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

// 抽奖结果与官方奖品弹窗共用 prizeList / prizeDesc / prizeNum 字段。
function AnchorStarLottery_rewards(data) {
  let count = 0;
  let complete = true;
  if (!data || !Array.isArray(data.prizeList) || !data.prizeList.length) return { count, complete: false };
  for (const prize of data.prizeList) {
    if (!prize || typeof prize.prizeDesc !== "string" || !prize.prizeDesc.trim()) {
      complete = false;
      continue;
    }
    if (prize.prizeDesc.trim() !== "星光棒") continue;
    const raw = prize.prizeNum;
    const num = typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw)) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(num) || num < 0 || !Number.isSafeInteger(count + num)) {
      complete = false;
      continue;
    }
    count += num;
  }
  return { count, complete };
}

async function AnchorStarLottery_run(view, roomId = AnchorStarLottery_roomId()) {
  if (anchorStarLottery.running || anchorStarLottery.needsReload) return;
  anchorStarLottery.running = true;
  anchorStarLottery.stop = false;
  let completed = 0;
  let coins = null;
  let starSticks = 0;
  let rewardsComplete = true;
  const rewardSummary = () => rewardsComplete
    ? `获得星光棒 ${starSticks} 个`
    : `已确认获得星光棒 ${starSticks} 个（部分奖励未能读取，请核对探索记录）`;
  view.busy(true);
  try {
    view.status("正在读取最新金币余额…");
    if (!/^[1-9]\d*$/.test(String(roomId))) throw new Error("未识别到直播间");
    const readBalance = async () => {
      const info = await AnchorStarLottery_request("/user/lottery/info");
      const raw = info && info.myCoin;
      const value = typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw)) ? Number(raw) : NaN;
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("未能读取有效金币余额");
      return value;
    };
    coins = await readBalance();
    if (coins < 10 && !anchorStarLottery.stop) {
      view.status(`金币不足10，未执行抽奖；余额 ${coins} 金币`);
      return;
    }
    // 每轮只依据最新服务端余额决定十连或单抽，包含本轮中奖返还的金币。
    while (coins >= 10 && !anchorStarLottery.stop) {
      const num = coins >= 100 ? 10 : 1;
      view.status(`抽奖中：已完成 ${completed} 次，余额 ${coins} 金币`);
      coins = null;
      const result = await AnchorStarLottery_request("/user/lottery/do", num, roomId);
      completed += num;
      const rewards = AnchorStarLottery_rewards(result);
      starSticks += rewards.count;
      rewardsComplete = rewardsComplete && rewards.complete;
      view.status(`抽奖中：已完成 ${completed} 次，${rewardSummary()}，正在确认余额…`);
      if (anchorStarLottery.stop) break;
      await sleep(500);
      if (anchorStarLottery.stop) break;
      coins = await readBalance();
    }
    view.status(`${anchorStarLottery.stop ? "已停止" : "抽奖完毕"}：完成 ${completed} 次，累计消耗 ${completed * 10} 金币，${rewardSummary()}。${coins === null ? "余额请刷新查看" : `剩余 ${coins} 金币`}。`);
  } catch (error) {
    // POST 超时或断网时服务端可能已扣币，禁止自动重试或继续下一批。
    anchorStarLottery.needsReload = true;
    view.status(`已停止，已确认完成 ${completed} 次，${rewardSummary()}：${error.message || "请求失败"}。请刷新页面核对余额和探索记录后重试。`);
  } finally {
    anchorStarLottery.running = false;
    view.busy(false);
  }
}
