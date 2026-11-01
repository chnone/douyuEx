var fishBaitPurchase = { running: false, stop: false, needsReload: false, lastAttemptAt: 0 };

function FishBaitPurchase_config(config) {
  const list = config?.fishingConfig?.baitConfig?.baitList;
  if (!Array.isArray(list)) throw new Error("未能读取鱼饵配置");
  const matches = list.filter(item => Number(item?.baitLv) === 3);
  if (matches.length !== 1) throw new Error("高级鱼饵配置不唯一");
  const item = matches[0];
  const giftId = FishShop_count(item.giftId, "鱼饵礼物编号");
  if (!giftId || FishShop_count(item.giftNum) !== 4 || FishShop_count(item.singleGiftNum) !== 300) {
    throw new Error("高级鱼饵已不是每组 4 个礼物兑换 300 个，请到活动页核对");
  }
  const raw = item.giftPrice;
  const price = (typeof raw === "number" || (typeof raw === "string" && /^\d+(\.\d{1,2})?$/.test(raw))) ? Number(raw) * 100 : NaN;
  const rounded = Math.round(price);
  if (!Number.isSafeInteger(rounded) || rounded <= 0 || Math.abs(price - rounded) > 0.000001 || !Number.isSafeInteger(rounded * 12)) {
    throw new Error("鱼饵配置价格异常");
  }
  return { giftId, price: rounded };
}

async function FishBaitPurchase_quote(roomId) {
  const bait = FishBaitPurchase_config(await FishShop_config());
  const payload = await FishShop_publicJson(`https://gift.douyucdn.cn/api/gift/v5/web/list?rid=${encodeURIComponent(roomId)}&_=${Date.now()}`);
  if (!payload || (payload.error !== 0 && payload.error !== "0")) throw new Error("礼物列表未返回成功状态");
  const data = typeof payload.data === "string" ? JSON.parse(payload.data) : payload.data;
  if (!Array.isArray(data?.giftList)) throw new Error("礼物列表格式异常");
  const matches = data.giftList.filter(item => Number(item?.id) === bait.giftId);
  if (matches.length !== 1) throw new Error("当前房间未找到鱼饵对应礼物");
  const gift = matches[0];
  if (Number(gift.donateStatus) !== 1 || gift.priceInfo?.priceType !== "YUCHI") throw new Error("鱼饵礼物不可赠送或不是鱼翅价格");
  if (FishShop_count(gift.priceInfo.price, "礼物价格") !== bait.price) throw new Error("活动配置与礼物价格不一致");
  if (typeof gift.name !== "string" || !gift.name.trim()) throw new Error("礼物名称缺失");
  return { ...bait, name: gift.name };
}

function FishBaitPurchase_send(roomId, giftId) {
  // 官方 FishBaitBox -> COMMON_SENDGIFT -> sendGiftYC：业务参数平铺到 bizExt。
  // 同一礼物可兑换不同等级鱼饵，不能省略 fishingBait / bizId=3。
  return FishShop_response("https://www.douyu.com/japi/gift/donate/mainsite/v3", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      giftId: String(giftId), giftCount: "4", roomId: String(roomId), skinId: "0",
      bizExt: JSON.stringify({ type: "fishingBait", bizId: 3 })
    }).toString()
  });
}

async function FishBaitPurchase_run(view, roomId) {
  if (fishBaitPurchase.running || fishBaitPurchase.needsReload || Date.now() - fishBaitPurchase.lastAttemptAt < 2000) return;
  fishBaitPurchase.running = true;
  fishBaitPurchase.stop = false;
  fishBaitPurchase.lastAttemptAt = Date.now();
  const uid = getCookieValue("acf_uid"), day = FishShop_day();
  let completed = 0, cost = 0, pending = false;
  const summary = () => `已确认兑换 ${completed}/3 组高级鱼饵（${completed * 300} 个），赠送 ${completed * 4} 个礼物，核价合计 ${cost / 100} 鱼翅`;
  const check = () => { FishShop_checkContext(roomId, uid, day); return !fishBaitPurchase.stop; };
  view.busy(true);
  try {
    if (!check()) return;
    view.status("正在读取当期高级鱼饵礼物并核价…");
    const quote = await FishBaitPurchase_quote(roomId);
    if (!check()) { view.status("已停止：尚未购买鱼饵"); return; }
    if (!window.confirm(`向当前房间 ${roomId} 赠送「${quote.name}」4 × 3 = 12 个，兑换 3 组高级鱼饵（共 900 个）。\n合计 ${quote.price * 12 / 100} 鱼翅，使用现有余额，不自动充值。\n确认购买？`)) {
      view.status("已停止：已取消，未购买鱼饵");
      return;
    }
    for (let group = 0; group < 3; group++) {
      if (!check()) break;
      // 确认后、每笔扣费前重新核对活动与价格，配置变化时不沿用旧礼物。
      const latest = await FishBaitPurchase_quote(roomId);
      if (!check()) break;
      if (latest.giftId !== quote.giftId || latest.price !== quote.price || latest.name !== quote.name) throw new Error("鱼饵礼物或价格已变化，请重新核对");
      view.status(`正在兑换第 ${group + 1}/3 组：${quote.name} ×4（${quote.price * 4 / 100} 鱼翅）…`);
      pending = true;
      await FishBaitPurchase_send(roomId, quote.giftId);
      pending = false;
      completed++;
      cost += quote.price * 4;
      if (group < 2 && !fishBaitPurchase.stop) await sleep(700);
    }
    view.status(`${fishBaitPurchase.stop ? "已停止" : "鱼饵购买结束"}：${summary()}。重新打开鱼饵面板查看库存。`);
  } catch (error) {
    if (pending) fishBaitPurchase.needsReload = true;
    view.status(`已停止：${summary()}。${error.message}。${pending ? "最后一笔结果未确认，未重试，请核对鱼饵和消费记录后刷新。" : "未继续扣费。"}`);
  } finally {
    fishBaitPurchase.running = false;
    fishBaitPurchase.lastAttemptAt = Date.now();
    view.busy(false);
  }
}
