function FishShop_count(value, label = "数据") {
  const number = typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value)) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label}异常`);
  return number;
}

function FishShop_day(time = Date.now()) {
  return new Date(time + 8 * 3600000).toISOString().slice(0, 10);
}

function FishShop_checkContext(roomId, uid, day) {
  if (!/^[1-9]\d*$/.test(String(roomId))) throw new Error("未识别到当前直播间");
  if (!/^[1-9]\d*$/.test(String(uid))) throw new Error("请先登录斗鱼");
  if (typeof rid !== "undefined" && String(rid) !== String(roomId)) throw new Error("直播间已切换");
  if (String(getCookieValue("acf_uid")) !== String(uid)) throw new Error("账号已切换");
  if (FishShop_day() !== day) throw new Error("已跨天，请重新核对今日额度");
  if (typeof document !== "undefined" && document.hidden) throw new Error("页面已隐藏");
}

function FishShop_publicJson(url) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET", url, anonymous: true, timeout: 15000,
      onload(response) {
        try {
          if (response.status !== 200) throw new Error("读取官方配置失败");
          const text = String(response.responseText).trim();
          const match = text.match(/^DYConfigCallback\s*\(([\s\S]*)\);?$/);
          resolve(JSON.parse(match ? match[1] : text));
        } catch (error) { reject(error); }
      },
      onerror: () => reject(new Error("读取官方配置失败")),
      ontimeout: () => reject(new Error("读取官方配置超时"))
    });
  });
}

async function FishShop_config() {
  const result = await FishShop_publicJson("https://webconf.douyucdn.cn/resource/common/activity/actfans_w.json?_=" + Date.now());
  if (!result?.data || typeof result.data !== "object") throw new Error("活动配置格式异常");
  return result.data;
}

async function FishShop_response(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { credentials: "include", cache: "no-store", ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
    const result = await response.json();
    if (!result || (result.error !== 0 && result.error !== "0")) throw new Error(result?.msg || result?.message || "接口未确认成功");
    return result.data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("请求超时，结果尚未确认");
    throw error;
  } finally { clearTimeout(timer); }
}

function FishShop_request(path, params, post = false) {
  const url = new URL("https://www.douyu.com/japi/revenuenc/web/actfans/" + path);
  const options = {};
  if (post) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" };
    options.body = new URLSearchParams({ ...params, ctn: getCCN() }).toString();
  } else {
    url.search = new URLSearchParams(params).toString();
  }
  return FishShop_response(url.href, options);
}
