var fansContinueRunning = false;
var fansContinuePromptOpen = false;

function initPkg_FansContinue() {
  initPkg_FansContinue_Dom();
  initPkg_FansContinue_Func();
}

function initPkg_FansContinue_Dom() {
  FansContinue_insertIcon();
}
function FansContinue_insertIcon() {
  let a = document.createElement("div");
  a.className = "fans-continue";
  a.innerHTML =
    '<a class="ex-panel__icon" title="一键续牌"><img style="width: 32px;height: 32px;" src="https://gfs-op.douyucdn.cn/dygift/1705/7db9beee246848252f1c7fe916259f4e.png"/><i id="fans-continue__tip" class="ex-panel__tip"></i></a>';

  let b = document.getElementsByClassName("ex-panel__wrap")[0];
  b.insertBefore(a, b.childNodes[0]);
}

function initPkg_FansContinue_Func() {
  document.getElementsByClassName("fans-continue")[0].addEventListener("click", function () {
    if (fansContinueRunning || fansContinuePromptOpen) {
      showMessage("【续牌】正在处理，请勿重复点击", "info");
      return;
    }
    fansContinuePromptOpen = true;
    const saved = localStorage.getItem("ExSave_FansContinue");
    const defValue = saved != null ? saved : "1";
    PostbirdAlertBox.prompt({
      title: "每房间荧光棒数量（0为平均）；同时在当前房间发一次666",
      okBtn: "确定",
      cancelBtn: "取消",
      defaultValue: defValue,
      contentColor: "rgb(51,51,51)",
      onConfirm: function (res) {
        fansContinuePromptOpen = false;
        if (res == null || String(res).trim() === "") return;
        let sendNum = Number(res);
        if (!Number.isSafeInteger(sendNum) || sendNum < 0) return;
        localStorage.setItem("ExSave_FansContinue", String(res));
        FansContinue_startSend(sendNum);
      },
      onCancel: function () { fansContinuePromptOpen = false; }
    });
  });
}

// 仅对本次手动确认执行一次；不因空背包而漏掉当前房间弹幕。
async function FansContinue_startSend(sendNum) {
  if (fansContinueRunning || !Number.isSafeInteger(sendNum) || sendNum < 0) return;
  fansContinueRunning = true;
  try {
    try { await FansContinue_sendCurrentBarrage(); }
    catch (error) { showMessage("【续牌】当前房间666未发送：" + FansContinue_escape(error.message), "error"); }
    const ret = await FansContinue_fetch("https://www.douyu.com/japi/prop/backpack/web/v5?rid=" + encodeURIComponent(rid));
    const gift = ret.data?.list?.find(item => [268, 2358].includes(Number(item.id)) && Number.isSafeInteger(Number(item.count)) && Number(item.count) > 0);
    if (!gift) { showMessage("【续牌】没有荧光棒，已跳过赠送", "info"); return; }
    const html = await FansContinue_fetch("https://www.douyu.com/member/cp/getFansBadgeList", true);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const rooms = [...new Set(Array.from(doc.querySelectorAll(".fans-badge-list [data-fans-room]"), item => item.getAttribute("data-fans-room")).filter(id => /^[1-9]\d*$/.test(id)))];
    if (!rooms.length) { showMessage("【续牌】未找到粉丝牌房间，已跳过赠送", "info"); return; }
    let remaining = Number(gift.count);
    const amount = sendNum === 0 ? Math.floor(remaining / rooms.length) : sendNum;
    if (!amount) { showMessage("【续牌】荧光棒不足以平均赠送，已跳过赠送", "info"); return; }
    for (const roomId of rooms) {
      if (remaining < amount) { showMessage("【续牌】剩余荧光棒不足，已结束赠送", "info"); break; }
      await sleep(250);
      // 等待本次结果再发下一次；失败不重试，避免重复赠送。
      const data = await FansContinue_fetch("https://www.douyu.com/japi/prop/donate/mainsite/v1", false, {
        propId: gift.id, propCount: amount, roomId, bizExt: JSON.stringify({ yzxq: {} })
      });
      if (data.msg !== "success") throw new Error("荧光棒赠送失败，已停止：" + (data.msg || "接口未确认成功"));
      remaining -= amount;
      showMessage("【续牌】" + roomId + " 赠送荧光棒成功", "success");
    }
  } catch (error) {
    showMessage("【续牌】" + FansContinue_escape(error.message) + "；请核对后再试", "error");
  } finally { fansContinueRunning = false; }
}

function FansContinue_escape(text) {
  return String(text).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

async function FansContinue_fetch(url, asText = false, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const options = { credentials: "include", cache: "no-store", signal: controller.signal };
    if (body) {
      options.method = "POST";
      options.headers = { "Content-Type": "application/x-www-form-urlencoded" };
      options.body = new URLSearchParams(body).toString();
    }
    const response = await fetch(url, options);
    if (!response.ok) throw new Error("请求失败（HTTP " + response.status + "）");
    return await (asText ? response.text() : response.json());
  } catch (error) {
    if (error.name === "AbortError") throw new Error("请求超时，结果未确认，已停止");
    throw error;
  } finally { clearTimeout(timer); }
}

async function FansContinue_sendCurrentBarrage() {
  const input = document.querySelector(".ChatSend-txt");
  const button = document.querySelector(".ChatSend-button");
  if (!input || !button) throw new Error("弹幕输入框尚未就绪");
  if (!/^[1-9]\d*$/.test(String(getCookieValue("acf_uid")))) throw new Error("请先登录");
  if (button.disabled || button.classList.contains("is-gray") || button.getAttribute("aria-disabled") === "true") {
    throw new Error("当前无法发送，请等待冷却结束或检查禁言提示");
  }
  const isTextarea = input.tagName === "TEXTAREA";
  const read = () => isTextarea ? input.value : input.innerText;
  const write = text => {
    if (isTextarea) input.value = text; else input.innerText = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const draft = read();
  const draftHtml = isTextarea ? null : input.innerHTML;
  let subscription, timer;
  // 有连接回执时只以明确成功计数；无回执时提示提交，不宣称送达。
  let settle;
  const result = new Promise(resolve => { settle = resolve; });
  try {
    const stream = unsafeWindow.socketProxy?.socketStream;
    if (stream?.subscribe) subscription = stream.subscribe("chatres", data => {
      if (data.res === 0 || data.res === "0") settle({ ok: true });
      else if (data.res !== undefined) settle({ error: String(data.res) });
    });
    timer = setTimeout(() => settle({ unknown: true }), 6000);
    button.dataset.exPlainMessage = "1";
    write("666");
    button.click();
  } catch (error) {
    clearTimeout(timer);
    subscription?.unsubscribe?.();
    throw error;
  } finally {
    delete button.dataset.exPlainMessage;
    // 只恢复本次覆盖的草稿，保留发送过程中新输入的内容。
    if (read() === "" || read() === "666") {
      if (!isTextarea && typeof draftHtml === "string") {
        input.innerHTML = draftHtml;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } else write(draft);
    }
  }
  try {
    const status = await result;
    if (status.error) showMessage("【续牌】当前房间666发送失败（代码 " + FansContinue_escape(status.error) + "），未重试", "error");
    else showMessage(status.ok ? "【续牌】当前房间666已发送" : "【续牌】已提交当前房间666，尚未收到确认，请查看弹幕区", status.ok ? "success" : "info");
  } finally {
    clearTimeout(timer);
    subscription?.unsubscribe?.();
  }
}

async function sendGift_bag(gid, count, rid) {
  // 送背包里的东西
  // gid: 268是荧光棒
  // count: 数量
  // rid: 房间号
  const res = await fetch("https://www.douyu.com/japi/prop/donate/mainsite/v1", {
    method: "POST",
    mode: "no-cors",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "propId=" + gid + "&propCount=" + count + "&roomId=" + rid + "&bizExt=%7B%22yzxq%22%3A%7B%7D%7D"
  });
  return await res.json();
}
