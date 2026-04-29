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
 * - [concurrency] 并发数 默认 10
 * - [client] GPT 检测的客户端类型(兼容保留). 不再影响 GPT URL
 * - [method] 请求方法. 默认 get
 * - [gpt_prefix] GPT 显示前缀. 默认不追加
 * - GPT 当前检测端点为 https://ios.chat.openai.com/public-api/auth/session, 规则为 404 成功
 * - [gm_prefix] Gemini 显示前缀. 默认不追加
 * - [gm_country3_allow] Gemini 三位国家码允许列表, 逗号分隔. 默认空表示任意非拒绝国家
 * - [gm_country3_deny] Gemini 三位国家码拒绝列表, 逗号分隔. 默认 CHN
 * 注:
 * - 节点上会按需添加 canAccessGpt/gptLatency, 指 GPT 检测结果与响应延迟
 * - 节点上会按需添加 canAccessGm/gmLatency, 指 Gemini 检测结果与响应延迟
 * - [cache] 使用缓存结果直接返回; 关闭时实时检测并保存最后测试结果
 * - [cache_ttl_ms] 缓存时长(单位: 毫秒) 默认 24 小时
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
  // Always cache for the client.
  let useCache = 1; // 默认为 1 (涵盖了非 JSON 平台)
  if (targetPlatform === "JSON") {
    // 只有在 JSON 平台且匹配失败或未定义时，才设为 0
    useCache = /true|1/i.test($arguments.cache) ? 1 : 0;
  }
  const cache = scriptResourceCache;
  const cacheTtlMs = parseFloat($arguments.cache_ttl_ms ?? 24 * 60 * 60 * 1000);
  const http_meta_host = $arguments.http_meta_host ?? "127.0.0.1";
  const http_meta_port = $arguments.http_meta_port ?? 9876;
  const http_meta_protocol = $arguments.http_meta_protocol ?? "http";
  const http_meta_authorization = $arguments.http_meta_authorization ?? "";
  const http_meta_api = `${http_meta_protocol}://${http_meta_host}:${http_meta_port}`;
  const http_meta_start_delay = parseFloat(
    $arguments.http_meta_start_delay ?? 3000,
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
  // `client` is kept for backward compatibility, but GPT check now always uses iOS session endpoint.
  const gptUrl = `https://ios.chat.openai.com/public-api/auth/session`;
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
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
      isSuccess({ status }) {
        return status === 404;
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

  const internalProxies = [];
  proxies.map((proxy, index) => {
    try {
      clearLegacyAiFields(proxy);
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
        // $.info(JSON.stringify(node, null, 2))
        internalProxies.push({ ...node, _proxies_index: index });
      }
    } catch (e) {
      $.error(e);
    }
  });
  $.info(`核心支持节点数: ${internalProxies.length}/${proxies.length}`);
  if (!internalProxies.length) return proxies;

  if (useCache) {
    for (const proxy of internalProxies) {
      for (const detection of detectionConfigs) {
        const cached = getCache(getCacheId({ proxy, detection }));
        const aiName = getCacheAiDisplayName(detection);
        if (cached?.[detection.cacheKey]) {
          applyDetectionSuccess({
            proxyIndex: proxy._proxies_index,
            detection,
            latency: cached[detection.cacheLatencyKey],
          });
          $.info(
            `[${proxy.name}] ${aiName} 可用, latency=${cached[detection.cacheLatencyKey]}ms`,
          );
        } else if (cached?.unsupported) {
          const latencyText =
            cached.unsupported_latency !== undefined
              ? `, latency=${cached.unsupported_latency}ms`
              : "";
          const messageText = cached.unsupported_message
            ? `, msg=${cached.unsupported_message}`
            : "";
          $.info(
            `[${proxy.name}] ${aiName} 地区不支持${latencyText}${messageText}`,
          );
        } else if (cached) {
          $.info(`[${proxy.name}] ${aiName} 不可用`);
        } else {
          $.info(`[${proxy.name}] ${aiName} 未检测`);
        }
      }
    }
    $.info("缓存模式完成");
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
    throw new Error(`======== HTTP META 启动失败 ====\n${body}`);
  }
  http_meta_pid = pid;
  http_meta_ports = ports;
  $.info(
    `\n======== HTTP META 启动 ====\n[端口] ${ports}\n[PID] ${pid}\n[超时] 若未手动关闭 ${
      Math.round(http_meta_timeout / 60 / 10) / 100
    } 分钟后自动关闭\n`,
  );
  $.info(`等待 ${http_meta_start_delay / 1000} 秒后开始检测`);
  await $.wait(http_meta_start_delay);

  const concurrency = parseInt($arguments.concurrency || 10); // 一组并发数
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
    $.info(`\n======== HTTP META 关闭 ====\n${JSON.stringify(res, null, 2)}`);
  } catch (e) {
    $.error(e);
  }

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
    try {
      const index = internalProxies.indexOf(proxy);
      const startedAt = Date.now();
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
      if (detection.key === "gemini") {
        const locationHeader = getHeaderValue(res.headers, "location");
        bodyText = String(res.body ?? res.rawBody ?? "");
        geminiCountry3 = getGeminiCountry3(bodyText);
        const details = [];
        if (locationHeader) details.push(`location: ${locationHeader}`);
        if (geminiCountry3) details.push(`gbar_country3: ${geminiCountry3}`);
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
      $.info(
        `[${proxy.name}] [${detection.name}] status: ${status}, msg: ${msg}, latency: ${latency}`,
      );
      const outcome = classifyDetectionResult({
        detection,
        status,
        message: msg,
        bodyText,
        body,
        headers: res.headers,
        geminiCountry3,
      });

      if (outcome === "success") {
        applyDetectionSuccess({
          proxyIndex: proxy._proxies_index,
          detection,
          latency,
        });
        $.info(`[${proxy.name}] [${detection.name}] 写入成功结果缓存`);
        setCache(id, {
          [detection.cacheKey]: true,
          [detection.cacheLatencyKey]: latency,
        });
      } else if (outcome === "unsupported") {
        $.info(`[${proxy.name}] [${detection.name}] 写入不支持地区结果缓存`);
        setCache(id, {
          unsupported: true,
          unsupported_message: msg || getUnsupportedMessage(bodyText),
          unsupported_latency: latency,
        });
      } else if (outcome === "transient_failure") {
        $.info(
          `[${proxy.name}] [${detection.name}] 写入失败结果缓存(transient)`,
        );
        setCache(id, {});
      } else {
        $.info(`[${proxy.name}] [${detection.name}] 写入失败结果缓存`);
        setCache(id, {});
      }
    } catch (e) {
      const errorMessage = String(e?.message ?? e ?? "");
      $.error(`[${proxy.name}] [${detection.name}] ${errorMessage}`);
      if (
        isTransientTextForDetection({
          text: errorMessage,
          detectionKey: detection.key,
        })
      ) {
        $.info(
          `[${proxy.name}] [${detection.name}] 写入失败结果缓存(transient error)`,
        );
        setCache(id, {});
      } else {
        $.info(`[${proxy.name}] [${detection.name}] 写入失败结果缓存`);
        setCache(id, {});
      }
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
    cache.set(id, value, cacheTtlMs);
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
  }) {
    if (detection.key === "gpt") {
      return status === 404 ? "success" : "hard_failure";
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
      return "transient_failure";
    }
    if (detection.isSuccess({ status, message, bodyText, body })) {
      return "success";
    }
    return "hard_failure";
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
      return "unsupported";
    }
    if (status === 200) {
      const country3 = `${geminiCountry3 ?? ""}`.toUpperCase();
      if (!country3) return "transient_failure";
      if (geminiCountry3AllowSet.size) {
        return geminiCountry3AllowSet.has(country3) ? "success" : "unsupported";
      }
      if (geminiCountry3DenySet.has(country3)) {
        return "unsupported";
      }
      return "success";
    }
    return "transient_failure";
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
  function getUnsupportedMessage(bodyText = "") {
    const matched = `${bodyText}`.match(
      /unsupported_country_region_territory|unsupported_country|not available in your country|not available in your region|isn't available in your country|location is not supported/i,
    );
    return matched?.[0] || "";
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
    return `${proxy.server}:${proxy.port}:${detection.cacheAiName}`;
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
