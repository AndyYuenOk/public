async function operator(proxies = [], targetPlatform, context) {
  const SUBS_KEY = "subs";
  const $ = $substore;
  const { source } = context;
  const { parseFlowHeaders, getFlowHeaders, flowTransfer, getRmainingDays } =
    flowUtils;

  if (source._collection)
    throw new Error("不支持组合订阅, 请在单条订阅中使用此脚本");
  // 订阅
  const urls = ["https://a.com/sub", "https://b.com/sub"];
  return await Promise.any(
    urls.map(async (url) => {
      const response = await $.http.get({
        url,
        headers: {
          //  UA
          "user-agent": "clash.meta",
        },
        // 超时
        timeout: 5 * 1000,
      });

      const list = ProxyUtils.parse(response.body);
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error(`${url} 订阅解析失败`);
      }
      try {
        const subInfo = await getFlowHeaders(url);
        if (subInfo) {
          const {
            total,
            usage: { upload, download },
            expires,
          } = parseFlowHeaders(subInfo);
          const allSubs = $.read(SUBS_KEY) || [];
          for (const name in source) {
            const sub = source[name];
            if (sub.name) {
              // 确定是订阅
              for (var index = 0; index < allSubs.length; index++) {
                if (sub.name === allSubs[index].name) {
                  // 写入订阅流量信息
                  allSubs[index].subUserinfo =
                    `upload=${upload}; download=${download}; total=${total}${
                      expires ? ` ; expire=${expires}` : ""
                    }`;
                  break;
                }
              }
              break;
            }
          }
          $.write(allSubs, SUBS_KEY);
        }
      } catch (e) {
        console.log(`${url} 获取订阅流量信息失败: ${e.message}`);
      }
      return list;
    }),
  );
}
