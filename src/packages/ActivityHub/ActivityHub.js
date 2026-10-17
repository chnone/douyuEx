function initPkg_ActivityHub() {
  const toolbar = document.querySelector(".ex-panel__wrap");
  if (!toolbar || document.getElementById("ex-activity-entry")) return;
  const entry = document.createElement("button");
  entry.id = "ex-activity-entry";
  entry.className = "ex-panel__icon";
  entry.type = "button";
  entry.title = "活动助手：图鉴领取、星推荐积分抽奖、鱼娘自动召唤、全力守护";
  entry.setAttribute("aria-label", "活动助手");
  entry.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="9" fill="#6b78e8"/><path d="M9 9h5v5H9zM18 9h5v5h-5zM9 18h5v5H9z" fill="white"/><path d="m20.5 17 1.2 2.3 2.6.4-1.9 1.8.5 2.5-2.4-1.2-2.3 1.2.4-2.5-1.8-1.8 2.6-.4z" fill="#ffe49c"/></svg>`;
  toolbar.appendChild(entry);

  const panel = document.createElement("section");
  panel.id = "ex-activity-hub";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "活动助手");
  panel.innerHTML = `<header><div><strong>活动助手</strong><small>手动开始 · 完成即停</small></div><button type="button" class="ex-activity-close" aria-label="关闭活动助手">×</button></header><div class="ex-activity-actions"><div><button type="button" data-kind="weekly">图鉴领取</button><p role="status" aria-live="polite">领取我的周图鉴奖励，间隔 0.5–2 秒。</p></div><div><button type="button" data-kind="star">星推荐积分抽奖</button><p role="status" aria-live="polite">包含抽奖返还的金币，抽至不足 10 金币。</p></div><div><button type="button" data-kind="fishRole">鱼娘自动召唤</button><p role="status" aria-live="polite">使用现有机会，包含重复形象返还次数，抽完即停。</p></div><div><button type="button" data-kind="guard">赠送全力守护 ×1</button><p role="status" aria-live="polite">当前房间 · 付费礼物 · 单次上限 1 元，赠送前核价。</p></div></div>`;
  document.body.appendChild(panel);
  const buttons = Array.from(panel.querySelectorAll("[data-kind]"));
  const stopAll = () => {
    fishWeeklyRewards.stop = true;
    anchorStarLottery.stop = true;
    guardGift.stop = true;
    fishRoleLottery.stop = true;
  };
  const tasks = {
    weekly: { state: fishWeeklyRewards, run: FishWeeklyRewards_runDirect, label: "图鉴领取" },
    star: { state: anchorStarLottery, run: AnchorStarLottery_run, label: "星推荐积分抽奖" },
    fishRole: { state: fishRoleLottery, run: FishRoleLottery_run, label: "鱼娘自动召唤" },
    guard: { state: guardGift, run: GuardGift_run, label: "赠送全力守护 ×1", single: true }
  };
  buttons.forEach(button => {
    const task = tasks[button.dataset.kind];
    const status = button.nextElementSibling;
    const view = {
      status(text) {
        status.textContent = text;
        if (/^(已领取 |领取结束|已停止|本周暂无|抽奖完毕|金币不足|鱼娘召唤结束|赠送成功|赠送未完成)/.test(text)) {
          const safe = text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
          showMessage(`【${task.label}】${safe}`, text.startsWith("赠送未完成") ? "error" : text.startsWith("已停止") ? "info" : "success", { timeout: 50 });
        }
      },
      busy(running) {
        buttons.forEach(other => {
          other.disabled = (running && (other !== button || task.single)) || tasks[other.dataset.kind].state.needsReload;
        });
        button.classList.toggle("is-running", running);
        button.textContent = running ? (task.single ? "正在处理赠送…" : `停止${task.label}`) : task.state.needsReload ? "刷新后重试" : task.label;
      }
    };
    button.addEventListener("click", () => {
      if (task.state.running) {
        task.state.stop = true;
        button.disabled = true;
        view.status("正在停止，等待当前请求结果…");
        return;
      }
      if (Object.values(tasks).some(item => item.state.running)) return;
      task.run(view, rid);
    });
  });
  entry.addEventListener("click", () => {
    hideExPanel();
    panel.hidden = false;
    panel.querySelector(".ex-activity-close").focus();
  });
  const close = () => { stopAll(); panel.hidden = true; entry.focus(); };
  panel.querySelector(".ex-activity-close").addEventListener("click", close);
  panel.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  window.addEventListener("pagehide", stopAll);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") stopAll(); });
}
