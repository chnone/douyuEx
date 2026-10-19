var bagExpiring = { running: false, clearRunning: false, stop: false, needsReload: false, lastRun: 0 };

function BagInfo_escape(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function BagInfo_integer(value) {
    return (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) &&
        Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
}

function BagInfo_day(time = Date.now()) {
    // 斗鱼活动按北京时间结算，不受浏览器时区影响。
    return new Date(time + 8 * 3600000).toISOString().slice(0, 10);
}

function BagInfo_isTodayGift(item) {
    if (!item || BagInfo_integer(item.expiry) !== 1 || BagInfo_integer(item.count) <= 0 ||
        !Number.isFinite(BagInfo_integer(item.count)) || !(BagInfo_integer(item.id) > 0)) return false;
    // 官方 BackpackServices 的普通赠礼类型为 2、3；不把“可点击使用”当成“可赠送”。
    // 其他类型及特殊业务道具保守跳过，不能调用使用道具或付费礼物接口。
    if (![2, 3].includes(BagInfo_integer(item.propType)) || BagInfo_integer(item.isClick) !== 1 ||
        (item.bizTag && item.bizTag !== "") || /喇叭|改名|更名/.test(item.name || "")) return false;
    if (item.met !== undefined) {
        const end = BagInfo_integer(item.met) * 1000;
        if (!(end > Date.now()) || BagInfo_day(end) !== BagInfo_day()) return false;
    }
    return true;
}

function BagInfo_list(result) {
    if (!result || (result.error !== 0 && result.error !== "0")) throw new Error(result?.msg || "背包读取失败");
    const data = typeof result.data === "string" ? JSON.parse(result.data) : result.data;
    if (!Array.isArray(data?.list)) throw new Error("背包列表格式异常");
    return data.list;
}

async function BagInfo_request(roomId, propId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const options = { credentials: "include", cache: "no-store", signal: controller.signal };
        let url = "https://www.douyu.com/japi/prop/backpack/web/v5?rid=" + encodeURIComponent(roomId);
        if (propId !== undefined) {
            url = "https://www.douyu.com/japi/prop/donate/mainsite/v5";
            options.method = "POST";
            options.headers = { "Content-Type": "application/x-www-form-urlencoded" };
            options.body = new URLSearchParams({ propId: String(propId), propCount: "1", roomId: String(roomId), bizExt: '{"yzxq":{}}' }).toString();
        }
        const response = await fetch(url, options);
        if (!response.ok) throw new Error("请求失败（HTTP " + response.status + "）");
        const result = await response.json();
        if (!result || (result.error !== 0 && result.error !== "0")) throw new Error(result?.msg || "接口未确认成功");
        return result;
    } catch (error) {
        if (error.name === "AbortError") throw new Error("请求超时，结果未确认");
        throw error;
    } finally { clearTimeout(timer); }
}

function BagInfo_updateButtons() {
    const button = document.getElementById("Backpack__expiring");
    if (button) {
        button.textContent = bagExpiring.running ? (bagExpiring.stop ? "正在停止…" : "停止赠送") : "送出今日到期";
        button.disabled = bagExpiring.clearRunning || bagExpiring.needsReload || (bagExpiring.running && bagExpiring.stop);
    }
    const clear = document.getElementById("Backpack__clearbag");
    if (clear) clear.disabled = bagExpiring.running || bagExpiring.clearRunning;
}

async function BagInfo_sendToday() {
    if (bagExpiring.running) {
        bagExpiring.stop = true;
        BagInfo_updateButtons();
        return;
    }
    if (bagExpiring.clearRunning || bagExpiring.needsReload || Date.now() - bagExpiring.lastRun < 1500) return;
    bagExpiring.running = true;
    bagExpiring.stop = false;
    bagExpiring.lastRun = Date.now();
    BagInfo_updateButtons();
    const roomId = String(rid), uid = String(getCookieValue("acf_uid")), day = BagInfo_day();
    const sent = new Map();
    let skipped = 0, pending = false;
    const check = () => {
        if (String(rid) !== roomId || String(getCookieValue("acf_uid")) !== uid) throw new Error("房间或账号已切换");
        if (BagInfo_day() !== day) throw new Error("已跨天，请重新打开背包核对到期时间");
        if (document.hidden) bagExpiring.stop = true;
        return !bagExpiring.stop;
    };
    const summary = () => Array.from(sent.values()).map(item => `${BagInfo_escape(item.name)} ×${item.count}`).join("、") || "0 个";
    try {
        if (!/^[1-9]\d*$/.test(roomId) || !/^[1-9]\d*$/.test(uid)) throw new Error("请先登录并进入直播间");
        showMessage("【今日到期】正在核对背包…", "info");
        const initial = BagInfo_list(await BagInfo_request(roomId));
        const candidates = initial.filter(item => BagInfo_isTodayGift(item) &&
            initial.filter(other => String(other?.id) === String(item.id)).length === 1);
        skipped = initial.filter(item => BagInfo_integer(item?.expiry) === 1).length - candidates.length;
        for (const candidate of candidates) {
            let previousCount = null;
            // 不直接赠送整项 count：同一礼物可能合并不同期限的库存。
            // 每送 1 个重新读取到期值，标记不再为 0 时立即结束该礼物。
            for (let remaining = Number(candidate.count); remaining > 0; remaining--) {
                if (!check()) break;
                const list = BagInfo_list(await BagInfo_request(roomId));
                if (!check()) break;
                const matches = list.filter(item => String(item?.id) === String(candidate.id));
                if (matches.length !== 1 || !BagInfo_isTodayGift(matches[0])) break;
                const current = matches[0];
                if (previousCount !== null && Number(current.count) !== previousCount - 1) {
                    throw new Error("库存变化与赠送数量不一致，请刷新背包核对");
                }
                previousCount = Number(current.count);
                pending = true;
                await BagInfo_request(roomId, current.id);
                pending = false;
                const total = sent.get(String(current.id)) || { name: current.name || "背包礼物", count: 0 };
                total.count++;
                sent.set(String(current.id), total);
                if (total.count === 1 || total.count % 10 === 0) showMessage(`【今日到期】已送出 ${summary()}，可点击停止赠送。`, "info");
                await sleep(500);
            }
            if (bagExpiring.stop) break;
        }
        const state = bagExpiring.stop ? "已停止" : "本轮完成";
        showMessage(`【今日到期】${state}，已送出 ${summary()}。${skipped ? `跳过 ${skipped} 项不可赠送或无法确认的到期道具。` : ""}重新打开背包查看最新库存。`, "success");
    } catch (error) {
        if (pending) bagExpiring.needsReload = true;
        showMessage(`【今日到期】已停止，已确认送出 ${summary()}。${BagInfo_escape(error.message)}。${pending ? "最后一笔结果未确认，未重试，请核对库存后刷新。" : ""}`, "error");
    } finally {
        bagExpiring.running = false;
        bagExpiring.lastRun = Date.now();
        BagInfo_updateButtons();
    }
}

function BagInfo_render(result) {
    let list;
    try { list = BagInfo_list(result); } catch (_) { return; }
    const header = getValidDom([".BackpackHeader-extInfo", ".BackpackExpandPanel-backpackHeader"]);
    if (!header) return;
    const items = getValidDomList([".Backpack-prop", ".ToolbarBackpack-giftItem"]);
    const beta = !!document.querySelector(".BackpackExpandPanel");
    let totalPrice = 0, totalIntimate = 0;
    for (const [i, gift] of list.entries()) {
        if (Number(gift.isValuable) === 1) totalPrice += Number(gift.price || 0) * Number(gift.count || 0);
        totalIntimate += Number(gift.intimate || 0) * Number(gift.count || 0);
        const chunk = Array.from(items).find(item => item.dataset.propid === String(gift.id)) || items[i];
        if (!chunk) continue;
        chunk.querySelectorAll(".bag-info").forEach(item => item.remove());
        const badge = document.createElement("div");
        badge.className = "bag-info";
        badge.textContent = Number(gift.expiry) - 1;
        if (beta) { badge.style.left = "8px"; badge.style.bottom = "auto"; }
        chunk.prepend(badge);
    }
    header.querySelector(".bag-info-summary")?.remove();
    const summary = document.createElement("span");
    summary.className = "bag-info-summary";
    const totals = document.createElement("span");
    totals.textContent = `总价值：￥${(totalPrice / 100).toFixed(2)} 总亲密度：${totalIntimate}`;
    summary.append(totals);
    const actions = document.createElement("span");
    actions.className = "bag-info-actions";
    const expiring = document.createElement("button");
    expiring.type = "button";
    expiring.id = "Backpack__expiring";
    expiring.className = "bag-button";
    expiring.title = "只向当前房间赠送到期标记为 0 的普通礼物，跳过喇叭、改名卡等道具";
    expiring.addEventListener("click", BagInfo_sendToday);
    const clear = document.createElement("button");
    clear.type = "button";
    clear.id = "Backpack__clearbag";
    clear.className = "bag-button";
    clear.textContent = "清空背包";
    clear.addEventListener("click", async () => {
        if (bagExpiring.running || bagExpiring.clearRunning || !confirm("确认清空？")) return;
        bagExpiring.clearRunning = true;
        BagInfo_updateButtons();
        try {
            showMessage("【清空背包】执行中...", "info");
            const roomId = rid;
            const result = await BagInfo_request(roomId);
            await clearBagGifts({ data: { list: BagInfo_list(result) } }, roomId);
        } catch (error) {
            showMessage(`【清空背包】已停止：${BagInfo_escape(error.message)}`, "error");
        } finally {
            bagExpiring.clearRunning = false;
            BagInfo_updateButtons();
        }
    });
    actions.append(expiring, clear);
    summary.append(actions);
    header.append(summary);
    BagInfo_updateButtons();
}
