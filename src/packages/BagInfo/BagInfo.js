let timeout;
let bagInfoDomHook = null;
function initPkg_BagInfo() {
	initPkg_BagInfo_Func();
}

function initPkg_BagInfo_Func() {
    let backpackDom = getValidDom([".BackpackButton", "#js-backpack-enter"])
    if (!backpackDom) {
        return;
    }
	backpackDom.addEventListener("click", function() {
        setTimeout(() => {
            if (bagInfoDomHook) {
                bagInfoDomHook.closeHook();
                bagInfoDomHook = null;
            }
            let giftItemNum = document.querySelectorAll(".ToolbarBackpack-giftItem").length;
            bagInfoDomHook = new DomHook(".BackpackExpandPanel-giftListWrap", true, (e) => {
                if (giftItemNum != document.querySelectorAll(".ToolbarBackpack-giftItem").length) {
                    backpackDom.click();
                    backpackDom.click();
                }
            });
        }, 500);

        clearTimeout(timeout);
        timeout = setTimeout(() => {
            if (getValidDom([".Backpack.JS_Backpack", ".BackpackExpandPanel"])) {
                getBagGifts(rid, (ret) => {
                    BagInfo_render(ret);
                });
            }
        }, 500);
    });
}

async function clearBagGifts(bagGiftsJson, room_id) {
    // 赠送背包内所有的礼物
    let chunkNum = bagGiftsJson.data.list.length;
    if (chunkNum > 0) {
        for (let i = 0; i < chunkNum; i++) {
            let gift_id = bagGiftsJson.data.list[i].id;
            let gift_cnt = bagGiftsJson.data.list[i].count;
            if (Object.keys(bagGiftsJson.data.list[i].batchInfo).length > 0) {
                await sleep(100).then(async () => {
                    const result = await sendGift_bag(gift_id, gift_cnt, room_id);
                    if (result?.error !== 0 && result?.error !== "0") throw new Error(result?.msg || "赠送未确认");
                })
            } else {
                for (let j = 0; j < gift_cnt; j++) {
                    await sleep(100).then(async () => {
                        const result = await sendGift_bag(gift_id, 1, room_id);
                        if (result?.error !== 0 && result?.error !== "0") throw new Error(result?.msg || "赠送未确认");
                    })
                }
            }
        }
        showMessage("【清空背包】执行完毕！", "success");
    } else {
        showMessage("背包礼物为空", "error");
    }
}