function initPkg_BarragePanel_Tip() {
    setBarragePanelTipCallBack();
}

function setBarragePanelTipCallBack() {
    let a = new DomHook("#comment-dzjy-container", false, (m) => {
        if (m.length <= 0) {
            return;
        }
        if (m[0].addedNodes.length <= 0) {
            return;
        }
        renderBarragePanelTip();
        setBarragePanelTipFunc();
    })
}

function renderBarragePanelTip() {
    const labelDoms = document.getElementsByClassName("labelfisrt-407af4");
    if (labelDoms.length === 0) return;
    const dom = labelDoms[0].parentElement;
    if (dom.querySelector("[id='barrage-panel-tip__+1']")) return;
    let a = document.createElement("p");
    a.className = "sugun-e3fbf6";
    a.innerText = "|";
    dom.appendChild(a);

    a = document.createElement("div");
    a.className = "labelfisrt-407af4 thirdBtn-06cde5 fourBtn-0845d4";
    a.id = "barrage-panel-tip__+1"
    a.innerText = "+1";
    dom.appendChild(a);

    const reply = Array.from(dom.querySelectorAll("div, button, a"))
        .find(button => button.textContent.trim() === "回复");
    if (!reply) return;
    const directReply = document.createElement("div");
    directReply.className = a.className;
    directReply.id = "barrage-panel-tip__direct-reply";
    directReply.textContent = "直接回复";
    directReply.title = "立即发送 @昵称：原弹幕内容";
    directReply.onclick = event => {
        event.stopPropagation();
        BarragePanelTip_directReply(reply);
    };
    dom.insertBefore(directReply, a);
}

function setBarragePanelTipFunc() {
    const plusOne = document.getElementById("barrage-panel-tip__+1");
    if (!plusOne) return;
    plusOne.onclick = () => {
        const dom = document.getElementById("comment-higher-container");
        if (dom.getElementsByClassName("ex-image-danmaku").length > 0) {
            const textDom = dom.getElementsByClassName("text-879f3e")[0];
            sendBarrage(textDom.innerHTML.replace(/<a[^>]*><img\s+(?:.*?\s+)?src="(.*?)"[^>]*?\/?><\/a>/g, (match, src) => {
                return getImageDanmakuFromImgSrc(src);
            }));
        } else {
            sendBarrage(dom.innerText);
        }
    }
}

let barragePanelTipReplyPending = false;

async function BarragePanelTip_directReply(reply) {
    const input = document.getElementsByClassName("ChatSend-txt")[0];
    if (barragePanelTipReplyPending || !input || !reply.isConnected) return;
    barragePanelTipReplyPending = true;
    const property = input.tagName === "TEXTAREA" ? "value" : "innerText";
    const draft = input[property];
    let edited = false;
    const onInput = event => { if (event.isTrusted) edited = true; };
    input.addEventListener("input", onInput);
    try {
        // 让原生回复提供所选弹幕的作者与内容，避免从屏幕上其他弹幕猜昵称。
        input[property] = "";
        reply.click();
        for (let attempt = 0; attempt < 20; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 25));
            if (edited || !input.isConnected) return;
            const value = input[property];
            if (!value) continue;
            if (!/^@[^\r\n]+?[：:]\s*\S/.test(value)) break;
            sendBarrage(value);
            return;
        }
        showMessage("【直接回复】未能读取所选弹幕，请重新选择后重试", "error");
    } finally {
        input.removeEventListener("input", onInput);
        if (!edited && input.isConnected) input[property] = draft;
        barragePanelTipReplyPending = false;
    }
}
