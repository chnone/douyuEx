function ActivityHub_url(kind, roomId) {
  if (!/^[1-9]\d*$/.test(String(roomId))) throw new Error("未识别到直播间，请刷新后再试");
  const path = kind === "weekly" ? "/pages/fish-act/acc" : "/pages/new-anchor-support/";
  const url = new URL(path, window.location.origin);
  url.searchParams.set("rid", roomId);
  url.searchParams.set("exActivity", kind);
  return url.href;
}

// 仅接收同源父窗口的停止信号；打开面板和切换页签都不会启动任务。
function ActivityHub_onStop(stop) {
  window.addEventListener("message", event => {
    if (window.parent !== window && event.source === window.parent &&
        event.origin === window.location.origin && event.data?.type === "douyuex:activity-stop") stop();
  });
}

function initPkg_ActivityHub() {
  const toolbar = document.querySelector(".ex-panel__wrap");
  if (!toolbar || document.getElementById("ex-activity-entry")) return;
  const entry = document.createElement("button");
  entry.id = "ex-activity-entry";
  entry.className = "ex-panel__icon";
  entry.type = "button";
  entry.title = "活动助手：图鉴领取、星推荐积分抽奖";
  entry.setAttribute("aria-label", "活动助手");
  entry.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="9" fill="#6b78e8"/><path d="M9 9h5v5H9zM18 9h5v5h-5zM9 18h5v5H9z" fill="white"/><path d="m20.5 17 1.2 2.3 2.6.4-1.9 1.8.5 2.5-2.4-1.2-2.3 1.2.4-2.5-1.8-1.8 2.6-.4z" fill="#ffe49c"/></svg>`;
  toolbar.appendChild(entry);

  const panel = document.createElement("section");
  panel.id = "ex-activity-hub";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "活动助手");
  panel.innerHTML = `<header><div><strong>活动助手</strong><small>手动开始 · 完成即停</small></div><button type="button" class="ex-activity-close" aria-label="关闭活动助手">×</button></header><div class="ex-activity-tabs" role="tablist" aria-label="活动"><button type="button" role="tab" data-kind="weekly" aria-selected="true">图鉴领取</button><button type="button" role="tab" data-kind="star" aria-selected="false">星推荐积分抽奖</button></div><p class="ex-activity-help"></p><div class="ex-activity-content"></div><p class="ex-activity-load" role="status"></p>`;
  document.body.appendChild(panel);
  const tabs = Array.from(panel.querySelectorAll("[role=tab]"));
  const help = panel.querySelector(".ex-activity-help");
  const content = panel.querySelector(".ex-activity-content");
  const loadStatus = panel.querySelector(".ex-activity-load");
  const frames = new Map();
  let current = "weekly";
  let loadTimer;
  const stopAll = () => frames.forEach(frame => frame.contentWindow?.postMessage({ type: "douyuex:activity-stop" }, window.location.origin));
  const select = kind => {
    if (current !== kind) stopAll();
    current = kind;
    tabs.forEach(tab => tab.setAttribute("aria-selected", String(tab.dataset.kind === kind)));
    help.textContent = kind === "weekly" ? "我的周图鉴 · 点击「领取周奖励」开始，间隔 0.5–2 秒。" : "使用星推金币 · 点击「自动抽奖」开始，可随时停止。";
    frames.forEach((frame, key) => { frame.hidden = key !== kind; });
    clearTimeout(loadTimer);
    loadStatus.textContent = "";
    if (frames.has(kind)) return;
    let src;
    try { src = ActivityHub_url(kind, rid); }
    catch (error) { loadStatus.textContent = error.message; return; }
    const frame = document.createElement("iframe");
    frame.title = kind === "weekly" ? "我的周图鉴" : "星推荐积分抽奖";
    frame.src = src;
    frames.set(kind, frame);
    content.appendChild(frame);
    loadStatus.textContent = "正在加载活动…";
    // 只提示一次，不轮询或自动重新加载活动。
    loadTimer = setTimeout(() => {
      loadStatus.textContent = "若活动未显示，请确认斗鱼已登录，然后关闭面板并刷新直播间。";
    }, 15000);
    frame.addEventListener("load", () => {
      if (current === kind) { clearTimeout(loadTimer); loadStatus.textContent = ""; }
    });
  };
  entry.addEventListener("click", () => {
    hideExPanel();
    panel.hidden = false;
    select(current);
    panel.querySelector(".ex-activity-close").focus();
  });
  const close = () => { stopAll(); panel.hidden = true; clearTimeout(loadTimer); entry.focus(); };
  panel.querySelector(".ex-activity-close").addEventListener("click", close);
  panel.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  tabs.forEach(tab => tab.addEventListener("click", () => select(tab.dataset.kind)));
}
