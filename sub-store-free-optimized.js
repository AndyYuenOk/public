const FINAL_PROXIES_CACHE_KEY = "sub-store-free-optimized:final-proxies";

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

  let cacheEnabled = /true|1/i.test(`${$arguments.cache ?? 0}`);
  // $options is undefined in preview and cron
  // Always cache for the client.
  if ($options?._req) {
    cacheEnabled = 1;
  }

  const cacheTtlMs = $arguments.cache_ttl_ms ?? 24 * 60 * 60 * 1000;
  const speedSortedInputProxies = [...proxies].sort(compareProxySpeedDesc);

  // Cache mode short-circuits expensive probing:
  // hit => return final cached list; miss => return speed-sorted list immediately.
  if (cacheEnabled) {
    const cachedFinalProxies = tryReturnFinalProxiesCache();
    if (cachedFinalProxies) {
      return cachedFinalProxies;
    }
    $.info("[cache-final] miss, cache=1 return speed-sorted proxies");
    return speedSortedInputProxies;
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
  const batchSize = 15;

  // Shared http-meta service config used to spawn per-batch local proxy ports.
  const httpMeta = {
    host: $arguments.http_meta_host ?? "127.0.0.1",
    port: $arguments.http_meta_port ?? 9876,
    protocol: $arguments.http_meta_protocol ?? "http",
    authorization: $arguments.http_meta_authorization ?? "",
  };
  const httpMetaApi = `${httpMeta.protocol}://${httpMeta.host}:${httpMeta.port}`;

  const aiHttpMetaStartDelay = parseInt(
    $arguments.ai_http_meta_start_delay ??
      $arguments.http_meta_start_delay ??
      3000,
    10,
  );
  const aiHttpMetaProxyTimeout = parseInt(
    $arguments.ai_http_meta_proxy_timeout ??
      $arguments.http_meta_proxy_timeout ??
      10000,
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
  const normalHttpMetaProxyTimeout = parseInt(
    $arguments.normal_http_meta_proxy_timeout ??
      $arguments.http_meta_proxy_timeout ??
      5000,
    10,
  );
  const normalConcurrency = parseInt($arguments.concurrency ?? take, 10);
  const normalMethod = `${$arguments.method ?? "head"}`.toLowerCase();
  const validStatusRaw = $arguments.status || "204";
  const validStatus = new RegExp(validStatusRaw);
  const normalUrl = decodeURIComponent(
    $arguments.url || "http://www.gstatic.com/generate_204",
  );
  const normalUa = decodeURIComponent(
    $arguments.ua ||
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
  );
  const showLatency = /true|1/i.test(`${$arguments.show_latency ?? 0}`);

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
  if (!internalProxies.length) return [];
  const speedTarget = Math.floor(take / 2);
  // Candidate tracking across all batches.
  const aiPassSet = new Set();
  const speedPassSet = new Set();
  const candidateSet = new Set();
  const speedLatencyByIndex = new Map();
  const proxyBySortedIndex = new Map(
    internalProxies.map((proxy) => [proxy._sorted_index, proxy]),
  );

  $.info(
    `[mixed-stage] start: ai_target=${aiTarget}, speed_target=${speedTarget}, take=${take}, batch_size=${batchSize}`,
  );

  // Main pass: run mixed AI+speed checks until quotas are met and output is filled.
  for (let cursor = 0; cursor < internalProxies.length; cursor += batchSize) {
    const batch = internalProxies.slice(cursor, cursor + batchSize);
    if (!batch.length) continue;

    const needAi = aiPassSet.size < aiTarget;
    const needSpeed =
      speedPassSet.size < speedTarget || candidateSet.size < take;
    if (!needAi && !needSpeed && candidateSet.size >= take) {
      break;
    }

    const { aiPassBatchSet, speedPassBatchSet, speedLatencyBatchMap } =
      await processMixedBatch(batch, { needAi, needSpeed });

    for (const [sortedIndex, latency] of speedLatencyBatchMap.entries()) {
      speedLatencyByIndex.set(sortedIndex, latency);
    }

    for (const sortedIndex of aiPassBatchSet) {
      aiPassSet.add(sortedIndex);
      candidateSet.add(sortedIndex);
    }
    for (const sortedIndex of speedPassBatchSet) {
      speedPassSet.add(sortedIndex);
      candidateSet.add(sortedIndex);
    }

    $.info(
      `[stage-mixed-batch] total=${batch.length}, ai_pass_batch=${aiPassBatchSet.size}, speed_pass_batch=${speedPassBatchSet.size}, ai_total=${aiPassSet.size}/${aiTarget}, speed_total=${speedPassSet.size}/${speedTarget}, candidate_total=${candidateSet.size}/${take}`,
    );
    $.info("========================================");

    if (
      aiPassSet.size >= aiTarget &&
      speedPassSet.size >= speedTarget &&
      candidateSet.size >= take
    ) {
      break;
    }
  }

  $.info(
    `[mixed-stage] done: ai_total=${aiPassSet.size}/${aiTarget}, speed_total=${speedPassSet.size}/${speedTarget}, candidate_total=${candidateSet.size}/${take}`,
  );

  // If AI quota is not satisfied, run a dedicated AI-only backfill on remaining proxies.
  if (aiTarget > 0 && aiPassSet.size < aiTarget) {
    $.info(
      `[ai-backfill] start ai_total=${aiPassSet.size}/${aiTarget}, batch_size=${batchSize}`,
    );
    const remainingAiProxies = internalProxies.filter(
      (proxy) => !aiPassSet.has(proxy._sorted_index),
    );
    for (
      let cursor = 0;
      cursor < remainingAiProxies.length;
      cursor += batchSize
    ) {
      if (aiPassSet.size >= aiTarget) break;
      const batch = remainingAiProxies.slice(cursor, cursor + batchSize);
      if (!batch.length) continue;
      const { aiPassBatchSet } = await processMixedBatch(batch, {
        needAi: true,
        needSpeed: false,
      });
      for (const sortedIndex of aiPassBatchSet) {
        aiPassSet.add(sortedIndex);
        candidateSet.add(sortedIndex);
      }
      $.info(
        `[ai-backfill-batch] total=${batch.length}, ai_pass_batch=${aiPassBatchSet.size}, ai_total=${aiPassSet.size}/${aiTarget}`,
      );
    }
    $.info(
      `[ai-backfill] done ai_total=${aiPassSet.size}/${aiTarget}, candidate_total=${candidateSet.size}/${take}`,
    );
  }

  // Build ranked candidate records, then enforce AI quota before filling remaining slots.
  const candidateRecords = buildCandidateRecords(
    candidateSet,
    proxyBySortedIndex,
    aiPassSet,
    speedLatencyByIndex,
  );
  const aiCandidateCount = candidateRecords.filter((item) => item.isAi).length;
  const aiQuota = Math.min(aiTarget, aiCandidateCount, take);
  const selectedIndexSet = pickFinalRecords(candidateRecords, aiQuota, take);
  const selectedRecords = candidateRecords
    .filter((item) => selectedIndexSet.has(item.sortedIndex))
    .sort(
      (a, b) =>
        (b?.speedKb ?? -1) - (a?.speedKb ?? -1) ||
        (a?.sortedIndex ?? 0) - (b?.sortedIndex ?? 0),
    );
  const speedBackfillRecords = buildCandidateRecords(
    speedPassSet,
    proxyBySortedIndex,
    aiPassSet,
    speedLatencyByIndex,
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
  finalSelectedRecords.sort(
    (a, b) =>
      (b?.speedKb ?? -1) - (a?.speedKb ?? -1) ||
      (a?.sortedIndex ?? 0) - (b?.sortedIndex ?? 0),
  );

  const finalProxies = finalSelectedRecords.map((item) =>
    item.isAi
      ? toAiProxyOutput(item.proxy)
      : toNormalProxyOutput(item.proxy, item.latency ?? 0),
  );

  // Persist fully formatted final output for fast return in cache mode.
  saveFinalProxiesCache(finalProxies);

  $.info(
    `[done] ai=${aiPassSet.size}, ai_quota=${aiQuota}, speed=${speedPassSet.size}, candidate=${candidateSet.size}, filled=${Math.max(0, finalSelectedRecords.length - selectedRecords.length)}, output=${finalProxies.length}`,
  );
  return finalProxies;

  function tryReturnFinalProxiesCache() {
    // Cache payload is timestamped; return deep-cloned records to avoid mutation leaks.
    const cached = cache.get(FINAL_PROXIES_CACHE_KEY);
    if (!cached || isCacheExpired(cached)) return null;

    const cachedProxies = Array.isArray(cached.proxies)
      ? cloneProxyList(cached.proxies)
      : [];
    if (!cachedProxies.length) return null;

    $.info(`[cache-final] hit proxies=${cachedProxies.length}`);
    return cachedProxies;
  }

  function saveFinalProxiesCache(records = []) {
    const proxiesForCache = Array.isArray(records)
      ? cloneProxyList(records)
      : [];
    if (!proxiesForCache.length) return;

    cache.set(FINAL_PROXIES_CACHE_KEY, {
      proxies: proxiesForCache,
      ts: Date.now(),
    });
    $.info(`[cache-final] save proxies=${proxiesForCache.length}`);
  }

  function cloneProxyList(list = []) {
    // JSON clone is fastest/simple for plain objects; fallback keeps behavior safe.
    try {
      return JSON.parse(JSON.stringify(list));
    } catch (e) {
      return list.map((item) => ({ ...item }));
    }
  }

  async function processMixedBatch(
    batch = [],
    { needAi = false, needSpeed = false } = {},
  ) {
    // Run AI and normal checks against the same http-meta batch to reduce startup overhead.
    const aiPassBatchSet = new Set();
    const speedPassBatchSet = new Set();
    const speedLatencyBatchMap = new Map();

    if (!batch.length || (!needAi && !needSpeed)) {
      return { aiPassBatchSet, speedPassBatchSet, speedLatencyBatchMap };
    }

    const aiPendingByIndex = new Map();
    const speedToCheckSet = new Set();
    const speedSuccessMap = new Map();

    for (const proxy of batch) {
      const sortedIndex = proxy._sorted_index;

      if (needAi) {
        const pendingDetections = [...aiDetections];
        if (pendingDetections.length > 0) {
          aiPendingByIndex.set(sortedIndex, pendingDetections);
        }
      }

      if (needSpeed) {
        speedToCheckSet.add(sortedIndex);
      }
    }

    const proxiesToCheckMap = new Map();
    if (needAi) {
      for (const sortedIndex of aiPendingByIndex.keys()) {
        const proxy = proxyBySortedIndex.get(sortedIndex);
        if (proxy) proxiesToCheckMap.set(sortedIndex, proxy);
      }
    }
    if (needSpeed) {
      for (const sortedIndex of speedToCheckSet) {
        const proxy = proxyBySortedIndex.get(sortedIndex);
        if (proxy) proxiesToCheckMap.set(sortedIndex, proxy);
      }
    }

    if (proxiesToCheckMap.size) {
      let httpMetaPid;
      try {
        const proxiesToCheck = Array.from(proxiesToCheckMap.values()).sort(
          (a, b) =>
            (b?._speed_kb ?? -1) - (a?._speed_kb ?? -1) ||
            (a?._sorted_index ?? 0) - (b?._sorted_index ?? 0),
        );
        // Estimate longest per-proxy request chain (ai detections + optional speed check)
        // to size http-meta timeout conservatively for this batch.
        let maxRequestsPerProxy = 1;
        for (const proxy of proxiesToCheck) {
          const sortedIndex = proxy._sorted_index;
          const aiRequestCount = needAi
            ? (aiPendingByIndex.get(sortedIndex)?.length ?? 0)
            : 0;
          const speedRequestCount =
            needSpeed && speedToCheckSet.has(sortedIndex) ? 1 : 0;
          maxRequestsPerProxy = Math.max(
            maxRequestsPerProxy,
            aiRequestCount + speedRequestCount,
          );
        }

        let mixedStartDelay = 1000;
        if (needAi)
          mixedStartDelay = Math.max(mixedStartDelay, aiHttpMetaStartDelay);
        if (needSpeed) {
          mixedStartDelay = Math.max(mixedStartDelay, normalHttpMetaStartDelay);
        }

        let mixedProxyTimeout = 5000;
        if (needAi) {
          mixedProxyTimeout = Math.max(
            mixedProxyTimeout,
            aiHttpMetaProxyTimeout,
          );
        }
        if (needSpeed) {
          mixedProxyTimeout = Math.max(
            mixedProxyTimeout,
            normalHttpMetaProxyTimeout,
          );
        }

        const mixedConcurrency = Math.max(
          1,
          needAi ? aiConcurrency : 1,
          needSpeed ? normalConcurrency : 1,
        );

        const batchHttpMeta = await startHttpMetaForBatch(proxiesToCheck, {
          label: "mixed",
          startDelay: mixedStartDelay,
          proxyTimeout: mixedProxyTimeout,
          timeoutMultiplier: maxRequestsPerProxy,
        });
        httpMetaPid = batchHttpMeta.pid;

        await executeAsyncTasks(
          proxiesToCheck.map((proxy) => async () => {
            const sortedIndex = proxy._sorted_index;
            const port = batchHttpMeta.portBySortedIndex.get(sortedIndex);
            if (port === undefined || port === null) {
              throw new Error(`[${proxy.name}] missing http-meta port mapping`);
            }

            if (needAi) {
              const pendingDetections = aiPendingByIndex.get(sortedIndex) || [];
              for (const detection of pendingDetections) {
                const result = await checkAiWithHttpMeta(
                  proxy,
                  port,
                  detection,
                );
                if (result.outcome !== "success") {
                  break;
                }
              }
            }

            if (needSpeed && speedToCheckSet.has(sortedIndex)) {
              const speedResult = await checkNormalWithHttpMeta(proxy, port);
              if (speedResult?.ok) {
                speedSuccessMap.set(sortedIndex, speedResult.latency);
              }
            }
          }),
          { concurrency: mixedConcurrency },
        );
      } catch (e) {
        $.error(e);
      } finally {
        await stopHttpMetaForBatch(httpMetaPid, "mixed");
      }
    }

    if (needAi) {
      for (const proxy of batch) {
        if (
          aiDetections.every((detection) => proxy[detection.flagKey] === true)
        ) {
          aiPassBatchSet.add(proxy._sorted_index);
        }
      }
    }

    if (needSpeed) {
      for (const [sortedIndex, latency] of speedSuccessMap.entries()) {
        speedPassBatchSet.add(sortedIndex);
        speedLatencyBatchMap.set(sortedIndex, latency);
      }
    }

    return { aiPassBatchSet, speedPassBatchSet, speedLatencyBatchMap };
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

  async function checkNormalWithHttpMeta(proxy, port) {
    try {
      const startedAt = Date.now();
      const res = await http({
        proxy: `http://${httpMeta.host}:${port}`,
        method: normalMethod,
        timeout: normalHttpMetaProxyTimeout,
        headers: {
          "User-Agent": normalUa,
        },
        url: normalUrl,
      });
      const status = parseInt(res.status || res.statusCode || 200, 10);
      const latency = Date.now() - startedAt;
      $.info(`[${proxy.name}] [normal] status=${status}, latency=${latency}`);

      if (validStatus.test(`${status}`)) {
        return {
          ok: true,
          sortedIndex: proxy._sorted_index,
          latency,
        };
      }

      return { ok: false };
    } catch (e) {
      $.error(`[${proxy.name}] [normal] ${e.message ?? e}`);
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
      proxyTimeout = 5000,
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

  function toAiProxyOutput(proxy) {
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
    parsed.name = aiTags.length ? `${baseName} ${aiTags.join(" ")}` : baseName;
    return parsed;
  }

  function toNormalProxyOutput(proxy, latency) {
    const parsed = safeParseProxy(proxy);
    const baseName = getBaseNameWithSpeed(proxy);
    parsed.name = `${showLatency ? `[${latency}] ` : ""}${baseName}`;
    parsed._latency = `${latency}`;
    return parsed;
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

  function buildCandidateRecords(candidates, proxyMap, aiSet, latencyMap) {
    // Ranking priority: higher speed first, then AI-capable before non-AI on ties.
    return Array.from(candidates)
      .map((sortedIndex) => {
        const proxy = proxyMap.get(sortedIndex);
        if (!proxy) return null;
        const isAi = aiSet.has(sortedIndex);
        return {
          sortedIndex,
          isAi,
          speedKb: proxy._speed_kb ?? -1,
          latency: latencyMap.get(sortedIndex) ?? 0,
          proxy,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.speedKb - a.speedKb || Number(b.isAi) - Number(a.isAi));
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
    const TIMEOUT = parseFloat(opt.timeout || $arguments.timeout || 5000);
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

function parseSpeedToKb(name) {
  // Name format is "<base>|<speed>", e.g. "JP-01|12.3MB/s".
  const speed = name.split("|")[1];
  if (speed.includes("MB/s")) {
    return parseFloat(speed) * 1024;
  } else if (speed.includes("KB/s")) {
    return parseFloat(speed);
  } else {
    return -1;
  }
}

function normalizeProxyName(name = "") {
  // Parse and expose commonly reused name/speed fields once.
  const raw = `${name ?? ""}`.trim();
  const parts = raw.split("|");
  const baseName = `${parts[0] ?? raw ?? "UNKNOWN"}`.trim();
  const speedText = `${parts[1] ?? ""}`.trim();
  const speedKb = parseSpeedToKb(raw);
  const displayName = speedText ? `${baseName} ${speedText}` : baseName;

  return {
    baseName,
    speedText,
    speedKb,
    displayName,
  };
}
