// 与官方「我的形象 → 召唤鱼娘」共用 panelInfo / lottery。
// 只使用已有召唤机会；每轮重新读余额，包含重复形象自动回收返还的机会。
var fishRoleLottery = { running: false, stop: false, needsReload: false };

function FishRoleLottery_count(value) {
  const number = typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value)) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("召唤次数数据异常");
  return number;
}

async function FishRoleLottery_request(path, roomId, batch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const url = new URL("https://www.douyu.com/japi/revenuenc/web/actfans/userLottery/" + path);
  const options = { credentials: "include", cache: "no-store", signal: controller.signal };
  if (batch !== undefined) {
    if (batch !== 1 && batch !== 10) { clearTimeout(timer); throw new Error("召唤批次数量异常"); }
    options.method = "POST";
    options.headers = { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" };
    options.body = new URLSearchParams({ rid: String(roomId), batch: String(batch), ctn: getCCN() }).toString();
  } else {
    url.search = new URLSearchParams({ rid: String(roomId) }).toString();
  }
  try {
    const response = await fetch(url.href, options);
    if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
    const result = await response.json();
    if (!result || (result.error !== 0 && result.error !== "0")) throw new Error(result?.message || result?.msg || "接口未返回成功状态");
    return result.data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("请求超时，召唤结果尚未确认");
    throw error;
  } finally { clearTimeout(timer); }
}

function FishRoleLottery_refunds(data) {
  if (!data || typeof data !== "object") return null;
  // 官方页面在没有回收时允许省略 resolveInfo，其他异常不当作零返还。
  if (data.resolveInfo === undefined && (Array.isArray(data.cardList) || Array.isArray(data.awardList))) return { cards: 0, chances: 0 };
  const info = data.resolveInfo;
  if (!info || typeof info !== "object" || Array.isArray(info)) return null;
  try {
    return { cards: FishRoleLottery_count(info.num === undefined ? 0 : info.num), chances: FishRoleLottery_count(info.totalScore === undefined ? 0 : info.totalScore) };
  } catch (_) { return null; }
}

async function FishRoleLottery_run(view, roomId) {
  if (fishRoleLottery.running || fishRoleLottery.needsReload) return;
  fishRoleLottery.running = true;
  fishRoleLottery.stop = false;
  let completed = 0, recycled = 0, refunded = 0, remaining = null, complete = true;
  const summary = () => `已确认召唤 ${completed} 次，${complete ? "" : "已确认"}回收重复形象 ${recycled} 张、返还 ${refunded} 次机会${complete ? "" : "（部分返还数据未能读取）"}`;
  view.busy(true);
  try {
    if (!/^[1-9]\d*$/.test(String(roomId))) throw new Error("未识别到直播间");
    const uid = getCookieValue("acf_uid");
    if (!/^[1-9]\d*$/.test(String(uid))) throw new Error("请先登录斗鱼");
    const checkAccount = () => {
      if (String(getCookieValue("acf_uid")) !== String(uid)) throw new Error("账号已切换");
    };
    const readBalance = async () => {
      checkAccount();
      const data = await FishRoleLottery_request("panelInfo", roomId);
      return FishRoleLottery_count(data?.lotteryInfo?.score);
    };
    view.status("正在读取鱼娘召唤机会…");
    remaining = await readBalance();
    while (remaining > 0 && !fishRoleLottery.stop) {
      checkAccount();
      // 不使用需要额外解锁的百连；不足十次时逐次召唤。
      const batch = remaining >= 10 ? 10 : 1;
      view.status(`召唤中：已完成 ${completed} 次，剩余 ${remaining} 次机会，即将${batch === 10 ? "十连" : "单抽"}…`);
      remaining = null;
      const data = await FishRoleLottery_request("lottery", roomId, batch);
      completed += batch;
      const refunds = FishRoleLottery_refunds(data);
      if (refunds) { recycled += refunds.cards; refunded += refunds.chances; }
      else { complete = false; }
      view.status(`召唤中：${summary()}，正在确认剩余机会…`);
      if (fishRoleLottery.stop) break;
      await sleep(500 + Math.floor(Math.random() * 1501));
      if (fishRoleLottery.stop) break;
      remaining = await readBalance();
    }
    view.status(`${fishRoleLottery.stop ? "已停止" : "鱼娘召唤结束"}：${summary()}。${remaining === null ? "剩余机会请重新打开我的形象查看" : `剩余 ${remaining} 次机会`}。`);
  } catch (error) {
    fishRoleLottery.needsReload = true;
    view.status(`已停止：${summary()}。${error.message}。未重试，请重新打开我的形象核对机会和召唤记录后刷新重试。`);
  } finally {
    fishRoleLottery.running = false;
    view.busy(false);
  }
}
