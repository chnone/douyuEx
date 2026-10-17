// 官方 Achievement 页面使用 accList(type=2, period=1) 和 takeAcc。
// 无需加载活动 iframe；仅领取点击时已达成、且官方配置中有奖励的卡片。
function FishWeeklyRewards_parseConfig(text) {
  const match = String(text).trim().match(/^DYConfigCallback\s*\(([\s\S]*)\);?$/);
  const value = JSON.parse(match ? match[1] : text);
  const config = value?.data?.fishingConfig?.fishConfig;
  if (!Array.isArray(config?.fishList) || !Array.isArray(config?.achieve?.weekAwardAchieveList)) {
    throw new Error("未能读取周图鉴奖励配置");
  }
  return config;
}

function FishWeeklyRewards_config() {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url: "https://webconf.douyucdn.cn/resource/common/activity/actfans_w.json",
      anonymous: true,
      timeout: 15000,
      onload(response) {
        try {
          if (response.status !== 200) throw new Error("读取奖励配置失败");
          resolve(FishWeeklyRewards_parseConfig(response.responseText));
        } catch (error) { reject(error); }
      },
      onerror: () => reject(new Error("读取奖励配置失败")),
      ontimeout: () => reject(new Error("读取奖励配置超时"))
    });
  });
}

async function FishWeeklyRewards_request(path, params, post = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const url = new URL("https://www.douyu.com/japi/revenuenc/web/actfans/achieve/" + path);
  const options = { credentials: "include", cache: "no-store", signal: controller.signal };
  if (post) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" };
    options.body = new URLSearchParams({ ...params, ctn: getCCN() }).toString();
  } else {
    url.search = new URLSearchParams(params).toString();
  }
  try {
    const response = await fetch(url.href, options);
    if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
    const result = await response.json();
    if (!result || (result.error !== 0 && result.error !== "0")) {
      throw new Error(result?.message || result?.msg || "接口未返回成功状态");
    }
    return result.data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("请求超时，领取结果尚未确认");
    throw error;
  } finally { clearTimeout(timer); }
}

function FishWeeklyRewards_cardKey(card) {
  return `${card.accType}:${card.count}:${Number(card.accType) === 8 ? card.fishId : ""}`;
}

function FishWeeklyRewards_candidates(data, config, roomId) {
  if (!Array.isArray(data?.accList)) throw new Error("未能读取我的周图鉴列表");
  const seen = new Set();
  return data.accList.flatMap(card => {
    if (Number(card?.status) !== 1) return [];
    const accType = Number(card.accType), count = Number(card.count);
    if (!Number.isSafeInteger(accType) || accType < 1 || accType > 8 ||
        card.count === null || card.count === "" || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("周图鉴卡片参数异常");
    }
    const params = { rid: roomId, type: 2, period: 1, accType, count };
    let award;
    if (accType === 8) {
      const fishId = Number(card.fishId);
      if (!Number.isSafeInteger(fishId) || fishId <= 0) throw new Error("鱼类图鉴编号异常");
      params.fishId = fishId;
      const fish = config.fishList.find(item => Number(item.id) === fishId);
      if (!fish) throw new Error("鱼类图鉴奖励配置缺失");
      award = fish.userWeekAwardList?.[0];
    } else {
      award = config.achieve.weekAwardAchieveList.find(item => Number(item.accType) === accType && Number(item.achieveNum) === count);
      if (!award) throw new Error("周成就奖励配置缺失");
    }
    // 与官方 hasAwards 判断一致；已点亮但没有奖励的卡片不发领取请求。
    if (!Number(award?.awardType)) return [];
    const key = FishWeeklyRewards_cardKey(params);
    if (seen.has(key)) return [];
    seen.add(key);
    const name = typeof award.awardName === "string" ? award.awardName : "图鉴奖励";
    const amount = Number(award.num);
    const reward = Number.isSafeInteger(amount) && amount > 0 ? `${name}×${amount}` : name;
    return [{ key, params, reward }];
  });
}

async function FishWeeklyRewards_runDirect(view, roomId) {
  if (fishWeeklyRewards.running || fishWeeklyRewards.needsReload) return;
  fishWeeklyRewards.running = true;
  fishWeeklyRewards.stop = false;
  const rewards = [];
  let completed = 0, skipped = 0;
  const summary = () => `已确认领取 ${completed} 张${skipped ? `，跳过 ${skipped} 张已变化卡片` : ""}${rewards.length ? `；${rewards.join("、")}` : ""}`;
  view.busy(true);
  try {
    if (!/^[1-9]\d*$/.test(String(roomId))) throw new Error("未识别到直播间");
    view.status("正在读取我的周图鉴…");
    const config = await FishWeeklyRewards_config();
    if (!fishWeeklyRewards.stop) {
      const listParams = { rid: roomId, type: 2, period: 1 };
      const data = await FishWeeklyRewards_request("accList", listParams);
      const queue = FishWeeklyRewards_candidates(data, config, roomId);
      if (!queue.length && !fishWeeklyRewards.stop) {
        view.status("本周暂无可领取奖励");
        return;
      }
      for (let i = 0; i < queue.length && !fishWeeklyRewards.stop; i++) {
        if (i > 0) await sleep(FishWeeklyRewards_delay(500, 2000));
        if (fishWeeklyRewards.stop) break;
        // 重新核对本张状态，避免另一标签页已领取后再次提交。
        const latest = i === 0 ? data : await FishWeeklyRewards_request("accList", listParams);
        if (fishWeeklyRewards.stop) break;
        const candidate = FishWeeklyRewards_candidates(latest, config, roomId).find(item => item.key === queue[i].key);
        if (!candidate) { skipped++; continue; }
        view.status(`正在领取 ${completed + 1}/${queue.length} 张…`);
        await FishWeeklyRewards_request("takeAcc", candidate.params, true);
        // 与官方页面一致，明确成功响应才计数；停止后仍统计在途请求的结果。
        completed++;
        rewards.push(candidate.reward);
        view.status(`已领取 ${completed}/${queue.length} 张：${candidate.reward}`);
      }
    }
    view.status(`${fishWeeklyRewards.stop ? "已停止" : "领取结束"}：${summary()}`);
  } catch (error) {
    fishWeeklyRewards.needsReload = true;
    view.status(`已停止：${summary()}。${error.message}。请刷新核对后再试。`);
  } finally {
    fishWeeklyRewards.running = false;
    view.busy(false);
  }
}
