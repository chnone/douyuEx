var fishStampExchange = { running: false, stop: false, needsReload: false, lastAttemptAt: 0 };

function FishStampExchange_catalog(config) {
  if (!Array.isArray(config?.marketingAwardList)) throw new Error("商城奖励配置异常");
  const catalog = new Map();
  for (const group of config.marketingAwardList) {
    if (Number(group?.awardType) !== 5 || !Array.isArray(group.awardList)) continue;
    for (const award of group.awardList) {
      if (award?.awardName !== "陪伴印章" || Number(award.awardId) !== 3410) continue;
      const index = award.awardIndex;
      const cost = FishShop_count(award.exchangeWei, "印章兑换价格");
      const count = FishShop_count(award.num, "印章数量");
      if (typeof index !== "string" || !index.trim() || index.length > 128 || !cost || !count || catalog.has(index)) {
        throw new Error("陪伴印章兑换档位异常");
      }
      catalog.set(index, { index, cost, count });
    }
  }
  if (!catalog.size) throw new Error("当前商城未找到可核实的陪伴印章配置");
  return catalog;
}

function FishStampExchange_panel(data, catalog) {
  const balance = FishShop_count(data?.num, "鱼塘积分");
  if (!Array.isArray(data?.convertList)) throw new Error("商城列表异常");
  const seen = new Set(), items = [];
  for (const row of data.convertList) {
    const tier = catalog.get(row?.index);
    if (!tier) continue;
    if (seen.has(tier.index)) throw new Error("商城存在重复兑换档位");
    seen.add(tier.index);
    // 官方积分兑换为 type=1；type=2 会送付费礼物，绝不自动转用。
    if (FishShop_count(row.type, "兑换类型") !== 1) throw new Error("印章档位不再是积分兑换");
    const cost = FishShop_count(row.consumeNum, "印章兑换价格");
    const count = FishShop_count(row.awardInfo?.awardNumShow, "印章数量");
    const status = FishShop_count(row.status, "兑换状态");
    if (cost !== tier.cost || count !== tier.count || row.awardInfo?.awardName !== "陪伴印章" ||
        (row.awardInfo.awardId !== undefined && FishShop_count(row.awardInfo.awardId, "奖励编号") !== 3410)) {
      throw new Error("印章商品与官方配置不一致");
    }
    if (![0, 1, 2, 3].includes(status)) throw new Error("无法确认印章剩余兑换次数");
    items.push({ ...tier, status });
  }
  return { balance, items: items.sort((a, b) => b.cost - a.cost || b.count - a.count || a.index.localeCompare(b.index)) };
}

async function FishStampExchange_run(view, roomId) {
  if (fishStampExchange.running || fishStampExchange.needsReload || Date.now() - fishStampExchange.lastAttemptAt < 2000) return;
  fishStampExchange.running = true;
  fishStampExchange.stop = false;
  fishStampExchange.lastAttemptAt = Date.now();
  let completed = 0, stamps = 0, spent = 0, remaining = null, pending = false;
  const summary = () => `已确认兑换 ${completed} 次、陪伴印章 ${stamps} 个，使用 ${spent} 积分；${remaining === null ? "剩余积分待核对" : `剩余 ${remaining} 积分`}`;
  view.busy(true);
  try {
    roomId = String(roomId);
    const uid = String(getCookieValue("acf_uid")), day = FishShop_day();
    const check = () => {
      FishShop_checkContext(roomId, uid, day);
      return !fishStampExchange.stop;
    };
    if (!check()) return;
    view.status("正在核对鱼塘积分、陪伴印章档位和剩余兑换次数…");
    const catalog = FishStampExchange_catalog(await FishShop_config());
    if (!check()) { view.status(`已停止：${summary()}`); return; }
    let panel = FishStampExchange_panel(await FishShop_request("convert/convertPanel", { rid: roomId }), catalog);
    remaining = panel.balance;
    const budget = remaining;
    while (check()) {
      const tier = panel.items.find(item => item.status === 1 && item.cost <= remaining && item.cost <= budget - spent);
      if (!tier) break;
      view.status(`正在兑换 ${tier.count} 个陪伴印章（${tier.cost} 积分）；已兑换 ${stamps} 个…`);
      if (!check()) break;
      const expected = remaining - tier.cost;
      remaining = null;
      pending = true;
      await FishShop_request("convert/convertOpt", { rid: roomId, index: tier.index }, true);
      pending = false;
      completed++;
      stamps += tier.count;
      spent += tier.cost;
      if (!check()) break;
      await sleep(500);
      if (!check()) break;
      // 每次成功后重读服务端限购状态；stock 是配置库存，不当作个人今日余量。
      panel = FishStampExchange_panel(await FishShop_request("convert/convertPanel", { rid: roomId }), catalog);
      remaining = panel.balance;
      if (remaining !== expected) throw new Error("积分变化与兑换价格不一致，请核对兑换记录");
    }
    const reason = fishStampExchange.stop ? "" : "。已按贵档优先处理；限购用完、库存待刷新或积分不足的档位不再兑换";
    view.status(`${fishStampExchange.stop ? "已停止" : "印章兑换结束"}：${summary()}${reason}。`);
  } catch (error) {
    if (pending || completed > 0) fishStampExchange.needsReload = true;
    view.status(`已停止：${summary()}。${error.message}。${pending ? "最后一笔结果未确认，" : ""}未重试，请核对商城兑换记录后再操作。`);
  } finally {
    fishStampExchange.running = false;
    fishStampExchange.lastAttemptAt = Date.now();
    view.busy(false);
  }
}
