// 全力守护：官方礼物列表 ID 24478，价格单位为 0.01 鱼翅。
// 每次手动点击仅送 1 个，上限 100 个价格单位（1 鱼翅，约 1 元）。
var guardGift = { running: false, stop: false, needsReload: false, lastAttemptAt: 0 };

function GuardGift_readPrice(roomId) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url: `https://gift.douyucdn.cn/api/gift/v5/web/list?rid=${encodeURIComponent(roomId)}&_=${Date.now()}`,
      anonymous: true,
      timeout: 15000,
      onload(response) {
        try {
          if (response.status !== 200) throw new Error("读取礼物价格失败");
          const payload = JSON.parse(response.responseText);
          if (payload.error !== 0 && payload.error !== "0") throw new Error("礼物列表未返回成功状态");
          const data = typeof payload.data === "string" ? JSON.parse(payload.data) : payload.data;
          if (!Array.isArray(data?.giftList)) throw new Error("礼物列表格式异常");
          const matches = data.giftList.filter(item => Number(item?.id) === 24478);
          if (matches.length !== 1 || matches[0].name !== "全力守护") throw new Error("当前房间未找到全力守护，未赠送");
          const gift = matches[0];
          if (Number(gift.donateStatus) !== 1) throw new Error("当前房间暂不能赠送全力守护");
          const raw = gift.priceInfo?.price;
          const price = typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw)) ? Number(raw) : NaN;
          if (gift.priceInfo?.priceType !== "YUCHI" || !Number.isSafeInteger(price) || price <= 0) throw new Error("未能确认鱼翅价格，未赠送");
          if (price > 100) throw new Error(`当前价格 ${price / 100} 鱼翅，超过单次 1 元上限，未赠送`);
          resolve(price);
        } catch (error) { reject(error); }
      },
      onerror: () => reject(new Error("读取礼物价格失败，未赠送")),
      ontimeout: () => reject(new Error("读取礼物价格超时，未赠送"))
    });
  });
}

async function GuardGift_send(roomId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("https://www.douyu.com/japi/gift/donate/mainsite/v1", {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ giftId: "24478", giftCount: "1", roomId: String(roomId), bizExt: JSON.stringify({ yzxq: {} }) }).toString()
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}，赠送结果未确认`);
    const result = await response.json();
    if (!result || (result.error !== 0 && result.error !== "0")) {
      throw new Error(result?.msg || result?.message || "接口未确认赠送成功");
    }
    return result;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("请求超时，赠送结果未确认");
    throw error;
  } finally { clearTimeout(timer); }
}

async function GuardGift_run(view, roomId) {
  if (guardGift.running || guardGift.needsReload) return;
  // 拦住首次请求极快返回后的双击，避免连续扣费。
  if (Date.now() - guardGift.lastAttemptAt < 2000) return;
  guardGift.running = true;
  guardGift.stop = false;
  guardGift.lastAttemptAt = Date.now();
  let submitted = false;
  view.busy(true);
  try {
    if (!/^[1-9]\d*$/.test(String(roomId))) throw new Error("未识别到当前直播间");
    const uid = getCookieValue("acf_uid");
    if (!/^[1-9]\d*$/.test(String(uid))) throw new Error("请先登录斗鱼");
    view.status("正在核对全力守护价格…");
    const price = await GuardGift_readPrice(roomId);
    if (guardGift.stop) { view.status("已停止：尚未赠送全力守护"); return; }
    // 核价期间切换账号时取消，避免使用另一个账号余额。
    if (String(getCookieValue("acf_uid")) !== String(uid)) throw new Error("账号已切换，请重新操作");
    view.status(`正在向房间 ${roomId} 赠送全力守护 ×1（${price / 100} 鱼翅）…`);
    submitted = true;
    await GuardGift_send(roomId);
    view.status(`赠送成功：房间 ${roomId}，全力守护 ×1（核价 ${price / 100} 鱼翅）。`);
  } catch (error) {
    // 已发出的付费请求不重试；无法确认时先由用户核对消费记录。
    if (submitted) guardGift.needsReload = true;
    view.status(`赠送未完成：${error.message}。${submitted ? "未重试，请核对消费记录后刷新。" : "未发起付费赠送。"}`);
  } finally {
    guardGift.running = false;
    view.busy(false);
  }
}
