# 鱼饵购买与印章兑换接口核对

核对日期：2026-11-01。依据为当日官方公开配置与前端代码，不包含登录态消费验证。单元测试和浏览器测试均使用模拟响应，不实际赠礼或兑换。

## 高级鱼饵

- 配置：<https://webconf.douyucdn.cn/resource/common/activity/actfans_w.json>
- 配置路径：`data.fishingConfig.baitConfig.baitList`，用 `baitLv=3` 找高级鱼饵，不按礼物名称搜索。
- 当日配置：`giftId=24942`、`giftNum=4`、`singleGiftNum=300`、`giftPrice=0.1`。礼物 ID 与名称均属于可变配置，不写死到业务逻辑。
- 房间礼物核价：`https://gift.douyucdn.cn/api/gift/v5/web/list?rid=<room>`；`priceInfo.priceType=YUCHI`，整数 `price` 单位为 0.01 鱼翅。必须与活动配置单价一致。

官方调用链：

```text
FishBaitBox: sendGift(giftInfo, {type: 'fishingBait', bizId: bait.baitLv})
bridge: COMMON_SENDGIFT / data.extraParams
GiftCommonServices.sendGift -> sendGiftAndCallback -> GiftAction.sendGiftYC
GiftEpics.sendGiftYC -> POST /japi/gift/donate/mainsite/v3
```

每组请求为 URL 编码表单：

```js
{
  giftId: currentGiftId,
  giftCount: 4,
  roomId: currentRoomId,
  skinId: 0,
  bizExt: JSON.stringify({ type: 'fishingBait', bizId: 3 })
}
```

`type`、`bizId` 位于 `bizExt` 顶层，不能套 `extraParams`，不能用普通赠礼替代。当前官方代码在普通无 `gbfp` 路径删除 `yzxq`，因此不额外添加空的 `yzxq`。

证据资源：

- <https://shark2.douyucdn.cn/front-publish/fish-act-master/js/main_d641d3c.js>：`FishBaitBox`。
- <https://shark2.douyucdn.cn/front-publish/fish-act-master/js/bridge_b96d635.js>：`COMMON_SENDGIFT`。
- <https://shark2.douyucdn.cn/front-publish/live-next-master/js/room/common_6a22e8b.js>：`COMMON_SENDGIFT`、`GiftCommonServices.prototype.sendGiftAndCallback`。
- <https://shark2.douyucdn.cn/front-publish/live-next-master/js/room/toolbar_cbe2364.js>：`GiftEpics.prototype.sendGiftYC`。

## 商城积分兑换

- `GET /japi/revenuenc/web/actfans/convert/convertPanel?rid=<room>`：`data.num` 为积分，`data.convertList` 为商品。
- `POST /japi/revenuenc/web/actfans/convert/convertOpt`：表单字段 `rid`、`index`、`ctn`。
- `type=1` 为积分，`type=2` 为付费赠礼兑换。插件只处理前者，不调用 `convertCheck` 或付费兑换。
- 商品 `status`：0 积分不足、1 可兑换、2 次数不足、3 库存刷新倒计时。每次成功后重读，不根据配置 `stock` 推算用户剩余次数。
- `circle=1` 表示当天、2 表示本周；不写死每日次数。

陪伴印章使用公开 `marketingAwardList` 中 `awardType=5`、`awardId=3410`、`awardName=陪伴印章` 的条目建立动态 `awardIndex` 白名单，再与商城的名称、`consumeNum`、`awardNumShow` 及存在时的 `awardId` 核对。商城 `awardInfo.awardType` 枚举未取得登录样本，不能直接套用配置的 `5`。

当日三个积分档为 250/150/50，分别兑换 50/30/10 个。按最新可兑换且买得起的贵档优先，一次一份，直到余额不足或次数/库存限制。余额未按本次价格减少时停止，防止旧响应引发重复兑换。

证据资源：<https://shark2.douyucdn.cn/front-publish/fish-act-master/js/Shop_3cc3042.js>，定位 `ShopStore`、`Goods`、`convertPanel`、`convertOpt`。

## 验证边界

- 配置和前端资源是公开只读请求；未读取浏览器登录 Cookie。
- 未登录商城接口返回登录错误，没有取得真实个人限购样本；字段不符合已核实结构时会停止，不猜测执行。
- 付费 POST 的明确成功用于统计已完成组数，最终库存需重新打开官方鱼饵面板核对。
- 版本资源 URL 只标识本次核对的前端构建；平台升级后应重新核对调用链和字段。
