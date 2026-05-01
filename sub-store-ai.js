// REFERENCE FOLDER: C:\Users\Admin\BtSoft\wwwroot\Sub-Store
/**
 *
 * GPT 检测(适配 Sub-Store Node.js 版)
 *
 * Surge/Loon 版 请查看: https://t.me/zhetengsha/1207
 *
 * 欢迎加入 Telegram 群组 https://t.me/zhetengsha
 *
 * HTTP META(https://github.com/xream/http-meta) 参数
 * - [http_meta_protocol] 协议 默认: http
 * - [http_meta_host] 服务地址 默认: 127.0.0.1
 * - [http_meta_port] 端口号 默认: 9876
 * - [http_meta_authorization] Authorization 默认无
 * - [http_meta_start_delay] 初始启动延时(单位: 毫秒) 默认: 3000
 * - [http_meta_proxy_timeout] 每个节点耗时(单位: 毫秒). 此参数是为了防止脚本异常退出未关闭核心. 设置过小将导致核心过早退出. 目前逻辑: 启动初始的延时 + 每个节点耗时. 默认: 10000
 *
 * 其它参数
 * - [timeout] 请求超时(单位: 毫秒) 默认 5000
 * - [retries] 重试次数 默认 1
 * - [retry_delay] 重试延时(单位: 毫秒) 默认 1000
 * - [take] 并发数 默认 10
 * - [client] GPT 检测的客户端类型(兼容保留). 不再影响 GPT URL
 * - [method] 请求方法. 默认 get
 * - [gpt_prefix] GPT 显示前缀. 默认不追加
 * - [gpt_loc_deny/gpt_country_deny] GPT loc 黑名单, 逗号分隔. 默认 CN,HK
 * - GPT 当前检测端点为 https://chat.openai.com/cdn-cgi/trace, 规则为 status=200 且 loc 不在黑名单
 * - [gm_prefix] Gemini 显示前缀. 默认不追加
 * - [gm_country3_allow] Gemini 三位国家码允许列表, 逗号分隔. 默认空表示任意非拒绝国家
 * - [gm_country3_deny] Gemini 三位国家码拒绝列表, 逗号分隔. 默认 CHN
 * 注:
 * - 节点上会按需添加 canAccessGpt/gptLatency, 指 GPT 检测结果与响应延迟
 * - 节点上会按需添加 canAccessGm/gmLatency, 指 Gemini 检测结果与响应延迟
 * - [cache] 使用缓存结果直接返回; 关闭时实时检测并保存最后测试结果
 * - 缓存时长使用 Sub-Store 默认配置
 * - 失败结果和不支持地区结果也会缓存, 便于后续直接复用
 * 关于缓存时长
 * 当使用相关脚本时, 若在对应的脚本中使用参数(⚠ 别忘了这个, 一般为 cache, 值设为 true 即可)开启缓存
 * 可在前端(>=2.16.0) 配置各项缓存的默认时长
 * 持久化缓存数据在 JSON 里
 * 可以在脚本的前面添加一个脚本操作, 实现保留 1 小时的缓存. 这样比较灵活
 * async function operator() {
 *     scriptResourceCache._cleanup(undefined, 1 * 3600 * 1000);
 * }
 */

async function operator(proxies = [], targetPlatform, context) {
  const $ = $substore;
  const logBoundary = (phase = "") =>
    $.info(`==================== [SUB-STORE-AI ${phase}] ====================`);
  const logHttpMetaBoundary = (phase = "") =>
    $.info(`==================== [HTTP META ${phase}] ====================`);
  logBoundary("START");
  // Always cache for the client.
  let useCache = 1; // 默认为 1 (涵盖了非 JSON 平台)
  if (targetPlatform === "JSON") {
    // 只有在 JSON 平台且匹配失败或未定义时，才设为 0
    useCache = /true|1/i.test($arguments.cache ?? 0);
  }
  const cache = scriptResourceCache;
  const http_meta_host = $arguments.http_meta_host ?? "127.0.0.1";
  const http_meta_port = $arguments.http_meta_port ?? 9876;
  const http_meta_protocol = $arguments.http_meta_protocol ?? "http";
  const http_meta_authorization = $arguments.http_meta_authorization ?? "";
  const http_meta_api = `${http_meta_protocol}://${http_meta_host}:${http_meta_port}`;
  const http_meta_start_delay = parseFloat(
    $arguments.http_meta_start_delay ?? 100,
  );
  const http_meta_proxy_timeout = parseFloat(
    $arguments.http_meta_proxy_timeout ?? 10000,
  );
  const gptPrefix = $arguments.gpt_prefix ?? "";
  const gmPrefix = $arguments.gm_prefix ?? "";
  const method = $arguments.method || "get";
  const geminiCountry3AllowSet = toCountryCodeSet(
    $arguments.gm_country3_allow ?? $arguments.gemini_country3_allow ?? "",
  );
  const geminiCountry3DenySet = toCountryCodeSet(
    $arguments.gm_country3_deny ?? $arguments.gemini_country3_deny ?? "CHN",
  );
  const gptLocDenySet = toCountryCode2Set(
    $arguments.gpt_loc_deny ?? $arguments.gpt_country_deny ?? "CN,HK",
  );
  // `client` is kept for backward compatibility, but GPT check now always uses trace endpoint.
  const gptUrl = `https://chat.openai.com/cdn-cgi/trace`;
  const networkTransientFailureRegex =
    /exceeds the timeout|timed out|timeout|client network socket disconnected before secure tls connection was established|socket hang up|econnreset/i;
  const policyTransientFailureRegex =
    /request is not allowed[\s\S]*try again later|try again later|temporarily unavailable|too many requests|rate limit|unusual traffic|recaptcha|captcha/i;
  const detectionConfigs = [
    {
      key: "gpt",
      cacheAiName: "gpt",
      name: "GPT",
      url: gptUrl,
      prefix: gptPrefix,
      flagKey: "canAccessGpt",
      latencyKey: "gptLatency",
      cacheKey: "canAccessGpt",
      cacheLatencyKey: "gptLatency",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      isSuccess({ status }) {
        return status === 200;
      },
    },
    {
      key: "gemini",
      cacheAiName: "gm",
      name: "Gemini",
      url: "https://gemini.google.com/app",
      prefix: gmPrefix,
      flagKey: "canAccessGm",
      latencyKey: "gmLatency",
      cacheKey: "canAccessGm",
      cacheLatencyKey: "gmLatency",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    },
  ];
  $.info(
    `[gemini-country3] allow=${Array.from(geminiCountry3AllowSet).join("|") || "ANY"}, deny=${Array.from(geminiCountry3DenySet).join("|") || "NONE"}`,
  );
  $.info(`[gpt-loc] deny=${Array.from(gptLocDenySet).join("|") || "NONE"}`);

  for (const proxy of proxies) {
    clearLegacyAiFields(proxy);
  }

  if (useCache) {
    for (let proxyIndex = 0; proxyIndex < proxies.length; proxyIndex++) {
      const proxy = proxies[proxyIndex];
      for (const detection of detectionConfigs) {
        const cached = getCache(getCacheId({ proxy, detection }));
        const aiName = getCacheAiDisplayName(detection);
        if (cached?.[detection.cacheKey]) {
          applyDetectionSuccess({
            proxyIndex,
            detection,
            latency: cached[detection.cacheLatencyKey],
          });
          const regionText = getCachedSupportedRegionText({
            detection,
            cached,
          });
          $.info(`使用缓存 [${proxy.name}] ${aiName} 支持${regionText}`);
        } else if (cached?.unsupported) {
          const regionText =
            detection.key === "gemini" && cached.unsupported_region
              ? `, region=${cached.unsupported_region}`
              : "";
          $.info(`使用缓存 [${proxy.name}] ${aiName} 不支持(地区限制)${regionText}`);
        } else if (cached) {
          $.info(`使用缓存 [${proxy.name}] ${aiName} 错误`);
        } else {
          $.info(`使用缓存 [${proxy.name}] ${aiName} 未检测(未命中缓存)`);
        }
      }
    }
    logBoundary("END");
    return proxies;
  }

  const internalProxies = [];
  proxies.map((proxy, index) => {
    try {
      const node = ProxyUtils.produce(
        [{ ...proxy }],
        "ClashMeta",
        "internal",
      )?.[0];
      if (node) {
        for (const key in proxy) {
          if (/^_/i.test(key)) {
            node[key] = proxy[key];
          }
        }
        // Keep original endpoint for stable cache key.
        node._origin_server = proxy.server;
        node._origin_port = proxy.port;
        // $.info(JSON.stringify(node, null, 2))
        internalProxies.push({ ...node, _proxies_index: index });
      }
    } catch (e) {
      $.error(e);
    }
  });
  $.info(`核心支持节点数: ${internalProxies.length}/${proxies.length}`);
  if (!internalProxies.length) {
    logBoundary("END");
    return proxies;
  }

  const http_meta_timeout =
    http_meta_start_delay +
    internalProxies.length * http_meta_proxy_timeout * detectionConfigs.length;

  let http_meta_pid;
  let http_meta_ports = [];
  // 启动 HTTP META
  const res = await http({
    retries: 0,
    method: "post",
    url: `${http_meta_api}/start`,
    headers: {
      "Content-type": "application/json",
      Authorization: http_meta_authorization,
    },
    body: JSON.stringify({
      proxies: internalProxies,
      timeout: http_meta_timeout,
    }),
  });
  let body = res.body;
  try {
    body = JSON.parse(body);
  } catch (e) {}
  const { ports, pid } = body;
  if (!pid || !ports) {
    logHttpMetaBoundary("ERROR");
    logBoundary("END");
    throw new Error(`HTTP META 启动失败\n${body}`);
  }
  http_meta_pid = pid;
  http_meta_ports = ports;
  logHttpMetaBoundary("START");
  $.info(
    `HTTP META 启动: 端口数量=${Array.isArray(ports) ? ports.length : 0}, PID=${pid}, 超时=${Math.round(http_meta_timeout / 60 / 10) / 100} 分钟后自动关闭`,
  );
  $.info(`等待 ${http_meta_start_delay / 1000} 秒后开始检测`);
  await $.wait(http_meta_start_delay);

  const concurrency = Math.max(1, parseInt($arguments.take ?? 10, 10) || 10); // 一组并发数
  await executeAsyncTasks(
    internalProxies.map((proxy) => () => check(proxy)),
    { concurrency },
  );

  // const batches = []
  // for (let i = 0; i < internalProxies.length; i += concurrency) {
  //   const batch = internalProxies.slice(i, i + concurrency)
  //   batches.push(batch)
  // }
  // for (const batch of batches) {
  //   await Promise.all(batch.map(check))
  // }

  // stop http meta
  try {
    const res = await http({
      method: "post",
      url: `${http_meta_api}/stop`,
      headers: {
        "Content-type": "application/json",
        Authorization: http_meta_authorization,
      },
      body: JSON.stringify({
        pid: [http_meta_pid],
      }),
    });
    const stopStatus = String(res?.status ?? res?.statusCode ?? "");
    const stopBody = String(res?.body ?? "");
    $.info(`HTTP META 关闭响应: status=${stopStatus}, body=${stopBody}`);
    logHttpMetaBoundary("END");
  } catch (e) {
    $.error(e);
    logHttpMetaBoundary("END");
  }

  logBoundary("END");
  return proxies;

  async function check(proxy) {
    // $.info(`[${proxy.name}] 检测`)
    // $.info(`检测 ${JSON.stringify(proxy, null, 2)}`)
    for (const detection of detectionConfigs) {
      await runDetection({ proxy, detection });
    }
  }
  async function runDetection({ proxy, detection }) {
    const id = getCacheId({ proxy, detection });
    const startedAt = Date.now();
    try {
      const index = internalProxies.indexOf(proxy);
      const requestMethod = detection.key === "gemini" ? "get" : method;
      const res = await http({
        proxy: `http://${http_meta_host}:${http_meta_ports[index]}`,
        method: requestMethod,
        headers: {
          "User-Agent": detection.userAgent,
        },
        url: detection.url,
        ...(detection.key === "gemini"
          ? {
              followRedirect: false,
              maxRedirects: 0,
              redirection: false,
            }
          : {}),
      });
      const status = parseInt(res.status || res.statusCode || 200);
      let msg = "";
      let bodyText = "";
      let body;
      let geminiCountry3 = "";
      let gptLoc = "";
      let geminiLocation = "";
      if (detection.key === "gemini") {
        const locationHeader = getHeaderValue(res.headers, "location");
        geminiLocation = String(locationHeader || "");
        bodyText = String(res.body ?? res.rawBody ?? "");
        geminiCountry3 = getGeminiCountry3(bodyText);
        const details = [];
        if (locationHeader) details.push(`location: ${locationHeader}`);
        if (geminiCountry3) details.push(`gbar_country3: ${geminiCountry3}`);
        msg = details.join(", ");
      } else if (detection.key === "gpt") {
        const rawBody = String(res.body ?? res.rawBody ?? "");
        bodyText = rawBody;
        const trace = parseTraceFields(rawBody);
        gptLoc = String(trace.loc || "").toUpperCase();
        const details = [];
        if (trace.h) details.push(`h: ${trace.h}`);
        if (gptLoc) details.push(`loc: ${gptLoc}`);
        if (trace.ip) details.push(`ip: ${trace.ip}`);
        if (trace.colo) details.push(`colo: ${trace.colo}`);
        msg = details.join(", ");
      } else {
        const rawBody = String(res.body ?? res.rawBody ?? "");
        body = rawBody;
        try {
          body = JSON.parse(rawBody);
        } catch (e) {}
        msg = String(
          body?.error?.code ||
            body?.error?.error_type ||
            body?.cf_details ||
            body?.message ||
            "",
        );
        bodyText = typeof body === "string" ? body : rawBody;
      }
      const latency = Date.now() - startedAt;
      const outcome = classifyDetectionResult({
        detection,
        status,
        message: msg,
        bodyText,
        body,
        headers: res.headers,
        geminiCountry3,
        gptLoc,
      });

      if (outcome === "supported") {
        applyDetectionSuccess({
          proxyIndex: proxy._proxies_index,
          detection,
          latency,
        });
        const regionText =
          detection.key === "gemini" && geminiCountry3
            ? `, region=${geminiCountry3}`
            : detection.key === "gpt" && gptLoc
              ? `, loc=${gptLoc}`
              : "";
        $.info(
          `[${proxy.name}] [${detection.name}] 支持, status=${status}${regionText}`,
        );
        setCache(id, {
          [detection.cacheKey]: true,
          [detection.cacheLatencyKey]: latency,
          ...(detection.key === "gemini" && geminiCountry3
            ? { supported_region: geminiCountry3 }
            : detection.key === "gpt" && gptLoc
              ? { supported_region: gptLoc }
              : {}),
        });
      } else if (outcome === "unsupported") {
        const locText =
          detection.key === "gpt" && gptLoc
            ? `, loc=${gptLoc}`
            : detection.key === "gemini" && geminiCountry3
              ? `, region=${geminiCountry3}`
              : "";
        $.info(
          `[${proxy.name}] [${detection.name}] 不支持(地区限制), status=${status}${locText}`,
        );
        setCache(id, {
          unsupported: true,
          unsupported_message: msg || getUnsupportedMessage(bodyText),
          unsupported_latency: latency,
          ...(detection.key === "gemini" && geminiCountry3
            ? { unsupported_region: geminiCountry3 }
            : {}),
        });
      } else {
        const detailText =
          status === 302
            ? `location=${geminiLocation || "<empty>"}`
            : `body=${bodyText}`;
        $.info(
          `[${proxy.name}] [${detection.name}] 错误, status=${status}, ${detailText}`,
        );
        setCache(id, {});
      }
    } catch (e) {
      const errorStatus = parseInt(
        e?.response?.status || e?.response?.statusCode || 0,
        10,
      );
      const errorLocation = String(
        getHeaderValue(e?.response?.headers, "location") || "",
      );
      const errorMessage = String(e?.message ?? e ?? "");
      const errorBody = String(e?.response?.body ?? e?.response?.rawBody ?? "");
      const detailText =
        errorStatus === 302
          ? `location=${errorLocation || "<empty>"}`
          : `body=${errorBody || errorMessage}`;
      $.info(
        `[${proxy.name}] [${detection.name}] 错误, status=${errorStatus || "ERR"}, ${detailText}`,
      );
      setCache(id, {});
    }
  }
  function applyDetectionSuccess({ proxyIndex, detection, latency }) {
    proxies[proxyIndex].name = `${proxies[proxyIndex].name}${detection.prefix}`;
    proxies[proxyIndex][detection.flagKey] = true;
    proxies[proxyIndex][detection.latencyKey] = latency;
  }
  function clearLegacyAiFields(proxy = {}) {
    delete proxy._gpt;
    delete proxy._gpt_latency;
    delete proxy._gemini;
    delete proxy._gemini_latency;
  }
  function getCache(id) {
    return cache.get(id, 0, true);
  }
  function setCache(id, value) {
    cache.set(id, value);
  }
  function getCacheAiDisplayName(detection) {
    return detection.cacheAiName === "gm" ? "GM" : "GPT";
  }
  function isUnsupportedResult({ message = "", bodyText = "" }) {
    return /unsupported_country|unsupported_country_region_territory|not available in your country|not available in your region|isn't available in your country|location is not supported/i.test(
      `${message}\n${bodyText}`,
    );
  }
  function classifyDetectionResult({
    detection,
    status,
    message = "",
    bodyText = "",
    body,
    headers = {},
    geminiCountry3 = "",
    gptLoc = "",
  }) {
    if (detection.key === "gpt") {
      if (status !== 200) return "error";
      const loc = `${gptLoc ?? ""}`.toUpperCase();
      if (!loc) return "error";
      return gptLocDenySet.has(loc) ? "unsupported" : "supported";
    }
    if (detection.key === "gemini") {
      return classifyGeminiCountry3Result({ status, geminiCountry3 });
    }
    if (isUnsupportedResult({ message, bodyText })) {
      return "unsupported";
    }
    if (
      isTransientFailure({
        status,
        message,
        bodyText,
        detectionKey: detection.key,
      })
    ) {
      return "error";
    }
    if (detection.isSuccess({ status, message, bodyText, body })) {
      return "supported";
    }
    return "error";
  }
  function isTransientFailure({
    status,
    message = "",
    bodyText = "",
    detectionKey = "",
  }) {
    if (status === 429) {
      return true;
    }
    return isTransientTextForDetection({
      text: `${message}\n${bodyText}`,
      detectionKey,
    });
  }
  function classifyGeminiCountry3Result({ status, geminiCountry3 = "" }) {
    if (status === 302) {
      return "error";
    }
    if (status === 200) {
      const country3 = `${geminiCountry3 ?? ""}`.toUpperCase();
      if (!country3) return "error";
      if (geminiCountry3AllowSet.size) {
        return geminiCountry3AllowSet.has(country3)
          ? "supported"
          : "unsupported";
      }
      if (geminiCountry3DenySet.has(country3)) {
        return "unsupported";
      }
      return "supported";
    }
    return "error";
  }
  function getHeaderValue(headers = {}, key = "") {
    const lowered = String(key).toLowerCase();
    for (const headerKey in headers || {}) {
      if (String(headerKey).toLowerCase() === lowered) {
        return headers[headerKey];
      }
    }
    return "";
  }
  function isTransientTextForDetection({ text = "", detectionKey = "" }) {
    if (networkTransientFailureRegex.test(`${text}`)) {
      return true;
    }
    if (
      detectionKey === "gemini" &&
      policyTransientFailureRegex.test(`${text}`)
    ) {
      return true;
    }
    return false;
  }
  function getCachedSupportedRegionText({ detection, cached }) {
    const region = String(cached?.supported_region || "");
    if (!region) return "";
    if (detection.key === "gpt") return `, loc=${region}`;
    if (detection.key === "gemini") return `, region=${region}`;
    return "";
  }
  function getUnsupportedMessage(bodyText = "") {
    const matched = `${bodyText}`.match(
      /unsupported_country_region_territory|unsupported_country|not available in your country|not available in your region|isn't available in your country|location is not supported/i,
    );
    return matched?.[0] || "";
  }
  function parseTraceFields(bodyText = "") {
    const trace = {};
    const lines = String(bodyText ?? "").split(/\r?\n/g);
    for (const line of lines) {
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!key) continue;
      trace[key] = value;
    }
    return trace;
  }
  function getGeminiCountry3(bodyText = "") {
    const text = String(bodyText ?? "");
    if (!text) return "";

    const patterns = [
      /,2,1,200,"([A-Z]{3})",null,null,"\d+"/,
      /,2,1,200,\\"([A-Z]{3})\\",null,null,\\"\d+\\"/,
    ];

    for (const pattern of patterns) {
      const matched = text.match(pattern);
      if (matched?.[1]) return matched[1].toUpperCase();
    }

    return "";
  }
  function toCountryCodeSet(raw = "") {
    const text = `${raw ?? ""}`.trim();
    if (!text) return new Set();
    return new Set(
      text
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter((item) => /^[A-Z]{3}$/.test(item)),
    );
  }
  function toCountryCode2Set(raw = "") {
    const text = `${raw ?? ""}`.trim();
    if (!text) return new Set();
    return new Set(
      text
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter((item) => /^[A-Z]{2}$/.test(item)),
    );
  }
  // 请求
  async function http(opt = {}) {
    const METHOD = opt.method || $arguments.method || "get";
    const TIMEOUT = parseFloat(opt.timeout || $arguments.timeout || 5000);
    const RETRIES = parseFloat(opt.retries ?? $arguments.retries ?? 1);
    const RETRY_DELAY = parseFloat(
      opt.retry_delay ?? $arguments.retry_delay ?? 1000,
    );

    let count = 0;
    const fn = async () => {
      try {
        return await $.http[METHOD]({ ...opt, timeout: TIMEOUT });
      } catch (e) {
        // $.error(e)
        if (count < RETRIES) {
          count++;
          const delay = RETRY_DELAY * count;
          // $.info(`第 ${count} 次请求失败: ${e.message || e}, 等待 ${delay / 1000}s 后重试`)
          await $.wait(delay);
          return await fn();
        } else {
          throw e;
        }
      }
    };
    return await fn();
  }
  function getCacheId({ proxy = {}, detection }) {
    const server = proxy._origin_server ?? proxy.server ?? "";
    const port = proxy._origin_port ?? proxy.port ?? "";
    return `${server}:${port}:${detection.cacheAiName}`;
  }
  function executeAsyncTasks(tasks, { wrap, result, concurrency = 1 } = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        let running = 0;
        const results = [];

        let index = 0;

        function executeNextTask() {
          while (index < tasks.length && running < concurrency) {
            const taskIndex = index++;
            const currentTask = tasks[taskIndex];
            running++;

            currentTask()
              .then((data) => {
                if (result) {
                  results[taskIndex] = wrap ? { data } : data;
                }
              })
              .catch((error) => {
                if (result) {
                  results[taskIndex] = wrap ? { error } : error;
                }
              })
              .finally(() => {
                running--;
                executeNextTask();
              });
          }

          if (running === 0) {
            return resolve(result ? results : undefined);
          }
        }

        await executeNextTask();
      } catch (e) {
        reject(e);
      }
    });
  }
}
