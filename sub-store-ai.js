/**
 *
 * AI 检测(适配 Sub-Store Node.js 版)
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
 * - [method] 请求方法. 默认 get
 * - [ai_detect] 启用检测项, 逗号分隔. 允许值: openai,gemini,claude,google-ai-studio. 默认 openai,google-ai-studio,claude
 * - [googleAiStudio_key] Google AI Studio 检测 key。默认读取环境变量 SUB_STORE_GOOGLE_API_KEY。google-ai-studio 检测将调用 generativelanguage.googleapis.com/v1/models
 * - [openai_country2_deny] OpenAI 两位国家码黑名单, 逗号分隔. 默认 CN,HK
 * - OpenAI 当前检测端点为 https://chat.openai.com/cdn-cgi/trace, 规则为 status=200 且 country2 不在黑名单
 * - [gemini_country3_allow] Gemini 三位国家码允许列表, 逗号分隔. 默认空表示任意非拒绝国家
 * - [gemini_country3_deny] Gemini 三位国家码拒绝列表, 逗号分隔. 默认 CHN
 * - [claude_country2_deny] Claude 两位国家码黑名单, 逗号分隔. 默认 CN,HK
 * - Claude 当前检测为两段式(均不触发 Cloudflare 人机质询):
 *   1. https://claude.ai/cdn-cgi/trace 取 loc 两位国家码, 命中黑名单即判不支持
 *   2. 通过后再请求 https://claude.ai/api/hello, 校验该地区未被 Anthropic 实际封锁
 * 注:
 * - 节点上会按需添加 canAccessOpenai/openaiLatency, 指 OpenAI 检测结果与响应延迟
 * - 节点上会按需添加 canAccessGemini/geminiLatency, 指 Gemini 检测结果与响应延迟
 * - 节点上会按需添加 canAccessClaude/claudeLatency, 指 Claude 检测结果与响应延迟
 * - 节点上会按需添加 canAccessGoogleAiStudio/googleAiStudioLatency, 指 Google AI Studio 检测结果与响应延迟
 * - 当 ai_detect 实际参与检测项全部通过时, 节点会挂载 tagAi=AI
 * - [cache] 使用缓存结果直接返回; 关闭时实时检测并保存最后测试结果
 * - 缓存时长使用 Sub-Store 默认配置
 * - 失败结果和不支持地区结果也会缓存, 便于后续直接复用
 * 关于缓存时长
 * 当使用相关脚本时, 若在对应的脚本中使用参数(? 别忘了这个, 一般为 cache, 值设为 true 即可)开启缓存
 * 可在前端(>=2.16.0) 配置各项缓存的默认时长
 * 持久化缓存数据在 JSON 里
 */

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

const AI_TAG_FIELD_BY_KEY = {
  openai: "tagOpenai",
  gemini: "tagGemini",
  claude: "tagClaude",
  googleAiStudio: "tagGoogleAiStudio",
};
const AI_TAG_VALUE_BY_KEY = {
  openai: "OAI",
  gemini: "GME",
  claude: "CLD",
  googleAiStudio: "GAI",
};
const AI_ALL_TAG_FIELD = "tag";
const AI_ALL_TAG_VALUE = "AI";
const AI_CACHE_CAN_ACCESS_FIELD = "canAccess";
const AI_CACHE_LATENCY_FIELD = "latency";
const AI_VENDOR_TAG_FIELD = "tag";

async function operator(proxies = [], targetPlatform, context) {
  const $ = $substore;
  const log = (...args) => console.log("[ai]", ...args);
  const logBoundary = (phase = "") =>
    log(`==================== [SUB-STORE-AI ${phase}] ====================`);
  logBoundary("START");
  let useCache = context.aiCache ?? 1;
  // JSON + cache=false: 不读缓存，但仍写入最新检测结果缓存
  const shouldWriteCache = true;
  const { sourceName, sourceStore } = getSourceCacheContext(context.source);
  const pendingLogsByIndex = new Map();
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
  const method = $arguments.method || "get";
  const googleAiStudioKey = `${
    $arguments.googleAiStudio_key ??
    eval("process.env.SUB_STORE_GOOGLE_API_KEY") ??
    ""
  }`;
  const encodedGoogleAiStudioKey = encodeURIComponent(googleAiStudioKey);
  const hasGoogleAiStudioKey = Boolean(googleAiStudioKey);
  const enabledDetectionKeys = parseAiDetectKeys(
    $arguments.ai_detect ?? "openai,google-ai-studio,claude",
  );
  const geminiCountry3AllowSet = toCountryCodeSet(
    $arguments.gemini_country3_allow ?? "",
  );
  const geminiCountry3DenySet = toCountryCodeSet(
    $arguments.gemini_country3_deny ?? "CHN",
  );
  const openaiCountry2DenySet = toCountryCode2Set(
    $arguments.openai_country2_deny ?? "CN,HK",
  );
  const claudeCountryDenySet = toCountryCode2Set(
    $arguments.claude_country2_deny ?? "CN,HK",
  );
  // `client` is kept for backward compatibility, but OpenAI check now always uses trace endpoint.
  const openaiUrl = `https://chat.openai.com/cdn-cgi/trace`;
  const networkTransientFailureRegex =
    /exceeds the timeout|timed out|timeout|client network socket disconnected before secure tls connection was established|socket hang up|econnreset/i;
  const policyTransientFailureRegex =
    /request is not allowed[\s\S]*try again later|try again later|temporarily unavailable|too many requests|rate limit|unusual traffic|recaptcha|captcha/i;
  const cloudflareChallengeRegex =
    /just a moment|cf[-_]chl|challenge-platform|enable javascript and cookies|attention required/i;
  const unsupportedTextRegex =
    /unsupported_country|unsupported_country_region_territory|not available in your country|not available in your region|isn't available in your country|location is not supported|unavailable in (?:your )?region|unavailable in (?:your )?country/i;
  const allDetectionConfigs = [
    {
      key: "openai",
      cacheAiName: "openai",
      name: "OpenAI",
      url: openaiUrl,
      flagKey: "canAccessOpenai",
      latencyKey: "openaiLatency",
      userAgent: BROWSER_UA,
      isSuccess({ status }) {
        return status === 200;
      },
    },
    {
      key: "gemini",
      cacheAiName: "gemini",
      name: "Gemini",
      url: "https://gemini.google.com/app",
      flagKey: "canAccessGemini",
      latencyKey: "geminiLatency",
      userAgent: BROWSER_UA,
    },

    {
      key: "claude",
      cacheAiName: "claude",
      name: "Claude",
      // 边缘 trace 端点在 WAF/Bot 规则之前返回, 不会触发 Cloudflare 人机质询
      url: "https://claude.ai/cdn-cgi/trace",
      // 通过国家码后的二次校验: API 路由不走浏览器质询, 但仍受地区封锁影响
      verifyUrl: "https://claude.ai/api/hello",
      flagKey: "canAccessClaude",
      latencyKey: "claudeLatency",
      userAgent: BROWSER_UA,
    },
    {
      key: "googleAiStudio",
      cacheAiName: "googleAiStudio",
      name: "Google AI Studio",
      url: `https://generativelanguage.googleapis.com/v1/models?key=${encodedGoogleAiStudioKey}`,
      flagKey: "canAccessGoogleAiStudio",
      latencyKey: "googleAiStudioLatency",
      userAgent: BROWSER_UA,
    },
  ];
  if (enabledDetectionKeys.has("googleAiStudio") && !hasGoogleAiStudioKey) {
    log(
      "[googleAiStudio] 未提供 googleAiStudio_key, 跳过 Google AI Studio 检测",
    );
  }
  const detectionConfigs = allDetectionConfigs
    .filter((detection) => enabledDetectionKeys.has(detection.key))
    .filter(
      (detection) => detection.key !== "googleAiStudio" || hasGoogleAiStudioKey,
    );
  log(
    `[gemini-country3] allow=${Array.from(geminiCountry3AllowSet).join("|") || "ANY"}, deny=${Array.from(geminiCountry3DenySet).join("|") || "NONE"}`,
  );
  log(
    `[openai-country2] deny=${Array.from(openaiCountry2DenySet).join("|") || "NONE"}`,
  );
  log(
    `[claude-country2] deny=${Array.from(claudeCountryDenySet).join("|") || "NONE"}`,
  );
  log(
    `[ai-detect] enabled=${detectionConfigs.map((item) => item.key).join("|") || "NONE"}`,
  );
  log(
    `cache=${useCache ? "ON" : "OFF"}, proxies=${proxies.length}, method=${method}, take=${Math.max(1, parseInt($arguments.take ?? 10, 10) || 10)}, http_meta=${http_meta_protocol}://${http_meta_host}:${http_meta_port}`,
  );
  if (!detectionConfigs.length) {
    log("[ai-detect] 未匹配到可用检测项, 跳过检测");
    return finalize(proxies);
  }

  for (const proxy of proxies) {
    clearOutputAiFields(proxy);
  }

  if (useCache) {
    for (let proxyIndex = 0; proxyIndex < proxies.length; proxyIndex++) {
      const proxy = proxies[proxyIndex];
      const proxyKey = getProxyCacheKey(proxy);
      const cachedEntry = getStructuredAiEntry(proxyKey);
      const cachedAiPayload = isPlainObject(cachedEntry?.ai)
        ? cachedEntry.ai
        : {};
      for (const detection of detectionConfigs) {
        const hasCached = Object.prototype.hasOwnProperty.call(
          cachedAiPayload,
          detection.key,
        );
        const cached = hasCached ? cachedAiPayload[detection.key] : undefined;
        if (hasCached) {
          applyDetectionPayloadToProxyAi({
            proxyIndex,
            detection,
            payload: cached,
          });
        }
        const aiName = getCacheAiDisplayName(detection);
        if (cached?.[AI_CACHE_CAN_ACCESS_FIELD]) {
          const regionText = getCachedSupportedRegionText({
            detection,
            cached,
          });
          log(`使用缓存 [${proxy.name}] ${aiName} 支持${regionText}`);
        } else if (cached?.unsupported) {
          const regionText =
            detection.key === "gemini" && cached.unsupported_region
              ? `, country3=${cached.unsupported_region}`
              : detection.key === "claude" && cached.unsupported_region
                ? `, country2=${cached.unsupported_region}`
                : "";
          log(
            `使用缓存 [${proxy.name}] ${aiName} 不支持(地区限制)${regionText}`,
          );
        } else if (hasCached) {
          log(`使用缓存 [${proxy.name}] ${aiName} 错误`);
        } else {
          log(`使用缓存 [${proxy.name}] ${aiName} 未检测(未命中缓存)`);
        }
      }
      applyAggregateAiTag(proxyIndex);
    }
    return finalize(proxies);
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
        // Preserve original endpoint metadata.
        node._origin_server = proxy.server;
        node._origin_port = proxy.port;
        // log(JSON.stringify(node, null, 2))
        internalProxies.push({ ...node, _proxies_index: index });
      }
    } catch (e) {
      log(e);
    }
  });
  log(`核心支持节点数: ${internalProxies.length}/${proxies.length}`);
  if (!internalProxies.length) {
    return finalize(proxies);
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
    logBoundary("END");
    throw new Error(`HTTP META 启动失败\n${body}`);
  }
  http_meta_pid = pid;
  http_meta_ports = ports;
  log(
    `HTTP META 启动: 端口数量=${Array.isArray(ports) ? ports.length : 0}, PID=${pid}, 超时=${Math.round(http_meta_timeout / 60 / 10) / 100} 分钟后自动关闭`,
  );
  log(`等待 ${http_meta_start_delay / 1000} 秒后开始检测`);
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
    const stopStatus = res?.status ?? res?.statusCode ?? "";
    const stopBody = res.body;
    log(`HTTP META 关闭响应: status=${stopStatus}, body=${stopBody}`);
  } catch (e) {
    log(e);
  }
  return finalize(proxies);

  async function check(proxy) {
    // log(`[${proxy.name}] 检测`)
    // log(`检测 ${JSON.stringify(proxy, null, 2)}`)
    const proxyIndex = internalProxies.indexOf(proxy);
    if (proxyIndex < 0) return;
    try {
      const aiPayload = {};
      for (const detection of detectionConfigs) {
        const cachedDetection = await runDetection({
          proxy,
          detection,
          proxyIndex,
        });
        if (shouldWriteCache && shouldPersistDetectionPayload(cachedDetection)) {
          aiPayload[detection.key] = cachedDetection;
        }
        if (cachedDetection !== undefined) {
          applyDetectionPayloadToProxyAi({
            proxyIndex: proxy._proxies_index,
            detection,
            payload: cachedDetection,
          });
        }
      }
      applyAggregateAiTag(proxy._proxies_index);
      if (shouldWriteCache && Object.keys(aiPayload).length > 0) {
        setStructuredAiEntry({
          cacheKey: getProxyCacheKey(proxy),
          aiPayload,
        });
      }
    } finally {
      markNodeLogCompleted(proxyIndex);
    }
  }
  async function runDetection({ proxy, detection, proxyIndex }) {
    const startedAt = Date.now();
    try {
      const index = proxyIndex;

      const requestMethod =
        detection.key === "gemini" ||
        detection.key === "googleAiStudio" ||
        detection.key === "claude"
          ? "get"
          : method;

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
      let openaiCountry2 = "";
      let geminiLocation = "";

      let claudeCountry2 = "";
      let claudeVerify;
      if (detection.key === "gemini") {
        const locationHeader = getHeaderValue(res.headers, "location");
        geminiLocation = locationHeader || "";
        bodyText = res.body;
        geminiCountry3 = getGeminiCountry3(bodyText);
        const details = [];
        if (locationHeader) details.push(`location: ${locationHeader}`);
        if (geminiCountry3) details.push(`gbar_country3: ${geminiCountry3}`);
        msg = details.join(", ");
      } else if (detection.key === "openai") {
        bodyText = res.body;
        const trace = parseTraceFields(res.body);
        openaiCountry2 = (trace.loc || "").toUpperCase();
        const details = [];
        if (trace.h) details.push(`h: ${trace.h}`);
        if (openaiCountry2) details.push(`country2: ${openaiCountry2}`);
        if (trace.ip) details.push(`ip: ${trace.ip}`);
        if (trace.colo) details.push(`colo: ${trace.colo}`);
        msg = details.join(", ");
      } else if (detection.key === "claude") {
        bodyText = res.body;
        const trace = parseTraceFields(res.body);
        claudeCountry2 = (trace.loc || "").toUpperCase();
        const details = [];
        if (claudeCountry2) details.push(`country2: ${claudeCountry2}`);
        if (trace.colo) details.push(`colo: ${trace.colo}`);
        // 仅在国家码可用且未命中黑名单时才做二次校验, 避免无谓请求
        if (
          status === 200 &&
          claudeCountry2 &&
          !claudeCountryDenySet.has(claudeCountry2)
        ) {
          claudeVerify = await verifyClaudeAccess({
            detection,
            proxyIndex,
            requestMethod,
          });
          details.push(`verify: ${claudeVerify.status || "ERR"}`);
        }
        msg = details.join(", ");
      } else if (detection.key === "googleAiStudio") {
        body = res.body;
        try {
          body = JSON.parse(res.body);
        } catch (e) {}
        msg =
          body?.error?.code ||
          body?.error?.error_type ||
          body?.error?.status ||
          body?.error?.message ||
          body?.message ||
          "";
        bodyText = typeof body === "string" ? body : res.body;
      } else {
        body = res.body;
        try {
          body = JSON.parse(res.body);
        } catch (e) {}
        msg =
          body?.error?.code ||
          body?.error?.error_type ||
          body?.cf_details ||
          body?.message ||
          "";
        bodyText = typeof body === "string" ? body : res.body;
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
        openaiCountry2,
        claudeCountry2,
        claudeVerify,
      });

      if (outcome === "supported") {
        const regionText =
          detection.key === "gemini" && geminiCountry3
            ? `, country3=${geminiCountry3}`
            : detection.key === "openai" && openaiCountry2
              ? `, country2=${openaiCountry2}`
              : detection.key === "claude" && claudeCountry2
                ? `, country2=${claudeCountry2}`
                : "";
        enqueueNodeLog(
          proxyIndex,
          `[${proxy.name}] [${detection.name}] 支持, status=${status}${regionText}`,
        );
        return {
          [AI_CACHE_CAN_ACCESS_FIELD]: true,
          [AI_CACHE_LATENCY_FIELD]: latency,
          ...(detection.key === "gemini" && geminiCountry3
            ? { supported_region: geminiCountry3 }
            : detection.key === "openai" && openaiCountry2
              ? { supported_region: openaiCountry2 }
              : detection.key === "claude" && claudeCountry2
                ? { supported_region: claudeCountry2 }
                : {}),
        };
      } else if (outcome === "unsupported") {
        const locText =
          detection.key === "openai" && openaiCountry2
            ? `, country2=${openaiCountry2}`
            : detection.key === "gemini" && geminiCountry3
              ? `, country3=${geminiCountry3}`
              : detection.key === "claude" && claudeCountry2
                ? `, country2=${claudeCountry2}`
                : "";
        enqueueNodeLog(
          proxyIndex,
          `[${proxy.name}] [${detection.name}] 不支持(地区限制), status=${status}${locText}`,
        );
        return {
          unsupported: true,
          unsupported_message: msg || getUnsupportedMessage(bodyText),
          unsupported_latency: latency,
          ...(detection.key === "gemini" && geminiCountry3
            ? { unsupported_region: geminiCountry3 }
            : detection.key === "claude" && claudeCountry2
              ? { unsupported_region: claudeCountry2 }
              : {}),
        };
      } else {
        const detailText = buildErrorText(
          bodyText,
          status === 302
            ? detection.key === "gemini"
              ? geminiLocation
              : ""
            : "",
        );

        enqueueNodeLog(
          proxyIndex,
          `[${proxy.name}] [${detection.name}] 错误, status=${status}, ${detailText}`,
        );
        if (
          isTransientFailure({
            status,
            message: msg,
            bodyText,
            detectionKey: detection.key,
          })
        ) {
          return undefined;
        }
        return {};
      }
    } catch (e) {
      const errorStatus = parseInt(
        e?.response?.status || e?.response?.statusCode || 0,
        10,
      );
      const errorLocation =
        getHeaderValue(e?.response?.headers, "location") || "";
      const errorMessage = e?.message ?? e ?? "";
      const errorBody = e?.response?.body ?? e?.response?.rawBody ?? "";
      const detailText = buildErrorText(
        errorBody || errorMessage,
        errorStatus === 302 ? errorLocation : "",
      );
      enqueueNodeLog(
        proxyIndex,
        `[${proxy.name}] [${detection.name}] 错误, status=${errorStatus || "ERR"}, ${detailText}`,
      );
      if (
        isTransientFailure({
          status: errorStatus,
          message: errorMessage,
          bodyText: errorBody,
          detectionKey: detection.key,
        })
      ) {
        return undefined;
      }
      return {};
    }
  }
  function applyDetectionPayloadToProxyAi({
    proxyIndex,
    detection,
    payload = {},
  }) {
    const proxy = proxies[proxyIndex];
    if (!proxy) return;
    ensureProxyAiShape(proxy);
    const bucket = isPlainObject(proxy.ai[detection.key])
      ? proxy.ai[detection.key]
      : {};
    const nextBucket = {};

    if (isPlainObject(payload)) {
      if (payload?.[AI_CACHE_CAN_ACCESS_FIELD]) {
        nextBucket[AI_CACHE_CAN_ACCESS_FIELD] = true;
        nextBucket[AI_CACHE_LATENCY_FIELD] = payload[AI_CACHE_LATENCY_FIELD];
        const tagValue = AI_TAG_VALUE_BY_KEY[detection.key];
        if (tagValue) {
          nextBucket[AI_VENDOR_TAG_FIELD] = tagValue;
        }
      }
      if ("supported_region" in payload) {
        nextBucket.supported_region = payload.supported_region;
      }
      if ("unsupported" in payload) {
        nextBucket.unsupported = payload.unsupported;
      }
      if ("unsupported_message" in payload) {
        nextBucket.unsupported_message = payload.unsupported_message;
      }
      if ("unsupported_latency" in payload) {
        nextBucket.unsupported_latency = payload.unsupported_latency;
      }
      if ("unsupported_region" in payload) {
        nextBucket.unsupported_region = payload.unsupported_region;
      }
    }

    proxy.ai[detection.key] = { ...bucket, ...nextBucket };
  }
  function clearOutputAiFields(proxy = {}) {
    ensureProxyAiShape(proxy);
    delete proxy.tagOpenai;
    delete proxy.tagGemini;
    delete proxy.tagClaude;
    delete proxy.tagGoogleAiStudio;
    delete proxy.tagAi;
    delete proxy.canAccessOpenai;
    delete proxy.openaiLatency;
    delete proxy.canAccessGemini;
    delete proxy.geminiLatency;
    delete proxy.canAccessClaude;
    delete proxy.claudeLatency;
    delete proxy.canAccessGoogleAiStudio;
    delete proxy.googleAiStudioLatency;

    proxy.ai.openai = {};
    proxy.ai.gemini = {};
    proxy.ai.claude = {};
    proxy.ai.googleAiStudio = {};
    delete proxy.ai[AI_ALL_TAG_FIELD];
  }
  function applyAggregateAiTag(proxyIndex) {
    const proxy = proxies[proxyIndex];
    if (!proxy) return;
    ensureProxyAiShape(proxy);
    if (isAllEnabledDetectionsSupported(proxy)) {
      proxy.ai[AI_ALL_TAG_FIELD] = AI_ALL_TAG_VALUE;
      return;
    }
    delete proxy.ai[AI_ALL_TAG_FIELD];
  }
  function isAllEnabledDetectionsSupported(proxy = {}) {
    if (!Array.isArray(detectionConfigs) || !detectionConfigs.length) {
      return false;
    }
    const aiPayload = isPlainObject(proxy.ai) ? proxy.ai : {};
    return detectionConfigs.every(
      (detection) =>
        isPlainObject(aiPayload[detection.key]) &&
        aiPayload[detection.key][AI_CACHE_CAN_ACCESS_FIELD] === true,
    );
  }
  function ensureProxyAiShape(proxy = {}) {
    if (!isPlainObject(proxy.ai)) {
      proxy.ai = {};
    }
    for (const key of ["openai", "gemini", "claude", "googleAiStudio"]) {
      if (!isPlainObject(proxy.ai[key])) {
        proxy.ai[key] = {};
      }
    }
  }
  function getCacheAiDisplayName(detection) {
    if (detection.cacheAiName === "gemini") return "GEMINI";

    if (detection.cacheAiName === "claude") return "CLAUDE";
    if (detection.cacheAiName === "googleAiStudio") return "GOOGLEAISTUDIO";
    return "OPENAI";
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
    openaiCountry2 = "",
    claudeCountry2 = "",
    claudeVerify,
  }) {
    if (detection.key === "openai") {
      if (status !== 200) return "error";
      const country2 = `${openaiCountry2 ?? ""}`.toUpperCase();
      if (!country2) return "error";
      return openaiCountry2DenySet.has(country2) ? "unsupported" : "supported";
    }
    if (detection.key === "gemini") {
      return classifyGeminiCountry3Result({ status, geminiCountry3 });
    }

    if (detection.key === "claude") {
      return classifyClaudeCountry2Result({
        status,
        claudeCountry2,
        claudeVerify,
      });
    }
    if (detection.key === "googleAiStudio") {
      return classifyGoogleAiStudioResult({ status, body });
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

  function classifyClaudeCountry2Result({
    status,
    claudeCountry2 = "",
    claudeVerify,
  }) {
    if (status !== 200) return "error";
    const country2 = `${claudeCountry2 ?? ""}`.toUpperCase();
    if (!country2) return "error";
    if (claudeCountryDenySet.has(country2)) return "unsupported";
    // 国家码通过后, 以 API 二次校验结果为准; 未取到校验结果视为错误而非支持
    if (!claudeVerify) return "error";
    return claudeVerify.outcome;
  }
  async function verifyClaudeAccess({
    detection,
    proxyIndex,
    requestMethod = "get",
  }) {
    try {
      const res = await http({
        proxy: `http://${http_meta_host}:${http_meta_ports[proxyIndex]}`,
        method: requestMethod,
        headers: {
          "User-Agent": detection.userAgent,
          Accept: "application/json",
        },
        url: detection.verifyUrl,
      });
      const status = parseInt(res.status || res.statusCode || 200);
      const bodyText = typeof res.body === "string" ? res.body : "";
      if (isUnsupportedResult({ bodyText })) {
        return { outcome: "unsupported", status, bodyText };
      }
      // 被 Cloudflare 拦截属临时失败而非地区限制. 响应头可能被链路丢弃, 故同时看正文特征
      if (
        getHeaderValue(res.headers, "cf-mitigated") ||
        cloudflareChallengeRegex.test(bodyText) ||
        isTransientFailure({
          status,
          bodyText,
          detectionKey: detection.key,
        })
      ) {
        return { outcome: "error", status, bodyText };
      }
      return {
        outcome: status === 200 ? "supported" : "unsupported",
        status,
        bodyText,
      };
    } catch (e) {
      const status = parseInt(
        e?.response?.status || e?.response?.statusCode || 0,
        10,
      );
      const bodyText = e?.response?.body ?? e?.message ?? "";
      if (
        isUnsupportedResult({ bodyText }) &&
        !cloudflareChallengeRegex.test(`${bodyText}`)
      ) {
        return { outcome: "unsupported", status, bodyText };
      }
      return { outcome: "error", status, bodyText };
    }
  }
  function classifyGoogleAiStudioResult({ status, body }) {
    if (
      status === 200 &&
      Array.isArray(body?.models) &&
      body.models.length > 0
    ) {
      return "supported";
    }
    if (isUnsupportedResult({ bodyText: JSON.stringify(body ?? {}) })) {
      return "unsupported";
    }
    return "error";
  }

  function getHeaderValue(headers = {}, key = "") {
    const lowered = key.toLowerCase();
    for (const headerKey in headers || {}) {
      if (headerKey.toLowerCase() === lowered) {
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
    const region = cached?.supported_region || "";
    if (!region) return "";
    if (detection.key === "openai") return `, country2=${region}`;
    if (detection.key === "gemini") return `, country3=${region}`;
    if (detection.key === "claude") return `, country2=${region}`;
    return "";
  }
  function getUnsupportedMessage(bodyText = "") {
    const matched = `${bodyText}`.match(unsupportedTextRegex);
    return matched?.[0] || "";
  }
  function buildErrorText(raw = "", location = "", maxLength = 300) {
    const title = truncateText(extractHtmlTitle(raw), maxLength);
    const text = truncateText(toPlainText(raw), maxLength);
    const parts = [];
    parts.push(`title=${title || "<empty>"}`);
    parts.push(`text=${text || "<empty>"}`);
    if (location) parts.push(`location=${location}`);
    return parts.join(", ");
  }
  function extractHtmlTitle(raw = "") {
    const text = raw ?? "";
    if (!text) return "";
    const matched = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!matched?.[1]) return "";
    return toPlainText(matched[1]);
  }
  function toPlainText(raw = "") {
    let text = raw ?? "";
    if (!text) return "";
    text = text
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ");
    return text;
  }
  function truncateText(text = "", maxLength = 300) {
    const value = text ?? "";
    if (!value) return "";
    const max = Math.max(1, parseInt(maxLength, 10) || 300);
    if (value.length <= max) return value;
    return `${value.slice(0, max)}...`;
  }
  function parseTraceFields(bodyText = "") {
    const trace = {};
    const lines = (bodyText ?? "").split(/\r?\n/g);
    for (const line of lines) {
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx);
      const value = line.slice(idx + 1);
      if (!key) continue;
      trace[key] = value;
    }
    return trace;
  }
  function getGeminiCountry3(bodyText = "") {
    const text = bodyText ?? "";
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
  function parseAiDetectKeys(raw = "") {
    const text = `${raw ?? ""}`;

    if (!text) return new Set(["openai", "gemini", "claude", "googleAiStudio"]);
    const allowed = new Set(["openai", "gemini", "claude", "google-ai-studio"]);

    return new Set(
      text
        .split(",")
        .map((item) => item.toLowerCase())
        .filter((item) => allowed.has(item))
        .map((item) => (item === "google-ai-studio" ? "googleAiStudio" : item)),
    );
  }
  function toCountryCodeSet(raw = "") {
    const text = `${raw ?? ""}`;
    if (!text) return new Set();
    return new Set(
      text
        .split(",")
        .map((item) => item.toUpperCase())
        .filter((item) => /^[A-Z]{3}$/.test(item)),
    );
  }
  function toCountryCode2Set(raw = "") {
    const text = `${raw ?? ""}`;
    if (!text) return new Set();
    return new Set(
      text
        .split(",")
        .map((item) => item.toUpperCase())
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
        // log(e)
        if (count < RETRIES) {
          count++;
          const delay = RETRY_DELAY * count;
          // log(`第 ${count} 次请求失败: ${e.message || e}, 等待 ${delay / 1000}s 后重试`)
          await $.wait(delay);
          return await fn();
        } else {
          throw e;
        }
      }
    };
    return await fn();
  }
  function getSourceCacheContext(source) {
    const firstSource = Object.values(source)[0];
    const sourceName = `${firstSource.name}-${firstSource.displayName}`;
    const sourceStore = $.read(`#${sourceName}`) ?? {};
    return { sourceName, sourceStore };
  }
  function finalize(result) {
    logBoundary("END");
    $.write(sourceStore, `#${sourceName}`);
    return result;
  }
  function getServerWithPort(proxy = {}) {
    const server = proxy?._origin_server ?? proxy?.server ?? "";
    const port = proxy?._origin_port ?? proxy?.port;
    const hasPort = port !== undefined && port !== null && port !== "";
    return hasPort ? `${server}:${port}` : server;
  }
  function getProxyCacheKey(proxy = {}) {
    return String(proxy?.name || "").trim();
  }
  function getStructuredAiEntry(cacheKey = "") {
    const safeCacheKey = String(cacheKey || "").trim();
    if (!safeCacheKey) return null;
    const entry = sourceStore[safeCacheKey];
    return isPlainObject(entry) ? entry : null;
  }
  function setStructuredAiEntry({ cacheKey = "", aiPayload = {} } = {}) {
    const safeCacheKey = String(cacheKey || "").trim();
    if (!safeCacheKey) return;
    const existingEntry = isPlainObject(sourceStore[safeCacheKey])
      ? sourceStore[safeCacheKey]
      : {};
    const existingAi = isPlainObject(existingEntry.ai) ? existingEntry.ai : {};
    sourceStore[safeCacheKey] = {
      ...existingEntry,
      ai: {
        ...existingAi,
        ...(isPlainObject(aiPayload) ? aiPayload : {}),
      },
    };
  }
  function shouldPersistDetectionPayload(payload = {}) {
    if (!isPlainObject(payload)) return false;
    if (payload?.[AI_CACHE_CAN_ACCESS_FIELD] === true) return true;
    if (payload?.unsupported === true) return true;
    return false;
  }
  function enqueueNodeLog(proxyIndex, message = "") {
    const index = Number.isInteger(proxyIndex)
      ? proxyIndex
      : Number.MAX_SAFE_INTEGER;
    if (index === Number.MAX_SAFE_INTEGER) {
      log(message);
      return;
    }
    if (!pendingLogsByIndex.has(index)) {
      pendingLogsByIndex.set(index, []);
    }
    pendingLogsByIndex.get(index).push(message);
  }
  function markNodeLogCompleted(proxyIndex) {
    if (!Number.isInteger(proxyIndex) || proxyIndex < 0) return;
    const logs = pendingLogsByIndex.get(proxyIndex) || [];
    for (const message of logs) {
      log(message);
    }
    pendingLogsByIndex.delete(proxyIndex);
  }
  function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
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
