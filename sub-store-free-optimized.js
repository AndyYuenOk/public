const FINAL_PROXIES_CACHE_KEY = "sub-store-free-optimized:final-proxies";
// 测速文件，需要在超时时间内下载完成，目标，越小越好
// 由于下载爬坡原因，估算速度 != 实际速度，但保证最低速度
// https://github.com/litterinchina/large-file-download-test
const DEFAULT_SPEED_TEST_URL =
  "https://github.com/BitDoctor/speed-test-file/raw/refs/heads/master/1mb.txt";
const DEFAULT_TIMEOUT_MS = 5000;
const SPEED_REFERENCE_LABEL = "A";

async function operator(proxies = [], targetPlatform, context) {
  const $ = $substore;
  const cache = scriptResourceCache;
  // Incoming node names carry speed in text form; sort by parsed speed first.
  const compareProxySpeedDesc = (a, b) => {
    const speedA = normalizeProxyName(a?.name).speedKb ?? -1;
    const speedB = normalizeProxyName(b?.name).speedKb ?? -1;
    return speedB - speedA;
  };

  // Runtime knobs from script arguments.
  const take = parseInt($arguments.take ?? 10, 10);
  const appendMeasuredSpeed = /true|1/i.test(`${$arguments.speed ?? 1}`);

  let cacheEnabled = /true|1/i.test(`${$arguments.cache ?? 0}`);
  // Always cache for the client.
  if (targetPlatform != "JSON") {
    cacheEnabled = 1;
  }

  const cacheTtlMs = $arguments.cache_ttl_ms ?? 24 * 60 * 60 * 1000;
  const speedSortedInputProxies = [...proxies].sort(compareProxySpeedDesc);

  // Cache mode short-circuits expensive probing:
  // hit => return final cached list; miss => return empty instead of leaking source nodes.
  if (cacheEnabled) {
    const cachedFinalProxies = tryReturnFinalProxiesCache();
    if (cachedFinalProxies) {
      return cachedFinalProxies;
    }
    $.info("[cache-final] miss, cache=1 return empty proxies");
    return [];
  }

  // Keep parsed speed/base-name metadata on each proxy for downstream selection/output.
  const sortedOriginalProxies = speedSortedInputProxies.map((proxy) => {
    const normalizedName = normalizeProxyName(proxy?.name);
    return {
      ...proxy,
      _base_name_speed: normalizedName.displayName,
      _speed_kb: normalizedName.speedKb,
    };
  });

  const aiOptions = normalizeAiOptions($arguments.ai);
  const aiDetections = buildAiDetections(aiOptions);
  const aiTarget = aiDetections.length ? Math.ceil(take / 2) : 0;
  const batchSize = Math.max(1, Math.ceil(take * 1.8));

  // Shared http-meta service config used to spawn per-batch local proxy ports.
  const httpMeta = {
    host: $arguments.http_meta_host ?? "127.0.0.1",
    port: $arguments.http_meta_port ?? 9876,
    protocol: $arguments.http_meta_protocol ?? "http",
    authorization: $arguments.http_meta_authorization ?? "",
  };
  const httpMetaApi = `${httpMeta.protocol}://${httpMeta.host}:${httpMeta.port}`;
  const timeoutMs = parsePositiveInteger(
    $arguments.timeout,
    DEFAULT_TIMEOUT_MS,
  );

  const aiHttpMetaStartDelay = parseInt(
    $arguments.ai_http_meta_start_delay ??
      $arguments.http_meta_start_delay ??
      3000,
    10,
  );
  const aiConcurrency = parseInt(
    $arguments.ai_concurrency ?? $arguments.concurrency ?? 10,
    10,
  );
  const aiMethod =
    `${$arguments.ai_method ?? $arguments.method ?? "get"}`.toLowerCase();
  const geminiCountry3AllowSet = toCountryCodeSet(
    $arguments.gm_country3_allow ?? $arguments.gemini_country3_allow ?? "",
  );
  const geminiCountry3DenySet = toCountryCodeSet(
    $arguments.gm_country3_deny ?? $arguments.gemini_country3_deny ?? "CHN",
  );

  const normalHttpMetaStartDelay = parseInt(
    $arguments.normal_http_meta_start_delay ??
      $arguments.http_meta_start_delay ??
      100,
    10,
  );
  const normalConcurrency = parseInt($arguments.concurrency ?? take, 10);
  const normalMethod = `${
    $arguments.speed_method ?? $arguments.method ?? "get"
  }`.toLowerCase();
  const validStatusRaw = $arguments.speed_status ?? $arguments.status ?? "200";
  const validStatus = new RegExp(validStatusRaw);
  const normalUrl = decodeURIComponent(
    $arguments.speed_url ?? $arguments.url ?? DEFAULT_SPEED_TEST_URL,
  );
  const normalUa = decodeURIComponent(
    $arguments.ua ||
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
  );

  $.info(
    `[gemini-country3] allow=${Array.from(geminiCountry3AllowSet).join("|") || "ANY"}, deny=${Array.from(geminiCountry3DenySet).join("|") || "NONE"}`,
  );

  // Convert to ClashMeta/internal format once, while preserving custom metadata keys.
  const internalProxies = [];
  sortedOriginalProxies.forEach((proxy, sortedIndex) => {
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
        _sorted_index: sortedIndex,
      });
    } catch (e) {
      $.error(e);
    }
  });

  $.info(
    `[setup] total=${sortedOriginalProxies.length}, core_supported=${internalProxies.length}, take=${take}, ai_target=${aiTarget}, batch_size=${batchSize}`,
  );
  $.info(`[mode] cache=${cacheEnabled ? 1 : 0}, ttl_ms=${cacheTtlMs}`);
  $.info(
    `[speed-test] url=${normalUrl}, method=${normalMethod}, size=actual_body, status=${validStatusRaw}`,
  );
  if (!internalProxies.length) return [];
  // Candidate tracking across all batches.
  const aiPassSet = new Set();
  const aiCheckedSet = new Set();
  const speedPassSet = new Set();
  const speedCheckedSet = new Set();
  const candidateSet = new Set();
  const speedResultByIndex = new Map();
  const proxyBySortedIndex = new Map(
    internalProxies.map((proxy) => [proxy._sorted_index, proxy]),
  );

  $.info(`[speed-stage] start: target=${take}, batch_size=${batchSize}`);

  let cursor = 0;
  while (speedPassSet.size < take && cursor < internalProxies.length) {
    const batch = internalProxies.slice(cursor, cursor + batchSize);
    cursor += batchSize;
    if (!batch.length) continue;

    const { speedPassBatchSet, speedResultBatchMap } =
      await processSpeedBatch(batch);
    addSpeedBatchResults(speedPassBatchSet, speedResultBatchMap);

    $.info(
      `[speed-stage-batch] total=${batch.length}, speed_pass_batch=${speedPassBatchSet.size}, speed_total=${speedPassSet.size}/${take}`,
    );
    $.info("========================================");
  }

  $.info(
    `[speed-stage] done: speed_total=${speedPassSet.size}/${take}, checked=${speedCheckedSet.size}/${internalProxies.length}`,
  );

  if (aiTarget > 0) {
    $.info(`[ai-stage] start: target=${aiTarget}, batch_size=${batchSize}`);

    while (!hasEnoughFinalCandidates()) {
      const aiBatch = getUncheckedAiSpeedPassedProxies().slice(0, batchSize);

      if (aiBatch.length) {
        const { aiPassBatchSet } = await processAiBatch(aiBatch);
        for (const sortedIndex of aiPassBatchSet) {
          aiPassSet.add(sortedIndex);
        }
        $.info(
          `[ai-stage-batch] total=${aiBatch.length}, ai_pass_batch=${aiPassBatchSet.size}, ai_total=${aiPassSet.size}/${aiTarget}, ai_candidate_total=${countAiCandidates()}/${aiTarget}`,
        );
        $.info("========================================");
        continue;
      }

      if (cursor >= internalProxies.length) {
        break;
      }

      const batch = internalProxies.slice(cursor, cursor + batchSize);
      cursor += batchSize;
      if (!batch.length) continue;

      $.info(
        `[speed-refill] start: ai_candidate_total=${countAiCandidates()}/${aiTarget}, speed_total=${speedPassSet.size}`,
      );
      const { speedPassBatchSet, speedResultBatchMap } =
        await processSpeedBatch(batch);
      addSpeedBatchResults(speedPassBatchSet, speedResultBatchMap);
      $.info(
        `[speed-refill-batch] total=${batch.length}, speed_pass_batch=${speedPassBatchSet.size}, speed_total=${speedPassSet.size}`,
      );
      $.info("========================================");

      if (!speedPassBatchSet.size && cursor >= internalProxies.length) {
        break;
      }
    }

    $.info(
      `[ai-stage] done: ai_total=${aiPassSet.size}/${aiTarget}, ai_candidate_total=${countAiCandidates()}/${aiTarget}, speed_total=${speedPassSet.size}, checked=${aiCheckedSet.size}`,
    );
  }

  // Build ranked records from speed-passed candidates only, then enforce AI quota.
  const candidateRecords = buildCandidateRecords(
    candidateSet,
    proxyBySortedIndex,
    aiPassSet,
    speedResultByIndex,
  );
  const aiCandidateCount = candidateRecords.filter((item) => item.isAi).length;
  const aiQuota = Math.min(aiTarget, aiCandidateCount, take);
  const selectedIndexSet = pickFinalRecords(candidateRecords, aiQuota, take);
  const selectedRecords = candidateRecords
    .filter((item) => selectedIndexSet.has(item.sortedIndex))
    .sort(compareCandidateRecords);
  const speedBackfillRecords = buildCandidateRecords(
    speedPassSet,
    proxyBySortedIndex,
    aiPassSet,
    speedResultByIndex,
  );
  const finalSelectedRecords = [...selectedRecords];
  if (finalSelectedRecords.length < take) {
    for (const record of speedBackfillRecords) {
      if (finalSelectedRecords.length >= take) break;
      if (selectedIndexSet.has(record.sortedIndex)) continue;
      selectedIndexSet.add(record.sortedIndex);
      finalSelectedRecords.push(record);
    }
  }
  finalSelectedRecords.sort(compareCandidateRecords);

  const finalProxies = finalSelectedRecords.map((item) =>
    item.isAi
      ? toAiProxyOutput(
          item.proxy,
          item.measuredSpeedKb ?? 0,
          item.durationMs ?? 0,
        )
      : toNormalProxyOutput(
          item.proxy,
          item.measuredSpeedKb ?? 0,
          item.durationMs ?? 0,
        ),
  );

  // Persist fully formatted final output for fast return in cache mode.
  saveFinalProxiesCache(finalProxies);

  $.info(
    `[done] ai=${aiPassSet.size}, ai_candidate=${aiCandidateCount}, ai_quota=${aiQuota}, speed=${speedPassSet.size}, candidate=${candidateSet.size}, filled=${Math.max(0, finalSelectedRecords.length - selectedRecords.length)}, output=${finalProxies.length}`,
  );
  return finalProxies;

  function countAiCandidates() {
    let total = 0;
    for (const sortedIndex of candidateSet) {
      if (aiPassSet.has(sortedIndex)) total++;
    }
    return total;
  }

  function hasEnoughFinalCandidates() {
    return candidateSet.size >= take && countAiCandidates() >= aiTarget;
  }

  function addSpeedBatchResults(speedPassBatchSet, speedResultBatchMap) {
    for (const [sortedIndex, speedResult] of speedResultBatchMap.entries()) {
      speedResultByIndex.set(sortedIndex, speedResult);
    }
    for (const sortedIndex of speedPassBatchSet) {
      speedPassSet.add(sortedIndex);
      candidateSet.add(sortedIndex);
    }
  }

  function getUncheckedAiSpeedPassedProxies() {
    return Array.from(candidateSet)
      .filter((sortedIndex) => !aiCheckedSet.has(sortedIndex))
      .map((sortedIndex) => proxyBySortedIndex.get(sortedIndex))
      .filter(Boolean)
      .sort(
        (a, b) =>
          (speedResultByIndex.get(b?._sorted_index)?.measuredSpeedKb ?? -1) -
            (speedResultByIndex.get(a?._sorted_index)?.measuredSpeedKb ?? -1) ||
          (b?._speed_kb ?? -1) - (a?._speed_kb ?? -1) ||
          (a?._sorted_index ?? 0) - (b?._sorted_index ?? 0),
      );
  }

  function tryReturnFinalProxiesCache() {
    // Cache payload is timestamped; return deep-cloned records to avoid mutation leaks.
    const cached = cache.get(FINAL_PROXIES_CACHE_KEY);
    if (!cached || isCacheExpired(cached)) return null;

    const cachedProxies = Array.isArray(cached.proxies)
      ? cloneProxyList(cached.proxies)
      : [];
    if (!cachedProxies.length) return null;

    const { proxies: normalizedProxies, changed } =
      normalizeFinalProxyNames(cachedProxies);
    if (changed) {
      cache.set(FINAL_PROXIES_CACHE_KEY, {
        proxies: cloneProxyList(normalizedProxies),
        ts: cached.ts,
      });
      $.info(
        `[cache-final] normalize names proxies=${normalizedProxies.length}`,
      );
    }

    $.info(`[cache-final] hit proxies=${cachedProxies.length}`);
    return normalizedProxies;
  }

  function saveFinalProxiesCache(records = []) {
    const proxiesForCache = Array.isArray(records)
      ? normalizeFinalProxyNames(records).proxies
      : [];
    if (!proxiesForCache.length) return;

    cache.set(FINAL_PROXIES_CACHE_KEY, {
      proxies: proxiesForCache,
      ts: Date.now(),
    });
    $.info(`[cache-final] save proxies=${proxiesForCache.length}`);
  }

  function normalizeFinalProxyNames(records = []) {
    let changed = false;
    const proxies = cloneProxyList(records).map((proxy) => {
      let nextProxy = proxy;
      if (
        nextProxy._duration_ms === undefined &&
        nextProxy._latency !== undefined
      ) {
        changed = true;
        nextProxy = {
          ...nextProxy,
          _duration_ms: nextProxy._latency,
        };
        delete nextProxy._latency;
      }
      if (
        nextProxy._avg_speed_kb === undefined &&
        nextProxy._speed_kb !== undefined &&
        nextProxy._base_name_speed === undefined
      ) {
        changed = true;
        nextProxy = {
          ...nextProxy,
          _avg_speed_kb: nextProxy._speed_kb,
        };
        delete nextProxy._speed_kb;
      }
      if (
        nextProxy._avg_speed_kb === undefined &&
        nextProxy._speed !== undefined
      ) {
        changed = true;
        nextProxy = {
          ...nextProxy,
          _avg_speed_kb: Math.round(Number(nextProxy._speed) * 128),
        };
        delete nextProxy._speed;
      }
      const normalizedName = normalizeFinalProxyName(nextProxy);
      if (normalizedName && normalizedName !== nextProxy.name) {
        changed = true;
        return { ...nextProxy, name: normalizedName };
      }
      return nextProxy;
    });
    return { proxies, changed };
  }

  function normalizeFinalProxyName(proxy = {}) {
    const measuredSpeedKb = Number(
      proxy._avg_speed_kb ?? (proxy._speed ? Number(proxy._speed) * 128 : 0),
    );
    const rawName = `${proxy.name ?? ""}`.trim();
    if (!rawName) return rawName;

    const tags = getOutputTags(proxy, rawName);
    let baseName = stripOutputTags(rawName);
    baseName = stripMeasuredSpeedSuffix(baseName);
    baseName = normalizeProxyName(baseName).displayName;
    if (!baseName) return rawName;

    return formatMeasuredName(
      baseName,
      measuredSpeedKb,
      proxy._duration_ms ?? proxy._latency,
      tags,
    );
  }

  function getOutputTags(proxy = {}, name = "") {
    const tags = [];
    if (proxy._gpt === true || /\sGPT\s*$|\sGPT\s+GM\s*$/i.test(name)) {
      tags.push("GPT");
    }
    if (proxy._gemini === true || /\sGM\s*$/i.test(name)) {
      tags.push("GM");
    }
    return tags;
  }

  function stripOutputTags(name = "") {
    let result = `${name ?? ""}`.trim();
    while (/\s(?:GPT|GM)\s*$/i.test(result)) {
      result = result.replace(/\s(?:GPT|GM)\s*$/i, "").trim();
    }
    return result;
  }

  function stripMeasuredSpeedSuffix(name = "") {
    return `${name ?? ""}`
      .replace(/\s+B\d+(?:\.\d+)?(?:M\+\/s|K\+\/s)\s*$/i, "")
      .trim();
  }

  function cloneProxyList(list = []) {
    // JSON clone is fastest/simple for plain objects; fallback keeps behavior safe.
    try {
      return JSON.parse(JSON.stringify(list));
    } catch (e) {
      return list.map((item) => ({ ...item }));
    }
  }

  function parsePositiveInteger(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  async function processSpeedBatch(batch = []) {
    const speedPassBatchSet = new Set();
    const speedResultBatchMap = new Map();

    const proxiesToCheck = batch.filter(
      (proxy) => !speedCheckedSet.has(proxy._sorted_index),
    );

    if (!proxiesToCheck.length) {
      return { speedPassBatchSet, speedResultBatchMap };
    }

    let httpMetaPid;
    try {
      const batchHttpMeta = await startHttpMetaForBatch(proxiesToCheck, {
        label: "speed",
        startDelay: normalHttpMetaStartDelay,
        proxyTimeout: timeoutMs,
        timeoutMultiplier: 2,
      });
      httpMetaPid = batchHttpMeta.pid;

      await executeAsyncTasks(
        proxiesToCheck.map((proxy) => async () => {
          const sortedIndex = proxy._sorted_index;
          const port = batchHttpMeta.portBySortedIndex.get(sortedIndex);
          if (port === undefined || port === null) {
            throw new Error(`[${proxy.name}] missing http-meta port mapping`);
          }

          speedCheckedSet.add(sortedIndex);
          const speedResult = await checkNormalWithHttpMeta(proxy, port);
          if (speedResult?.ok) {
            speedPassBatchSet.add(sortedIndex);
            speedResultBatchMap.set(sortedIndex, {
              durationMs: speedResult.durationMs,
              measuredSpeedKb: speedResult.measuredSpeedKb,
            });
          }
        }),
        { concurrency: normalConcurrency },
      );
    } catch (e) {
      $.error(e);
    } finally {
      await stopHttpMetaForBatch(httpMetaPid, "speed");
    }

    return { speedPassBatchSet, speedResultBatchMap };
  }

  async function processAiBatch(batch = []) {
    const aiPassBatchSet = new Set();
    const proxiesToCheck = batch.filter(
      (proxy) => !aiCheckedSet.has(proxy._sorted_index),
    );

    if (!proxiesToCheck.length || !aiDetections.length) {
      return { aiPassBatchSet };
    }

    let httpMetaPid;
    try {
      const batchHttpMeta = await startHttpMetaForBatch(proxiesToCheck, {
        label: "ai",
        startDelay: aiHttpMetaStartDelay,
        proxyTimeout: timeoutMs,
        timeoutMultiplier: aiDetections.length,
      });
      httpMetaPid = batchHttpMeta.pid;

      await executeAsyncTasks(
        proxiesToCheck.map((proxy) => async () => {
          const sortedIndex = proxy._sorted_index;
          const port = batchHttpMeta.portBySortedIndex.get(sortedIndex);
          if (port === undefined || port === null) {
            throw new Error(`[${proxy.name}] missing http-meta port mapping`);
          }

          aiCheckedSet.add(sortedIndex);
          for (const detection of aiDetections) {
            const result = await checkAiWithHttpMeta(proxy, port, detection);
            if (result.outcome !== "success") {
              break;
            }
          }

          if (
            aiDetections.every((detection) => proxy[detection.flagKey] === true)
          ) {
            aiPassBatchSet.add(sortedIndex);
          }
        }),
        { concurrency: aiConcurrency },
      );
    } catch (e) {
      $.error(e);
    } finally {
      await stopHttpMetaForBatch(httpMetaPid, "ai");
    }

    return { aiPassBatchSet };
  }

  async function checkAiWithHttpMeta(proxy, port, detection) {
    try {
      const startedAt = Date.now();
      const requestMethod = detection.key === "gemini" ? "get" : aiMethod;
      const res = await http({
        proxy: `http://${httpMeta.host}:${port}`,
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

      const status = parseInt(res.status || res.statusCode || 200, 10);
      let message = "";
      let bodyText = "";
      let geminiCountry3 = "";
      if (detection.key === "gemini") {
        const location = getHeaderValue(res.headers, "location");
        bodyText = String(res.body ?? res.rawBody ?? "");
        geminiCountry3 = getGeminiCountry3(bodyText);
        const details = [];
        if (location) details.push(`location: ${location}`);
        if (geminiCountry3) details.push(`gbar_country3: ${geminiCountry3}`);
        message = details.join(", ");
      } else {
        const rawBody = String(res.body ?? res.rawBody ?? "");
        let body = rawBody;
        try {
          body = JSON.parse(rawBody);
        } catch (e) {}
        message = String(
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
        `[${proxy.name}] [${detection.name}] status=${status}, msg=${message}, latency=${latency}`,
      );

      const outcome = classifyAiResult({
        detection,
        status,
        geminiCountry3,
      });

      if (outcome === "success") {
        applyAiDetectionSuccess(proxy, detection, latency);
      }

      return { outcome };
    } catch (e) {
      $.error(`[${proxy.name}] [${detection.name}] ${e.message ?? e}`);
      return { outcome: "hard_failure" };
    }
  }

  async function checkSpeedLatencyWithHttpMeta(proxy, port) {
    try {
      const startedAt = Date.now();
      const res = await http({
        proxy: `http://${httpMeta.host}:${port}`,
        method: "head",
        timeout: timeoutMs,
        headers: {
          "User-Agent": normalUa,
        },
        url: normalUrl,
      });
      const status = parseInt(res.status || res.statusCode || 200, 10);
      const latencyMs = Date.now() - startedAt;
      $.info(
        `[${proxy.name}] [speed-latency] status=${status}, latency=${latencyMs}`,
      );

      if (validStatus.test(`${status}`)) {
        return {
          ok: true,
          latencyMs,
        };
      }

      return { ok: false };
    } catch (e) {
      $.error(`[${proxy.name}] [speed-latency] ${e.message ?? e}`);
      return { ok: false };
    }
  }

  async function checkNormalWithHttpMeta(proxy, port) {
    try {
      const latencyResult = await checkSpeedLatencyWithHttpMeta(proxy, port);
      if (!latencyResult?.ok) {
        return { ok: false };
      }

      const latencyMs = latencyResult.latencyMs;
      const startedAt = Date.now();
      const res = await http({
        proxy: `http://${httpMeta.host}:${port}`,
        method: normalMethod,
        timeout: timeoutMs,
        headers: {
          "User-Agent": normalUa,
        },
        url: normalUrl,
      });
      const status = parseInt(res.status || res.statusCode || 200, 10);
      const durationMs = Date.now() - startedAt;
      const effectiveDurationMs = Math.max(durationMs - latencyMs, 1);
      const responseBytes = getResponseBodyByteLength(res);
      const rawMeasuredSpeedKb =
        effectiveDurationMs > 0 && responseBytes > 0
          ? Math.round(responseBytes / 1024 / (effectiveDurationMs / 1000))
          : 0;
      const maxMeasuredSpeedKb =
        responseBytes > 0 ? Math.round(responseBytes / 1024) : 0;
      const measuredSpeedKb =
        rawMeasuredSpeedKb > 0 && maxMeasuredSpeedKb > 0
          ? Math.min(rawMeasuredSpeedKb, maxMeasuredSpeedKb)
          : 0;
      const withinEffectiveTimeout = effectiveDurationMs <= DEFAULT_TIMEOUT_MS;
      $.info(
        `[${proxy.name}] [speed] status=${status}, duration=${durationMs}, latency=${latencyMs}, effective_duration=${effectiveDurationMs}, effective_timeout=${DEFAULT_TIMEOUT_MS}, bytes=${responseBytes}, max_speed=${formatSpeedText(maxMeasuredSpeedKb)}, speed=${formatSpeedText(measuredSpeedKb)}`,
      );

      if (
        validStatus.test(`${status}`) &&
        withinEffectiveTimeout &&
        responseBytes > 0 &&
        measuredSpeedKb > 0
      ) {
        return {
          ok: true,
          sortedIndex: proxy._sorted_index,
          durationMs,
          measuredSpeedKb,
        };
      }

      return { ok: false };
    } catch (e) {
      $.error(`[${proxy.name}] [speed] ${e.message ?? e}`);
      return { ok: false };
    }
  }

  function classifyAiResult({ detection, status, geminiCountry3 = "" }) {
    // GPT heuristic: reachable endpoints usually return 404 from this probe route.
    if (detection.key === "gpt") {
      return status === 404 ? "success" : "hard_failure";
    }
    // Gemini heuristic: 200 + valid country pass; 302 usually indicates unsupported region.
    if (detection.key === "gemini") {
      if (status === 302) return "unsupported";
      if (status === 200) {
        const country3 = `${geminiCountry3 ?? ""}`.toUpperCase();
        if (!country3) return "transient_failure";
        if (geminiCountry3AllowSet.size) {
          return geminiCountry3AllowSet.has(country3)
            ? "success"
            : "unsupported";
        }
        if (geminiCountry3DenySet.has(country3)) {
          return "unsupported";
        }
        return "success";
      }
      return "transient_failure";
    }
    return "hard_failure";
  }

  function isCacheExpired(cached) {
    const ts = Number(cached?.ts ?? 0);
    if (!ts || !Number.isFinite(ts)) return true;
    return Date.now() - ts > cacheTtlMs;
  }

  async function startHttpMetaForBatch(batchProxies = [], options = {}) {
    const {
      label = "batch",
      startDelay = 1000,
      proxyTimeout = DEFAULT_TIMEOUT_MS,
      timeoutMultiplier = 1,
    } = options;

    // Timeout scales with batch size and request count per proxy.
    const totalTimeout =
      startDelay +
      batchProxies.length *
        proxyTimeout *
        Math.max(1, Number(timeoutMultiplier) || 1);

    const startRes = await http({
      retries: 0,
      method: "post",
      url: `${httpMetaApi}/start`,
      headers: {
        "Content-type": "application/json",
        Authorization: httpMeta.authorization,
      },
      body: JSON.stringify({
        proxies: batchProxies,
        timeout: totalTimeout,
      }),
    });

    const startStatus = parseInt(
      startRes?.status || startRes?.statusCode || 0,
      10,
    );
    const rawBody = String(startRes?.body ?? "");
    let body = rawBody;
    try {
      body = JSON.parse(body);
    } catch (e) {}

    const { ports, pid } = body || {};
    if (!pid || !Array.isArray(ports)) {
      throw new Error(
        `[${label}] http-meta start failed: ${JSON.stringify(body)}`,
      );
    }
    if (ports.length < batchProxies.length) {
      throw new Error(
        `[${label}] http-meta ports not enough: ${ports.length}/${batchProxies.length}`,
      );
    }

    const portBySortedIndex = new Map();
    batchProxies.forEach((proxy, index) => {
      portBySortedIndex.set(proxy._sorted_index, ports[index]);
    });

    const portsCount = Array.isArray(ports) ? ports.length : 0;
    $.info(
      `======== HTTP-META START [${label}] ========\n[status] ${startStatus} [pid] ${pid} [ports_count] ${portsCount} [proxies] ${batchProxies.length} [timeout] ${totalTimeout}`,
    );
    await $.wait(startDelay);
    return { pid, portBySortedIndex };
  }

  async function stopHttpMetaForBatch(pid, label = "batch") {
    if (!pid) return;
    try {
      const stopRes = await http({
        method: "post",
        url: `${httpMetaApi}/stop`,
        headers: {
          "Content-type": "application/json",
          Authorization: httpMeta.authorization,
        },
        body: JSON.stringify({
          pid: [pid],
        }),
      });
      const stopStatus = parseInt(
        stopRes?.status || stopRes?.statusCode || 0,
        10,
      );
      $.info(
        `======== HTTP-META STOP [${label}] =========\n[status] ${stopStatus} [pid] ${pid}`,
      );
    } catch (e) {
      $.error(e);
    }
  }

  function applyAiDetectionSuccess(proxy, detection, latency) {
    if (proxy[detection.flagKey] === true) return;
    proxy[detection.flagKey] = true;
    proxy[detection.latencyKey] = latency;
  }

  function toAiProxyOutput(proxy, measuredSpeedKb = 0, durationMs = 0) {
    // Keep AI capability metadata for downstream rules/inspection.
    const parsed = safeParseProxy(proxy);
    const baseName = getBaseNameWithSpeed(proxy);
    const aiTags = [];
    for (const detection of aiDetections) {
      if (proxy[detection.flagKey] === true) {
        aiTags.push(detection.appendTag);
      }
    }
    if (proxy._gpt === true) parsed._gpt = true;
    if (proxy._gpt_latency !== undefined)
      parsed._gpt_latency = proxy._gpt_latency;
    if (proxy._gemini === true) parsed._gemini = true;
    if (proxy._gemini_latency !== undefined) {
      parsed._gemini_latency = proxy._gemini_latency;
    }
    if (measuredSpeedKb > 0) parsed._avg_speed_kb = measuredSpeedKb;
    if (durationMs > 0) parsed._duration_ms = `${durationMs}`;
    parsed.name = formatMeasuredName(
      baseName,
      measuredSpeedKb,
      durationMs,
      aiTags,
    );
    return parsed;
  }

  function toNormalProxyOutput(proxy, measuredSpeedKb, durationMs) {
    const parsed = safeParseProxy(proxy);
    const baseName = getBaseNameWithSpeed(proxy);
    parsed.name = formatMeasuredName(baseName, measuredSpeedKb, durationMs);
    parsed._avg_speed_kb = measuredSpeedKb;
    parsed._duration_ms = `${durationMs}`;
    return parsed;
  }

  function formatMeasuredName(
    name,
    measuredSpeedKb = 0,
    durationMs = 0,
    suffixTags = [],
  ) {
    const speedSuffix =
      appendMeasuredSpeed && measuredSpeedKb > 0
        ? ` ${formatEstimatedSpeedNameText(measuredSpeedKb)}`
        : "";
    const tagSuffix = suffixTags.length ? ` ${suffixTags.join(" ")}` : "";
    return `${name}${speedSuffix}${tagSuffix}`;
  }

  function formatSpeedText(speedKb = 0) {
    const kb = Number(speedKb);
    if (!Number.isFinite(kb) || kb <= 0) return "";
    if (kb >= 1024) {
      return `${Math.round((kb / 1024) * 10) / 10}MB/s`;
    }
    return `${Math.round(kb)}KB/s`;
  }

  function safeParseProxy(proxy) {
    // Prefer canonical parser output; fallback keeps original shape if parse fails.
    try {
      const parsed = ProxyUtils.parse(JSON.stringify(proxy))?.[0];
      if (!parsed) throw new Error("parse result empty");
      delete parsed._sorted_index;
      delete parsed._base_name_speed;
      delete parsed._speed_kb;
      delete parsed._original_name;
      return parsed;
    } catch (e) {
      const fallback = { ...proxy };
      delete fallback._sorted_index;
      delete fallback._base_name_speed;
      delete fallback._speed_kb;
      delete fallback._original_name;
      return fallback;
    }
  }

  function getBaseNameWithSpeed(proxy) {
    const base = `${proxy?._base_name_speed ?? ""}`.trim();
    if (base) return base;
    return normalizeProxyName(proxy?.name).displayName;
  }

  function buildCandidateRecords(candidates, proxyMap, aiSet, speedResultMap) {
    // Ranking priority: measured speed first, then incoming speed text.
    return Array.from(candidates)
      .map((sortedIndex) => {
        const proxy = proxyMap.get(sortedIndex);
        if (!proxy) return null;
        const isAi = aiSet.has(sortedIndex);
        const speedResult = speedResultMap.get(sortedIndex) || {};
        return {
          sortedIndex,
          isAi,
          measuredSpeedKb: Number(speedResult.measuredSpeedKb ?? -1),
          speedKb: proxy._speed_kb ?? -1,
          durationMs: speedResult.durationMs ?? 0,
          proxy,
        };
      })
      .filter(Boolean)
      .sort(compareCandidateRecords);
  }

  function compareCandidateRecords(a, b) {
    return (
      (b?.measuredSpeedKb ?? -1) - (a?.measuredSpeedKb ?? -1) ||
      (b?.speedKb ?? -1) - (a?.speedKb ?? -1) ||
      Number(b?.isAi ?? false) - Number(a?.isAi ?? false) ||
      (a?.sortedIndex ?? 0) - (b?.sortedIndex ?? 0)
    );
  }

  function pickFinalRecords(records, aiQuota, maxCount) {
    // First pass reserves AI quota, second pass fills remaining capacity.
    const selected = new Set();
    let aiCount = 0;
    let totalCount = 0;

    for (const record of records) {
      if (totalCount >= maxCount) break;
      if (!record.isAi) continue;
      if (aiCount >= aiQuota) break;
      selected.add(record.sortedIndex);
      aiCount++;
      totalCount++;
    }

    if (totalCount >= maxCount) return selected;

    for (const record of records) {
      if (totalCount >= maxCount) break;
      if (selected.has(record.sortedIndex)) continue;
      selected.add(record.sortedIndex);
      totalCount++;
    }

    return selected;
  }

  function buildAiDetections(options = []) {
    // Supported short names: GPT, GM/GEMINI.
    const normalized = Array.from(
      new Set(
        options
          .map((item) => `${item ?? ""}`.trim().toUpperCase())
          .filter(Boolean),
      ),
    );

    const detections = [];
    const gptEnabled = normalized.includes("GPT");
    const gmEnabled =
      normalized.includes("GM") || normalized.includes("GEMINI");

    if (gptEnabled) {
      detections.push({
        key: "gpt",
        name: "GPT",
        appendTag: "GPT",
        url: "https://ios.chat.openai.com/public-api/auth/session",
        flagKey: "_gpt",
        latencyKey: "_gpt_latency",
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
      });
    }

    if (gmEnabled) {
      detections.push({
        key: "gemini",
        name: "GM",
        appendTag: "GM",
        url: "https://gemini.google.com/app",
        flagKey: "_gemini",
        latencyKey: "_gemini_latency",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      });
    }

    return detections;
  }

  function normalizeAiOptions(rawAi) {
    // Accepts array, JSON array/string, comma list, or a single token.
    const defaultAi = ["GPT", "GM"];
    if (rawAi === undefined || rawAi === null) return defaultAi;

    if (Array.isArray(rawAi)) {
      const cleaned = rawAi
        .map((item) => `${item ?? ""}`.trim())
        .filter(Boolean);
      return cleaned.length ? cleaned : defaultAi;
    }

    if (typeof rawAi !== "string") return defaultAi;

    const trimmed = rawAi.trim();
    if (!trimmed) return defaultAi;

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .map((item) => `${item ?? ""}`.trim())
          .filter(Boolean);
        return cleaned.length ? cleaned : defaultAi;
      }
      if (typeof parsed === "string" && parsed.trim()) return [parsed.trim()];
    } catch (e) {}

    if (trimmed.includes(",")) {
      const list = trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return list.length ? list : defaultAi;
    }

    return [trimmed];
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

  function getResponseBodyByteLength(res = {}) {
    const body = res?.rawBody ?? res?.body;
    if (body === undefined || body === null) return 0;

    if (typeof body === "string") {
      return getUtf8ByteLength(body);
    }

    if (typeof ArrayBuffer !== "undefined") {
      if (body instanceof ArrayBuffer) return body.byteLength;
      if (ArrayBuffer.isView?.(body)) return body.byteLength;
    }

    if (typeof body === "object" && Number.isFinite(body.byteLength)) {
      return body.byteLength;
    }

    return 0;
  }

  function getUtf8ByteLength(text = "") {
    const value = `${text ?? ""}`;
    if (!value) return 0;

    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(value).byteLength;
    }

    if (typeof Buffer !== "undefined") {
      return Buffer.byteLength(value, "utf8");
    }

    let bytes = 0;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code < 0x80) {
        bytes += 1;
      } else if (code < 0x800) {
        bytes += 2;
      } else if (
        code >= 0xd800 &&
        code <= 0xdbff &&
        i + 1 < value.length &&
        value.charCodeAt(i + 1) >= 0xdc00 &&
        value.charCodeAt(i + 1) <= 0xdfff
      ) {
        bytes += 4;
        i++;
      } else {
        bytes += 3;
      }
    }
    return bytes;
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

  async function http(opt = {}) {
    const METHOD = `${opt.method || $arguments.method || "get"}`.toLowerCase();
    const TIMEOUT = parsePositiveInteger(opt.timeout, timeoutMs);
    const RETRIES = parseFloat(opt.retries ?? $arguments.retries ?? 1);
    const RETRY_DELAY = parseFloat(
      opt.retry_delay ?? $arguments.retry_delay ?? 1000,
    );
    let count = 0;

    // Small retry wrapper for transient network instability.
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
    // Lightweight promise pool with bounded concurrency.
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
            resolve(result ? results : undefined);
          }
        }

        await executeNextTask();
      } catch (e) {
        reject(e);
      }
    });
  }
}

function parseSpeedToKb(name = "") {
  // Supported formats:
  // - "<base>|<speed>", e.g. "JP-01|12.3MB/s"
  // - output names with "A<speed>+/s" / "B<speed>+/s", e.g. "JP-01 A12.3M+/s B1M+/s"
  const raw = `${name ?? ""}`;
  const pipeSpeed = raw.split("|")[1] ?? "";
  const parsedPipeSpeed = parseSpeedTextToKb(pipeSpeed);
  if (parsedPipeSpeed > 0) return parsedPipeSpeed;

  const referenceSpeed = parseLabeledSpeedToKb(raw, SPEED_REFERENCE_LABEL);
  if (referenceSpeed > 0) return referenceSpeed;

  return parseSpeedTextToKb(raw);
}

function normalizeProxyName(name = "") {
  // Parse and expose commonly reused name/speed fields once.
  const raw = `${name ?? ""}`.trim();
  const parts = raw.split("|");
  const speedKb = parseSpeedToKb(raw);
  const baseName =
    stripUnlabeledSpeedSuffix(stripSpeedLabels(`${parts[0] ?? raw}`)).trim() ||
    "UNKNOWN";
  const speedText = speedKb > 0 ? formatSpeedNameText(speedKb) : "";
  const displayName =
    speedKb > 0 ? `${baseName} ${SPEED_REFERENCE_LABEL}${speedText}` : baseName;

  return {
    baseName,
    speedText,
    speedKb,
    displayName,
  };
}

function parseLabeledSpeedToKb(text = "", label = "") {
  const pattern = new RegExp(
    `(?:^|\\s)${label}\\s*(\\d+(?:\\.\\d+)?)\\s*(MB\\/s|KB\\/s|M\\+?\\/s|K\\+?\\/s|M|K)(?![\\w/+])`,
    "i",
  );
  const matched = `${text ?? ""}`.match(pattern);
  if (!matched) return -1;
  return speedValueToKb(matched[1], matched[2]);
}

function parseSpeedTextToKb(text = "") {
  const matched = `${text ?? ""}`.match(
    /(\d+(?:\.\d+)?)\s*(MB\/s|KB\/s|M\+?\/s|K\+?\/s|M|K)(?![\w/+])/i,
  );
  if (!matched) return -1;
  return speedValueToKb(matched[1], matched[2]);
}

function speedValueToKb(value, unit) {
  const speed = parseFloat(value);
  if (!Number.isFinite(speed) || speed <= 0) return -1;
  const normalizedUnit = `${unit ?? ""}`.toUpperCase().replace("+", "");
  if (
    normalizedUnit === "MB/S" ||
    normalizedUnit === "M/S" ||
    normalizedUnit === "M"
  ) {
    return speed * 1024;
  }
  if (
    normalizedUnit === "KB/S" ||
    normalizedUnit === "K/S" ||
    normalizedUnit === "K"
  ) {
    return speed;
  }
  return -1;
}

function stripSpeedLabels(name = "") {
  return `${name ?? ""}`
    .replace(/\s+[AB]\s*\d+(?:\.\d+)?(?:M\+\/s|K\+\/s)(?=\s|$)/gi, "")
    .trim();
}

function stripUnlabeledSpeedSuffix(name = "") {
  return `${name ?? ""}`
    .replace(/\s+\d+(?:\.\d+)?(?:MB\/s|KB\/s|M\+?\/s|K\+?\/s|M|K)\s*$/i, "")
    .trim();
}

function formatEstimatedSpeedNameText(speedKb = 0) {
  const kb = Number(speedKb);
  if (!Number.isFinite(kb) || kb <= 0) return "";
  if (kb >= 1024) {
    return `B${Math.round((kb / 1024) * 10) / 10}M+/s`;
  }
  return `B${Math.round(kb)}K+/s`;
}

function formatSpeedNameText(speedKb = 0) {
  const kb = Number(speedKb);
  if (!Number.isFinite(kb) || kb <= 0) return "";
  if (kb >= 1024) {
    return `${Math.round((kb / 1024) * 10) / 10}M+/s`;
  }
  return `${Math.round(kb)}K+/s`;
}
