/**
 *
 * Node availability check (Sub-Store Node.js)
 *
 * Docs: https://t.me/zhetengsha/1210
 *
 * HTTP META (https://github.com/xream/http-meta) arguments
 * - [http_meta_protocol] protocol, default: http
 * - [http_meta_host] host, default: 127.0.0.1
 * - [http_meta_port] port, default: 9876
 * - [http_meta_authorization] Authorization header, default: empty
 * - [http_meta_start_delay] startup delay in ms, default: 1000
 * - [http_meta_proxy_timeout] timeout per proxy in ms, default: 5000
 *
 * Other arguments
 * - [take] target available node count, default: 10
 * - [timeout] request timeout in ms, default: 5000
 * - [retries] retry count, default: 1
 * - [retry_delay] retry delay in ms, default: 1000
 * - [url] test URL, needs encodeURIComponent
 * - [ua] User-Agent header, needs encodeURIComponent
 * - [status] valid status regex, needs encodeURIComponent, default: 204
 * - [method] request method, default: head
 * - [show_latency] show latency prefix in node name
 * - [ai_patterns] AI match regex patterns (JSON array or single pattern string)
 * - [cache] use cache, default: enabled
 * - [disable_failed_cache/ignore_failed_error] disable failed-cache reuse
 *
 * Cache
 * - fixed TTL: 5 minutes (300000ms)
 * - success cache: { latency, ts }
 * - failed cache: { ts }
 */

let config = ProxyUtils.yaml.load($content ?? $files[0]);
config.proxies = await _main(config.proxies);
$content = ProxyUtils.yaml.dump(config);

async function _main(proxies) {
  // AI-LOCK-BEGIN
  function parseSpeedToKb(name) {
    const speed = name.split("|")[1];
    if (speed.includes("MB/s")) {
      return parseFloat(speed) * 1024;
    } else if (speed.includes("KB/s")) {
      return parseFloat(speed);
    } else {
      return -1;
    }
  }
  // AI-LOCK-END

  // AI-LOCK: KEEP-UNCHANGED
  proxies.sort((a, b) => parseSpeedToKb(b.name) - parseSpeedToKb(a.name));

  const $ = $substore;
  const cacheEnabled = /true|1/.test($arguments.cache ?? 1);
  const disableFailedCache = /true|1/.test(
    $arguments.disable_failed_cache ?? $arguments.ignore_failed_error ?? 0,
  );
  const cache = scriptResourceCache;
  const cacheTTL = 5 * 60 * 1000;

  const take = parseInt($arguments.take ?? 10, 10);

  // AI-LOCK-BEGIN
  const defaultAiPatterns = ["GPT", "GM"];
  const aiPatterns = normalizeAiPatterns($arguments.ai_patterns);
  const aiRegexList = aiPatterns
    .map((pattern) => {
      try {
        return new RegExp(pattern);
      } catch (e) {
        $.error(`[ai_patterns] invalid regex "${pattern}": ${e.message ?? e}`);
        return null;
      }
    })
    .filter(Boolean);

  // AI-LOCK-END

  const hasAiPatterns = aiRegexList.length > 0;
  const batchScale = 1.8;
  const batchSize = Math.ceil(take * batchScale);

  const http_meta_host = $arguments.http_meta_host ?? "127.0.0.1";
  const http_meta_port = $arguments.http_meta_port ?? 9876;
  const http_meta_protocol = $arguments.http_meta_protocol ?? "http";
  const http_meta_authorization = $arguments.http_meta_authorization ?? "";
  const http_meta_api = `${http_meta_protocol}://${http_meta_host}:${http_meta_port}`;
  const http_meta_start_delay = parseInt(
    $arguments.http_meta_start_delay ?? 100,
  );
  const http_meta_proxy_timeout = parseInt(
    $arguments.http_meta_proxy_timeout ?? 5000,
  );

  const concurrency = take;
  const method = $arguments.method || "head";
  const validStatusRaw = $arguments.status || "204";
  const validStatus = new RegExp(validStatusRaw);
  const url = decodeURIComponent(
    $arguments.url || "http://www.gstatic.com/generate_204",
  );
  const ua = decodeURIComponent(
    $arguments.ua ||
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
  );

  const aiCandidates = [];
  const normalCandidates = [];
  const internalProxies = [];

  proxies.forEach((proxy, index) => {
    try {
      const node = ProxyUtils.produce(
        [{ ...proxy }],
        "ClashMeta",
        "internal",
      )?.[0];
      if (!node) return;

      for (const key in proxy) {
        if (/^_/i.test(key)) {
          node[key] = proxy[key];
        }
      }
      internalProxies.push({
        ...node,
        _sorted_index: index,
      });
    } catch (e) {
      $.error(e);
    }
  });

  $.info(`Core supported nodes: ${internalProxies.length}/${proxies.length}`);
  if (!internalProxies.length) return [];
  $.info(
    `[batch] take=${take}, batch_scale=${batchScale}, batch_size=${batchSize}, has_ai_patterns=${hasAiPatterns}, ai_pattern_count=${aiPatterns.length}`,
  );
  for (
    let cursor = 0;
    cursor < internalProxies.length && !shouldStopProbe();
    cursor += batchSize
  ) {
    const batch = internalProxies.slice(cursor, cursor + batchSize);
    await processBatch(batch);
  }

  const sortedAiCandidates = aiCandidates.sort(
    (a, b) => parseSpeedToKb(b.name) - parseSpeedToKb(a.name),
  );
  const sortedNormalCandidates = normalCandidates.sort(
    (a, b) => parseSpeedToKb(b.name) - parseSpeedToKb(a.name),
  );
  return sortedAiCandidates.concat(sortedNormalCandidates).slice(0, take);

  async function processBatch(batch = []) {
    if (!batch.length || shouldStopProbe()) return;

    const batchSuccessMap = new Map();
    const proxiesToCheck = [];

    for (const proxy of batch) {
      const cacheResult = getCacheResult(proxy);
      if (cacheResult.type === "success") {
        batchSuccessMap.set(proxy._sorted_index, cacheResult.latency);
        continue;
      }
      if (cacheResult.type === "failed") {
        continue;
      }
      proxiesToCheck.push(proxy);
    }

    if (proxiesToCheck.length) {
      let httpMetaPid;
      try {
        const batchHttpMeta = await startHttpMetaForBatch(proxiesToCheck);
        httpMetaPid = batchHttpMeta.pid;
        const checked = await executeAsyncTasks(
          proxiesToCheck.map((proxy) => async () => {
            const port = batchHttpMeta.portBySortedIndex.get(
              proxy._sorted_index,
            );
            if (port === undefined || port === null) {
              throw new Error(`[${proxy.name}] missing http-meta port mapping`);
            }
            return await checkWithHttpMeta(proxy, port);
          }),
          { concurrency, result: true, wrap: true },
        );

        for (const item of checked || []) {
          if (item?.data?.ok) {
            batchSuccessMap.set(item.data.sortedIndex, item.data.latency);
          }
        }
      } catch (e) {
        $.error(e);
      } finally {
        await stopHttpMetaForBatch(httpMetaPid);
      }
    }

    flushBatchSuccess(batch, batchSuccessMap);
  }

  async function startHttpMetaForBatch(batchProxies = []) {
    const httpMetaTotalTimeout =
      http_meta_start_delay + batchProxies.length * http_meta_proxy_timeout;
    const startRes = await http({
      retries: 0,
      method: "post",
      url: `${http_meta_api}/start`,
      headers: {
        "Content-type": "application/json",
        Authorization: http_meta_authorization,
      },
      body: JSON.stringify({
        proxies: batchProxies,
        timeout: httpMetaTotalTimeout,
      }),
    });

    let body = startRes.body;
    try {
      body = JSON.parse(body);
    } catch (e) {}

    const { ports, pid } = body;
    if (!pid || !Array.isArray(ports)) {
      throw new Error(`======== HTTP META START FAILED ====\n${body}`);
    }
    if (ports.length < batchProxies.length) {
      throw new Error(
        `http-meta ports not enough: ${ports.length}/${batchProxies.length}`,
      );
    }

    const portBySortedIndex = new Map();
    batchProxies.forEach((proxy, index) => {
      portBySortedIndex.set(proxy._sorted_index, ports[index]);
    });

    const timeoutMinutes =
      Math.round((httpMetaTotalTimeout / 60000) * 100) / 100;
    const startDelaySeconds = http_meta_start_delay / 1000;
    const startLogLines = [
      "======== HTTP META STARTED ====",
      `[pid] ${pid}`,
      `[ports] ${ports.length}`,
      `[timeout] ${http_meta_proxy_timeout}ms`,
      `[total_timeout] ${httpMetaTotalTimeout}ms (${timeoutMinutes} min)`,
      `[start_delay] ${startDelaySeconds}s`,
    ];
    $.info(`\n${startLogLines.join("\n")}`);
    await $.wait(http_meta_start_delay);
    return { pid, portBySortedIndex };
  }

  async function stopHttpMetaForBatch(pid) {
    if (!pid) return;
    try {
      const requestPid = pid;
      const stopRes = await http({
        method: "post",
        url: `${http_meta_api}/stop`,
        headers: {
          "Content-type": "application/json",
          Authorization: http_meta_authorization,
        },
        body: JSON.stringify({
          pid: [pid],
        }),
      });

      const status = parseInt(stopRes?.status || stopRes?.statusCode, 10);
      const is2xx = Number.isFinite(status) && status >= 200 && status < 300;

      let body = stopRes?.body;
      let bodyParseFailed = false;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch (e) {
          bodyParseFailed = true;
        }
      }

      const hasPidArray = Array.isArray(body?.pid);
      if (is2xx && hasPidArray) {
        const stopLogLines = [
          "======== HTTP META STOPPED ====",
          `[status] ${status}`,
          `[request_pid] ${requestPid}`,
          `[response_pid_count] ${body.pid.length}`,
        ];
        $.info(`\n${stopLogLines.join("\n")}`);
      } else {
        const statusText = Number.isNaN(status) ? "unknown" : status;
        const detailLogLines = [
          "======== HTTP META STOPPED (DETAIL) ====",
          `[status] ${statusText}`,
          `[request_pid] ${requestPid}`,
          `[body_parse_failed] ${bodyParseFailed}`,
          JSON.stringify(stopRes, null, 2),
        ];
        $.info(`\n${detailLogLines.join("\n")}`);
      }
    } catch (e) {
      $.error(e);
    }
  }
  function flushBatchSuccess(batch, successMap) {
    for (const proxy of batch) {
      if (shouldStopProbe()) {
        return;
      }
      const latency = successMap.get(proxy._sorted_index);
      if (latency === undefined) continue;

      const output = toProxyOutput(proxy, latency);
      if (hasAiPatterns && isAiProxyName(proxy.name)) {
        aiCandidates.push(output);
      } else {
        normalCandidates.push(output);
      }
    }
  }

  function shouldStopProbe() {
    if (!hasAiPatterns) {
      return normalCandidates.length >= take;
    }
    return aiCandidates.length >= take;
  }

  function isAiProxyName(name = "") {
    if (!hasAiPatterns) return false;
    return aiRegexList.every((regex) => regex.test(name));
  }

  function normalizeAiPatterns(rawPatterns) {
    if (rawPatterns === undefined || rawPatterns === null) {
      return defaultAiPatterns;
    }

    if (Array.isArray(rawPatterns)) {
      return sanitizeAiPatterns(rawPatterns);
    }

    if (typeof rawPatterns !== "string") {
      return defaultAiPatterns;
    }

    const trimmed = rawPatterns.trim();
    if (!trimmed) {
      return defaultAiPatterns;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return sanitizeAiPatterns(parsed);
      }
      if (typeof parsed === "string") {
        return sanitizeAiPatterns([parsed]);
      }
      return defaultAiPatterns;
    } catch (e) {
      // Support a plain single pattern like `GPT`.
      if (!/^[\[{"]/.test(trimmed)) {
        return sanitizeAiPatterns([trimmed]);
      }
      return defaultAiPatterns;
    }
  }

  function sanitizeAiPatterns(patterns = []) {
    return patterns
      .map((pattern) => `${pattern ?? ""}`.trim())
      .filter((pattern) => pattern.length);
  }

  function getCacheResult(proxy) {
    const id = getCacheId(proxy);
    if (!cacheEnabled) return { type: "miss", id };

    const cached = cache.get(id);
    if (!cached) return { type: "miss", id };

    const ts = Number(cached.ts ?? 0);
    if (!ts || Date.now() - ts > cacheTTL) {
      return { type: "miss", id };
    }

    if (cached.latency !== undefined && cached.latency !== null) {
      $.info(`[${proxy.name}] use success cache`);
      return {
        type: "success",
        id,
        latency: cached.latency,
      };
    }

    if (disableFailedCache) {
      $.info(`[${proxy.name}] skip failed cache and re-check`);
      return { type: "miss", id };
    }

    $.info(`[${proxy.name}] use failed cache`);
    return { type: "failed", id };
  }

  async function checkWithHttpMeta(proxy, port) {
    const id = getCacheId(proxy);
    try {
      const startedAt = Date.now();
      const res = await http({
        proxy: `http://${http_meta_host}:${port}`,
        method,
        headers: {
          "User-Agent": ua,
        },
        url,
      });
      const status = parseInt(res.status || res.statusCode || 200, 10);
      const latency = Date.now() - startedAt;
      $.info(`[${proxy.name}] status: ${status}, latency: ${latency}`);

      if (validStatus.test(status)) {
        if (cacheEnabled) {
          cache.set(id, { latency, ts: Date.now() });
        }
        return {
          ok: true,
          sortedIndex: proxy._sorted_index,
          latency,
        };
      }

      if (cacheEnabled) {
        cache.set(id, { ts: Date.now() });
      }
      return {
        ok: false,
      };
    } catch (e) {
      $.error(`[${proxy.name}] ${e.message ?? e}`);
      if (cacheEnabled) {
        cache.set(id, { ts: Date.now() });
      }
      return {
        ok: false,
      };
    }
  }

  function toProxyOutput(proxy, latency) {
    return {
      ...ProxyUtils.parse(JSON.stringify(proxy))[0],
      name: `${$arguments.show_latency ? `[${latency}] ` : ""}${proxy.name}`,
      _latency: `${latency}`,
    };
  }

  function getCacheId(proxy) {
    const cacheProxy = Object.fromEntries(
      Object.entries(proxy)
        .filter(([key]) => !/^(name|collectionName|subName|id|_.*)$/i.test(key))
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    return `http-meta:availability:v2:${url}:${method}:${validStatusRaw}:${JSON.stringify(
      cacheProxy,
    )}`;
  }

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
        if (count < RETRIES) {
          count++;
          const delay = RETRY_DELAY * count;
          await $.wait(delay);
          return await fn();
        }
        throw e;
      }
    };

    return await fn();
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
