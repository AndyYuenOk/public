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
 * - [gpt_prefix] GPT 显示前缀. 默认为 " GPT"
 * - GPT 当前检测端点为 https://ios.chat.openai.com/public-api/auth/session, 规则为 404 成功
 * - [gm_prefix] Gemini 显示前缀. 默认为 " GM"
 * 注:
 * - 节点上总是会添加一个 _gpt 字段, 可用于脚本筛选. 新增 _gpt_latency 字段, 指响应延迟
 * - 节点上会按需添加 _gemini 和 _gemini_latency 字段, 指 Gemini 检测结果与响应延迟
 * - [cache] 使用缓存, 默认不使用缓存
 * - [disable_failed_cache/ignore_failed_error] 禁用失败缓存. 即不缓存失败结果
 * - 不支持地区等明确失败结果会单独缓存, 便于后续直接复用
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
  const cacheEnabled = /true|1/.test($arguments.cache ?? 1);
  const disableFailedCache =
    $arguments.disable_failed_cache || $arguments.ignore_failed_error;
  const cache = scriptResourceCache;
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
  const gptPrefix = $arguments.gpt_prefix ?? " GPT";
  const gmPrefix = $arguments.gm_prefix ?? " GM";
  const method = $arguments.method || "get";
  // `client` is kept for backward compatibility, but GPT check now always uses iOS session endpoint.
  const gptUrl = `https://ios.chat.openai.com/public-api/auth/session`;
  const cacheKeyVersion = "v7";
  const networkTransientFailureRegex =
    /exceeds the timeout|timed out|timeout|client network socket disconnected before secure tls connection was established|socket hang up|econnreset/i;
  const policyTransientFailureRegex =
    /request is not allowed[\s\S]*try again later|try again later|temporarily unavailable|too many requests|rate limit|unusual traffic|recaptcha|captcha/i;
  const detectionConfigs = [
    {
      key: "gpt",
      name: "GPT",
      url: gptUrl,
      prefix: gptPrefix,
      flagKey: "_gpt",
      latencyKey: "_gpt_latency",
      cacheKey: "gpt",
      cacheLatencyKey: "gpt_latency",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
      isSuccess({ status }) {
        return status === 404;
      },
    },
    {
      key: "gemini",
      name: "Gemini",
      url: "https://gemini.google.com/app",
      prefix: gmPrefix,
      flagKey: "_gemini",
      latencyKey: "_gemini_latency",
      cacheKey: "gemini",
      cacheLatencyKey: "gemini_latency",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      isSuccess({ status, message, bodyText }) {
        const text = `${message}\n${bodyText}`;
        if (
          /unsupported_country|not available in your country|not available in your region|isn't available in your country|location is not supported|unusual traffic|recaptcha|captcha|attention required|access denied|forbidden/i.test(
            text,
          )
        ) {
          return false;
        }
        if (status >= 200 && status < 400) {
          return true;
        }
        return [401, 403].includes(status);
      },
    },
  ];

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
        // $.info(JSON.stringify(node, null, 2))
        internalProxies.push({ ...node, _proxies_index: index });
      }
    } catch (e) {
      $.error(e);
    }
  });
  $.info(`核心支持节点数: ${internalProxies.length}/${proxies.length}`);
  if (!internalProxies.length) return proxies;

  if (cacheEnabled) {
    try {
      let allCached = true;
      for (let i = 0; i < internalProxies.length; i++) {
        const proxy = internalProxies[i];
        for (const detection of detectionConfigs) {
          const id = getCacheId({ proxy, detection });
          const cached = cache.get(id);
          if (cached) {
            if (!cached[detection.cacheKey] && disableFailedCache) {
              allCached = false;
              break;
            }
          } else {
            allCached = false;
            break;
          }
        }
        if (!allCached) {
          break;
        }
      }
      if (allCached) {
        for (const proxy of internalProxies) {
          for (const detection of detectionConfigs) {
            const cached = cache.get(getCacheId({ proxy, detection }));
            if (cached?.[detection.cacheKey]) {
              applyDetectionSuccess({
                proxyIndex: proxy._proxies_index,
                detection,
                latency: cached[detection.cacheLatencyKey],
              });
            }
          }
        }
        $.info("所有节点都有有效缓存 完成");
        return proxies;
      }
    } catch (e) {}
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
    const id = cacheEnabled ? getCacheId({ proxy, detection }) : undefined;
    try {
      const cached = cacheEnabled ? cache.get(id) : undefined;
      if (cacheEnabled && cached) {
        if (cached[detection.cacheKey]) {
          applyDetectionSuccess({
            proxyIndex: proxy._proxies_index,
            detection,
            latency: cached[detection.cacheLatencyKey],
          });
          $.info(`[${proxy.name}] [${detection.name}] 使用成功结果缓存`);
          return;
        } else if (cached.unsupported) {
          $.info(
            `[${proxy.name}] [${detection.name}] 使用不支持地区结果缓存: ${cached.unsupported_message || ""}`,
          );
          return;
        } else if (disableFailedCache) {
          $.info(`[${proxy.name}] [${detection.name}] 跳过失败结果缓存`);
        } else {
          $.info(`[${proxy.name}] [${detection.name}] 使用失败结果缓存`);
          return;
        }
      }

      const index = internalProxies.indexOf(proxy);
      const startedAt = Date.now();
      const requestMethod =
        detection.key === "gemini" && $.http?.head ? "head" : method;
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
      if (detection.key === "gemini") {
        const locationHeader = getHeaderValue(res.headers, "location");
        msg = locationHeader ? `location: ${locationHeader}` : "";
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
      });

      if (outcome === "success") {
        applyDetectionSuccess({
          proxyIndex: proxy._proxies_index,
          detection,
          latency,
        });
        if (cacheEnabled) {
          $.info(`[${proxy.name}] [${detection.name}] 写入成功结果缓存`);
          cache.set(id, {
            [detection.cacheKey]: true,
            [detection.cacheLatencyKey]: latency,
          });
        }
      } else if (cacheEnabled && outcome === "unsupported") {
        $.info(`[${proxy.name}] [${detection.name}] 写入不支持地区结果缓存`);
        cache.set(id, {
          unsupported: true,
          unsupported_message: msg || getUnsupportedMessage(bodyText),
          unsupported_latency: latency,
        });
      } else if (outcome === "transient_failure") {
        $.info(
          `[${proxy.name}] [${detection.name}] transient failure, skip failed cache and retry next request`,
        );
      } else if (cacheEnabled) {
        $.info(`[${proxy.name}] [${detection.name}] 写入失败结果缓存`);
        cache.set(id, {});
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
          `[${proxy.name}] [${detection.name}] transient error, skip failed cache and retry next request`,
        );
      } else if (cacheEnabled) {
        $.info(`[${proxy.name}] [${detection.name}] 写入失败结果缓存`);
        cache.set(id, {});
      }
    }
  }
  function applyDetectionSuccess({ proxyIndex, detection, latency }) {
    proxies[proxyIndex].name = `${proxies[proxyIndex].name}${detection.prefix}`;
    proxies[proxyIndex][detection.flagKey] = true;
    proxies[proxyIndex][detection.latencyKey] = latency;
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
  }) {
    if (detection.key === "gpt") {
      return status === 404 ? "success" : "hard_failure";
    }
    if (detection.key === "gemini") {
      return classifyGeminiHeaderResult({ status, headers });
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
  function classifyGeminiHeaderResult({ status }) {
    if (status === 302) {
      return "unsupported";
    }
    if (status === 200) {
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
    if (detectionKey === "gemini" && policyTransientFailureRegex.test(`${text}`)) {
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
    return `http-meta:${cacheKeyVersion}:${detection.key}:${
      detection.url
    }:${JSON.stringify(
      Object.fromEntries(
        Object.entries(proxy).filter(
          ([key]) => !/^(name|collectionName|subName|id|_.*)$/i.test(key),
        ),
      ),
    )}`;
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
