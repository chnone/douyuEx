function initPkg_BarragePanel_Tip() {
    setBarragePanelTipCallBack();
}

var barragePanelTipLayout = { container: null, observer: null, resizeObserver: null, frame: 0, listening: false, observed: new Set(), positions: new WeakMap(), anchors: new WeakMap() };

function setBarragePanelTipCallBack() {
    const container = document.getElementById("comment-dzjy-container");
    if (!container || barragePanelTipLayout.container === container) return;
    barragePanelTipLayout.observer?.disconnect();
    barragePanelTipLayout.resizeObserver?.disconnect();
    barragePanelTipLayout.observed.clear();
    barragePanelTipLayout.container = container;
    barragePanelTipLayout.observer = new MutationObserver(BarragePanelTip_scheduleLayout);
    barragePanelTipLayout.observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    barragePanelTipLayout.resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(BarragePanelTip_scheduleLayout) : null;
    if (!barragePanelTipLayout.listening) {
        barragePanelTipLayout.listening = true;
        window.addEventListener("resize", BarragePanelTip_scheduleLayout);
        window.addEventListener("scroll", BarragePanelTip_scheduleLayout, true);
        window.visualViewport?.addEventListener("resize", BarragePanelTip_scheduleLayout);
        window.visualViewport?.addEventListener("scroll", BarragePanelTip_scheduleLayout);
    }
    BarragePanelTip_scheduleLayout();
}

function BarragePanelTip_scheduleLayout() {
    if (barragePanelTipLayout.frame) return;
    barragePanelTipLayout.frame = requestAnimationFrame(() => {
        barragePanelTipLayout.frame = 0;
        // 自己的样式和按钮变化不再次触发观察器，宿主的新选择/位置变化仍会触发。
        const observer = barragePanelTipLayout.observer;
        observer?.disconnect();
        try {
            renderBarragePanelTip();
            setBarragePanelTipFunc();
        } finally {
            const container = barragePanelTipLayout.container;
            if (container?.isConnected) observer?.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
        }
    });
}

function BarragePanelTip_setStyle(dom, name, value) {
    if (dom.style.getPropertyValue(name) !== value) dom.style.setProperty(name, value);
}

function BarragePanelTip_bounds(popup) {
    const viewport = window.visualViewport;
    const bounds = { left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
        right: (viewport?.offsetLeft || 0) + (viewport?.width || document.documentElement.clientWidth),
        bottom: (viewport?.offsetTop || 0) + (viewport?.height || document.documentElement.clientHeight) };
    const targets = [];
    for (let ancestor = popup.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const player = ancestor.id === "__h5player" || ancestor.classList.contains("layout-Player-videoMain");
        const clipX = player || /hidden|clip|scroll|auto/.test(style.overflowX);
        const clipY = player || /hidden|clip|scroll|auto/.test(style.overflowY);
        if (!clipX && !clipY) continue;
        const rect = ancestor.getBoundingClientRect();
        targets.push(ancestor);
        if (clipX) { bounds.left = Math.max(bounds.left, rect.left); bounds.right = Math.min(bounds.right, rect.right); }
        if (clipY) { bounds.top = Math.max(bounds.top, rect.top); bounds.bottom = Math.min(bounds.bottom, rect.bottom); }
    }
    return { ...bounds, targets };
}

function BarragePanelTip_clamp(popup) {
    if (!popup?.isConnected) return [];
    const bounds = BarragePanelTip_bounds(popup), margin = 8;
    const previous = barragePanelTipLayout.positions.get(popup) || { x: 0, y: 0 };
    let rect = popup.getBoundingClientRect();
    const popupStyle = getComputedStyle(popup);
    const layoutWidth = parseFloat(popupStyle.width), layoutHeight = parseFloat(popupStyle.height);
    // computed width 保留小数；offsetWidth 取整会在窄播放器中反复触发尺寸振荡。
    const scaleX = Math.round(((layoutWidth > 0 ? rect.width / layoutWidth : 0) || previous.scaleX || 1) * 10000) / 10000;
    const scaleY = Math.round(((layoutHeight > 0 ? rect.height / layoutHeight : 0) || previous.scaleY || 1) * 10000) / 10000;
    const targets = [popup, ...bounds.targets];
    const availableWidth = bounds.right - bounds.left - margin * 2;
    const availableHeight = bounds.bottom - bounds.top - margin * 2;
    if (availableWidth <= 0 || availableHeight <= 0) {
        // 暂时离开视口/播放器收起时不写入零尺寸，否则之后无法测量恢复。
        BarragePanelTip_setStyle(popup, "visibility", "hidden");
        return targets;
    }
    BarragePanelTip_setStyle(popup, "visibility", "");
    const width = availableWidth / scaleX;
    const height = availableHeight / scaleY;
    BarragePanelTip_setStyle(popup, "--ex-barrage-tip-max-width", width + "px");
    BarragePanelTip_setStyle(popup, "--ex-barrage-tip-max-height", height + "px");
    if (!popup.offsetWidth || !popup.offsetHeight) return targets;
    rect = popup.getBoundingClientRect();
    const left = rect.left - previous.x * scaleX, top = rect.top - previous.y * scaleY;
    const x = (Math.max(bounds.left + margin, Math.min(left, bounds.right - margin - rect.width)) - left) / scaleX;
    const y = (Math.max(bounds.top + margin, Math.min(top, bounds.bottom - margin - rect.height)) - top) / scaleY;
    BarragePanelTip_setStyle(popup, "translate", `${x}px ${y}px`);
    barragePanelTipLayout.positions.set(popup, { x, y, scaleX, scaleY });
    const arrow = popup.querySelector(".btnscontainerrect-6e7730, .btnscontainerrectup-8c6ff2");
    if (arrow) {
        const nativeLeft = parseFloat(arrow.style.left);
        let anchor = barragePanelTipLayout.anchors.get(popup);
        if (!anchor || anchor.nativeLeft !== nativeLeft) {
            anchor = { nativeLeft, offset: Number.isFinite(nativeLeft) ? nativeLeft - popup.offsetWidth / 2 : 0 };
            barragePanelTipLayout.anchors.set(popup, anchor);
        }
        // 保留官方箭头锚点；只在泡泡被平移后把箭头限制在圆角内。
        const arrowLeft = Math.max(14, Math.min(popup.offsetWidth - 14, popup.offsetWidth / 2 + anchor.offset - x));
        BarragePanelTip_setStyle(arrow, "--ex-barrage-tip-arrow-left", arrowLeft + "px");
        // 纵向空间不足时箭头已无法指向原弹幕，隐藏它而不改变宿主弹层方向。
        BarragePanelTip_setStyle(arrow, "visibility", Math.abs(y * scaleY) > margin ? "hidden" : "");
    }
    return targets;
}

function renderBarragePanelTip() {
    const container = document.getElementById("comment-dzjy-container");
    if (!container) return;
    const bars = new Set(Array.from(container.getElementsByClassName("labelfisrt-407af4"), label => label.parentElement));
    const observed = new Set();
    for (const dom of bars) {
        const popup = dom.closest(".btnscontainer-4e2ed0");
        if (popup && !barragePanelTipLayout.anchors.has(popup)) {
            const arrow = popup.querySelector(".btnscontainerrect-6e7730, .btnscontainerrectup-8c6ff2");
            const nativeLeft = parseFloat(arrow?.style.left);
            const nativeWidth = parseFloat(getComputedStyle(popup).width) || popup.offsetWidth;
            barragePanelTipLayout.anchors.set(popup, { nativeLeft, offset: Number.isFinite(nativeLeft) ? nativeLeft - nativeWidth / 2 : 0 });
        }
        const reply = Array.from(dom.children)
            .find(button => button.id !== "barrage-panel-tip__direct-reply" && button.matches("div, button, a") &&
                (button.classList.contains("danmuMenuReplyButton-f2de67") || button.textContent.trim() === "回复"));
        if (!dom.classList.contains("ex-barrage-tip-actions")) dom.classList.add("ex-barrage-tip-actions");
        let plusOne = dom.querySelector("[id='barrage-panel-tip__+1']");
        if (!plusOne) {
            plusOne = document.createElement("button");
            plusOne.type = "button";
            plusOne.className = "labelfisrt-407af4";
            plusOne.id = "barrage-panel-tip__+1";
            plusOne.textContent = "+1";
            dom.insertBefore(plusOne, dom.firstChild);
        }
        let directReply = dom.querySelector("[id='barrage-panel-tip__direct-reply']");
        if (!directReply) {
            directReply = document.createElement("button");
            directReply.type = "button";
            directReply.className = plusOne.className;
            directReply.id = "barrage-panel-tip__direct-reply";
            directReply.textContent = "直接回复";
        }
        // 只置顶插件按钮，原生功能（包括房间特有按钮）保留原节点和相对顺序。
        const firstNative = Array.from(dom.children).find(button => button !== directReply && button !== plusOne) || null;
        if (plusOne.nextElementSibling !== firstNative) dom.insertBefore(plusOne, firstNative);
        if (directReply.nextElementSibling !== plusOne) dom.insertBefore(directReply, plusOne);
        const disabled = !reply || reply.classList.contains("labelfisrtDisabled-8f6f35") || reply.getAttribute("aria-disabled") === "true";
        if (directReply.disabled !== disabled) directReply.disabled = disabled;
        const title = disabled ? "当前房间未提供可用的原生回复" : "立即发送 @昵称：原弹幕内容";
        if (directReply.title !== title) directReply.title = title;
        directReply.onclick = event => {
            event.stopPropagation();
            if (!directReply.disabled) BarragePanelTip_directReply(reply);
        };
        if (popup) {
            if (!popup.classList.contains("ex-barrage-tip-popup")) popup.classList.add("ex-barrage-tip-popup");
            BarragePanelTip_clamp(popup).forEach(target => observed.add(target));
        }
    }
    const resize = barragePanelTipLayout.resizeObserver;
    if (resize) {
        for (const target of barragePanelTipLayout.observed) if (!observed.has(target)) resize.unobserve(target);
        for (const target of observed) if (!barragePanelTipLayout.observed.has(target)) resize.observe(target);
        barragePanelTipLayout.observed = observed;
    }
}

function setBarragePanelTipFunc() {
    const container = document.getElementById("comment-dzjy-container");
    if (!container) return;
    for (const plusOne of container.querySelectorAll("[id='barrage-panel-tip__+1']")) plusOne.onclick = () => {
        const dom = document.getElementById("comment-higher-container");
        if (!dom) return;
        if (dom.getElementsByClassName("ex-image-danmaku").length > 0) {
            const textDom = dom.getElementsByClassName("text-879f3e")[0];
            sendBarrage(textDom.innerHTML.replace(/<a[^>]*><img\s+(?:.*?\s+)?src="(.*?)"[^>]*?\/?><\/a>/g, (match, src) => {
                return getImageDanmakuFromImgSrc(src);
            }));
        } else {
            sendBarrage(dom.innerText);
        }
    };
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
