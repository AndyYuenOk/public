const FREE_STORE_FINAL_PROXIES_FIELD = "finalProxies";
// 测速文件，需要在超时时间内下载完成，目标越小越好。
// 由于下载爬坡等因素，估算速度 != 实际速度，但能保证最低速度。
// https://github.com/litterinchina/large-file-download-test
// 并行数量不要太多，避免并发抢带宽。
const DEFAULT_SPEED_TEST_URL =
  "https://github.com/BitDoctor/speed-test-file/raw/refs/heads/master/1mb.txt";
// 握手+协议开销+慢启动大约需要 2-3 秒，测速超时需要适当放宽。
const DEFAULT_TIMEOUT_MS = 10000;
const SPEED_REFERENCE_LABEL = "A";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const AI_DEFAULT_OPTIONS = ["openai", "claude", "google-ai-studio"];
const AI_ALLOWED_OPTIONS = ["openai", "gemini", "claude", "google-ai-studio"];
const AI_TAG_VALUE_BY_KEY = {
  openai: "OAI",
  gemini: "GME",
  claude: "CLD",
  googleAiStudio: "GAI",
  all: "AI",
};
const AI_CACHE_CAN_ACCESS_FIELD = "canAccess";
const AI_CACHE_LATENCY_FIELD = "latency";
const AI_ALL_TAG_FIELD = "tag";
const AI_VENDOR_TAG_FIELD = "tag";
const AI_DETECTION_CONFIG = {
  openai: {
    key: "openai",
    cacheAiName: "openai",
    name: "OpenAI",
    url: "https://chat.openai.com/cdn-cgi/trace",
    userAgent: BROWSER_UA,
  },
  gemini: {
    key: "gemini",
    cacheAiName: "gemini",
    name: "Gemini",
    url: "https://gemini.google.com/app",
    userAgent: BROWSER_UA,
  },
  claude: {
    key: "claude",
    cacheAiName: "claude",
    name: "Claude",
    url: "https://claude.ai/",
    userAgent: BROWSER_UA,
  },
  googleAiStudio: {
    key: "googleAiStudio",
    cacheAiName: "googleAiStudio",
    name: "AI Studio",
    url: "",
    userAgent: BROWSER_UA,
  },
};

async function operator(proxies = [], targetPlatform, context) {
  const firstSource = Object.values(context.source)[0];
  const sourceName = `${firstSource.name}-${firstSource.displayName}`;
  const FREE_STORE_KEY = `#${sourceName}`;

  const $ = $substore;
  let useCache = context.freeCache ?? 1;
  const store = useCache ? ($.read(FREE_STORE_KEY) ?? {}) : {};
  let storeDirty = false;
  const logInfo = (...args) => console.log(...args);
  const logError = (...args) => console.error(...args);
  const logAiInfo = (...args) => logInfo("[ai]", ...args);
  const logAiError = (...args) => logError("[ai]", ...args);
  const logAi = (...args) => logAiInfo(...args);
  const logBoundary = (phase = "") =>
    logInfo(
      `==================== [SUB-STORE-FREE-AVAILABLE ${phase}] ====================`,
    );
  const logHttpMetaBoundary = (phase = "", label = "") =>
    logInfo(
      `==================== [HTTP META ${phase}${label ? ` ${label}` : ""}] ====================`,
    );
  logBoundary("START");
  const markStoreDirty = () => {
    storeDirty = true;
  };
  const flushStore = () => {
    if (!storeDirty) return;
    try {
      $.write(store, FREE_STORE_KEY);
      storeDirty = false;
    } catch (e) {
      logError(
        `[cache-store] write failed key=${FREE_STORE_KEY}: ${e?.message ?? e}`,
      );
    }
  };
  // Incoming node names carry speed in text form; sort by parsed speed first.
  const compareProxySpeedDesc = (a, b) => {
    const speedA = normalizeProxyName(a?.name).speedKb ?? -1;
    const speedB = normalizeProxyName(b?.name).speedKb ?? -1;
    return speedB - speedA;
  };

  // Runtime knobs from script arguments.
  const take = parseInt($arguments.take ?? 10, 10);
  const enableSpeedTest = /true|1/i.test(`${$arguments.speed ?? 0}`);
  const googleAiStudioKey = `${
    $arguments.googleAiStudio_key ??
    eval("process.env.SUB_STORE_GOOGLE_API_KEY") ??
    ""
  }`.trim();
  const encodedGoogleAiStudioKey = encodeURIComponent(googleAiStudioKey);
  const hasGoogleAiStudioKey = Boolean(googleAiStudioKey);
  const aiTagByKey = {
    ...AI_TAG_VALUE_BY_KEY,
  };
  const aiTagFieldByKey = {
    openai: "tagOpenai",
    gemini: "tagGemini",
    claude: "tagClaude",
    googleAiStudio: "tagGoogleAiStudio",
    all: "tagAi",
  };
  const aiTags = Object.values(aiTagByKey).filter(Boolean);
  let aiDetections = [];

  const speedSortedInputProxies = [...proxies].sort(compareProxySpeedDesc);

  // Cache mode short-circuits expensive probing:
  // hit => return final cached list; miss => return empty instead of leaking source nodes.
  if (useCache) {
    const cachedFinalProxies = tryReturnFinalProxiesCache();
    if (cachedFinalProxies) {
      logBoundary("END");
      flushStore();
      return cachedFinalProxies;
    }
    logInfo("[cache-final] miss, cache=1 return empty proxies");
    logBoundary("END");
    flushStore();
    return [];
  }

  // Keep parsed speed/base-name metadata on each proxy for downstream selection/output.
  const sortedOriginalProxies = speedSortedInputProxies.map((proxy) => {
    const normalizedName = normalizeProxyName(proxy?.name);
    return {
      ...proxy,
      _original_name: proxy?.name,
      _base_name_speed: normalizedName.displayName,
      _speed_kb: normalizedName.speedKb,
    };
  });

  const aiDetectionConfigByKey = {
    ...AI_DETECTION_CONFIG,
    googleAiStudio: {
      ...AI_DETECTION_CONFIG.googleAiStudio,
      url: hasGoogleAiStudioKey
        ? `https://generativelanguage.googleapis.com/v1/models?key=${encodedGoogleAiStudioKey}`
        : "",
    },
  };
  const aiOptions = normalizeAiOptions($arguments.ai_detect);
  if (aiOptions.includes("googleAiStudio") && !hasGoogleAiStudioKey) {
    logInfo("[googleAiStudio] 未提供 googleAiStudio_key, 跳过 AI Studio 检测");
  }
  aiDetections = buildAiDetections(aiOptions, aiDetectionConfigByKey).filter(
    (detection) => detection.key !== "googleAiStudio" || hasGoogleAiStudioKey,
  );
  const aiTarget = aiDetections.length ? Math.ceil(take / 2) : 0;
  const batchSize = Math.max(1, take);
  const shouldWriteAiCache = true;

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
  const aiTimeoutMs = parsePositiveInteger($arguments.ai_timeout, 5000);

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
    $arguments.gemini_country3_allow ?? "",
  );
  const geminiCountry3DenySet = toCountryCodeSet(
    $arguments.gemini_country3_deny ?? "CHN",
  );
  const openaiCountry2DenySet = toCountryCode2Set(
    $arguments.openai_country2_deny ?? "CN,HK",
  );
  const claudeCountry2DenySet = toCountryCode2Set(
    $arguments.claude_country2_deny ?? "CN,HK",
  );
  const networkTransientFailureRegex =
    /exceeds the timeout|timed out|timeout|client network socket disconnected before secure tls connection was established|socket hang up|econnreset/i;
  const policyTransientFailureRegex =
    /request is not allowed[\s\S]*try again later|try again later|temporarily unavailable|too many requests|rate limit|unusual traffic|recaptcha|captcha/i;
  const unsupportedTextRegex =
    /unsupported_country|unsupported_country_region_territory|not available in your country|not available in your region|isn't available in your country|location is not supported|unavailable in (?:your )?region|unavailable in (?:your )?country/i;

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

  logInfo(
    `[gemini-country3] allow=${Array.from(geminiCountry3AllowSet).join("|") || "ANY"}, deny=${Array.from(geminiCountry3DenySet).join("|") || "NONE"}`,
  );
  logInfo(
    `[openai-country2] deny=${Array.from(openaiCountry2DenySet).join("|") || "NONE"}`,
  );
  logInfo(
    `[claude-country2] deny=${Array.from(claudeCountry2DenySet).join("|") || "NONE"}`,
  );
  logInfo(
    `[ai-detect] enabled=${aiDetections.map((item) => item.key).join("|") || "NONE"}`,
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
      node._origin_server = proxy.server;
      node._origin_port = proxy.port;
      internalProxies.push({
        ...node,
        _sorted_index: sortedIndex,
      });
    } catch (e) {
      logError(e);
    }
  });

  logInfo(
    `[setup] total=${sortedOriginalProxies.length}, core_supported=${internalProxies.length}, take=${take}, ai_target=${aiTarget}, batch_size=${batchSize}`,
  );
  logInfo(`[mode] cache=${useCache ? 1 : 0}`);
  logInfo(`[ai-timeout] ms=${aiTimeoutMs}`);
  logInfo(
    `[speed-test] enabled=${enableSpeedTest ? 1 : 0}, url=${normalUrl}, method=${normalMethod}, size=actual_body, status=${validStatusRaw}`,
  );
  if (!internalProxies.length) {
    logBoundary("END");
    flushStore();
    return [];
  }
  // Candidate tracking across all batches.
  const aiPassSet = new Set();
  const aiCheckedSet = new Set();
  const speedPassSet = new Set();
  const speedCheckedSet = new Set();
  const candidateSet = new Set();
  const speedResultByIndex = new Map();
  const pendingLogsByIndex = new Map();
  const proxyBySortedIndex = new Map(
    internalProxies.map((proxy) => [proxy._sorted_index, proxy]),
  );

  let cursor = 0;
  if (enableSpeedTest) {
    logInfo(`[speed-stage] start: target=${take}, batch_size=${batchSize}`);
    while (speedPassSet.size < take && cursor < internalProxies.length) {
      const batch = internalProxies.slice(cursor, cursor + batchSize);
      cursor += batchSize;
      if (!batch.length) continue;

      const { speedPassBatchSet, speedResultBatchMap } =
        await processSpeedBatch(batch);
      addSpeedBatchResults(speedPassBatchSet, speedResultBatchMap);

      logInfo(
        `[speed-stage-batch] total=${batch.length}, speed_pass_batch=${speedPassBatchSet.size}, speed_total=${speedPassSet.size}/${take}`,
      );
    }

    logInfo(
      `[speed-stage] done: speed_total=${speedPassSet.size}/${take}, checked=${speedCheckedSet.size}/${internalProxies.length}`,
    );
  } else {
    logInfo(
      `[speed-stage] skipped: speed=0, use parsed name speed ranking, target=${take}, batch_size=${batchSize}`,
    );
    while (speedPassSet.size < take && cursor < internalProxies.length) {
      const batch = internalProxies.slice(cursor, cursor + batchSize);
      cursor += batchSize;
      if (!batch.length) continue;

      addDirectBatchCandidates(batch);

      logInfo(
        `[speed-stage-batch] total=${batch.length}, speed_pass_batch=${batch.length}, speed_total=${speedPassSet.size}/${take}`,
      );
    }
    logInfo(
      `[speed-stage] done: speed_total=${speedPassSet.size}/${take}, checked=0/${internalProxies.length}`,
    );
  }

  if (aiTarget > 0) {
    logInfo(`[ai-stage] start: target=${aiTarget}, batch_size=${batchSize}`);

    while (!hasEnoughFinalCandidates()) {
      const aiBatch = getUncheckedAiSpeedPassedProxies().slice(0, batchSize);

      if (aiBatch.length) {
        const { aiPassBatchSet } = await processAiBatch(aiBatch);
        for (const sortedIndex of aiPassBatchSet) {
          aiPassSet.add(sortedIndex);
        }
        logInfo(
          `[ai-stage-batch] total=${aiBatch.length}, ai_pass_batch=${aiPassBatchSet.size}, ai_total=${aiPassSet.size}/${aiTarget}, ai_candidate_total=${countAiCandidates()}/${aiTarget}`,
        );

        continue;
      }

      if (cursor >= internalProxies.length) {
        break;
      }

      const batch = internalProxies.slice(cursor, cursor + batchSize);
      cursor += batchSize;
      if (!batch.length) continue;

      if (enableSpeedTest) {
        logInfo(
          `[speed-refill] start: ai_candidate_total=${countAiCandidates()}/${aiTarget}, speed_total=${speedPassSet.size}`,
        );
        const { speedPassBatchSet, speedResultBatchMap } =
          await processSpeedBatch(batch);
        addSpeedBatchResults(speedPassBatchSet, speedResultBatchMap);
        logInfo(
          `[speed-refill-batch] total=${batch.length}, speed_pass_batch=${speedPassBatchSet.size}, speed_total=${speedPassSet.size}`,
        );
        logInfo("========================================");

        if (!speedPassBatchSet.size && cursor >= internalProxies.length) {
          break;
        }
      } else {
        logInfo(
          `[speed-refill] skipped-speed-test: ai_candidate_total=${countAiCandidates()}/${aiTarget}, speed_total=${speedPassSet.size}`,
        );
        addDirectBatchCandidates(batch);
        logInfo(
          `[speed-refill-batch] total=${batch.length}, speed_pass_batch=${batch.length}, speed_total=${speedPassSet.size}`,
        );
        logInfo("========================================");
      }
    }

    logInfo(
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

  const finalProxies = finalSelectedRecords.map((item) => {
    const keepAiResult = aiCheckedSet.has(item.sortedIndex);
    return item.isAi
      ? toAiProxyOutput(
          item.proxy,
          item.measuredSpeedKb ?? 0,
          item.durationMs ?? 0,
        )
      : toNormalProxyOutput(
          item.proxy,
          item.measuredSpeedKb ?? 0,
          item.durationMs ?? 0,
          keepAiResult,
        );
  });

  // Persist fully formatted final output for fast return in cache mode.
  saveFinalProxiesCache(finalProxies);
  pruneStoreToFinalProxies(finalSelectedRecords);

  logInfo(
    `[done] ai=${aiPassSet.size}, ai_candidate=${aiCandidateCount}, ai_quota=${aiQuota}, speed=${speedPassSet.size}, candidate=${candidateSet.size}, filled=${Math.max(0, finalSelectedRecords.length - selectedRecords.length)}, output=${finalProxies.length}`,
  );
  logBoundary("END");
  flushStore();
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

  function addDirectBatchCandidates(batch = []) {
    for (const proxy of batch) {
      const sortedIndex = proxy?._sorted_index;
      if (sortedIndex === undefined || sortedIndex === null) continue;
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
    // Return deep-cloned records to avoid mutation leaks.
    const cached = store[FREE_STORE_FINAL_PROXIES_FIELD];
    if (!Array.isArray(cached)) return null;

    const cachedProxies = Array.isArray(cached) ? cloneProxyList(cached) : [];

    const { proxies: normalizedProxies, changed } =
      normalizeFinalProxyNames(cachedProxies);
    if (changed) {
      store[FREE_STORE_FINAL_PROXIES_FIELD] = cloneProxyList(normalizedProxies);
      markStoreDirty();
      logInfo(
        `[cache-final] normalize names proxies=${normalizedProxies.length}`,
      );
    }

    logInfo(`[cache-final] hit proxies=${cachedProxies.length}`);
    return normalizedProxies;
  }

  function saveFinalProxiesCache(records = []) {
    const proxiesForCache = Array.isArray(records)
      ? normalizeFinalProxyNames(records).proxies
      : [];

    store[FREE_STORE_FINAL_PROXIES_FIELD] = proxiesForCache;
    markStoreDirty();
    logInfo(`[cache-final] save proxies=${proxiesForCache.length}`);
  }

  function pruneStoreToFinalProxies(records = []) {
    const keepKeys = new Set([FREE_STORE_FINAL_PROXIES_FIELD]);
    for (const record of records) {
      const serverWithPort = getServerWithPortFromProxy(record?.proxy);
      if (serverWithPort) {
        keepKeys.add(serverWithPort);
      }
    }

    let changed = false;
    for (const key of Object.keys(store)) {
      if (!keepKeys.has(key)) {
        delete store[key];
        changed = true;
      }
    }
    if (changed) {
      markStoreDirty();
      logInfo(`[cache-store] prune keep=${keepKeys.size - 1}`);
    }
  }

  function normalizeFinalProxyNames(records = []) {
    let changed = false;
    const proxies = cloneProxyList(records).map((proxy) => {
      let nextProxy = proxy;
      if (
        nextProxy.measuredSpeed === undefined &&
        nextProxy._speed_kb !== undefined
      ) {
        changed = true;
        nextProxy = {
          ...nextProxy,
          measuredSpeed: formatLabeledSpeedText(nextProxy._speed_kb, "A"),
        };
      }
      if (
        nextProxy.guaranteedSpeed === undefined &&
        nextProxy._avg_speed_kb !== undefined
      ) {
        changed = true;
        nextProxy = {
          ...nextProxy,
          guaranteedSpeed: formatLabeledSpeedText(nextProxy._avg_speed_kb, "B"),
        };
      }
      if (
        nextProxy.guaranteedSpeed === undefined &&
        nextProxy._speed !== undefined
      ) {
        changed = true;
        nextProxy = {
          ...nextProxy,
          guaranteedSpeed: formatLabeledSpeedText(
            Math.round(Number(nextProxy._speed) * 128) || 0,
            "B",
          ),
        };
      }
      const normalizedMeasuredSpeed = formatLabeledSpeedText(
        toSpeedKbFromAny(nextProxy.measuredSpeed, "A"),
        "A",
      );
      if (`${nextProxy.measuredSpeed ?? ""}` !== normalizedMeasuredSpeed) {
        changed = true;
        nextProxy = {
          ...nextProxy,
          measuredSpeed: normalizedMeasuredSpeed,
        };
      }
      const normalizedGuaranteedSpeed = formatLabeledSpeedText(
        toSpeedKbFromAny(nextProxy.guaranteedSpeed, "B"),
        "B",
      );
      if (`${nextProxy.guaranteedSpeed ?? ""}` !== normalizedGuaranteedSpeed) {
        changed = true;
        nextProxy = {
          ...nextProxy,
          guaranteedSpeed: normalizedGuaranteedSpeed,
        };
      }
      const { proxy: taggedProxy, changed: tagChanged } = applyAiTagsToProxy(
        nextProxy,
        getOutputTags(nextProxy, `${nextProxy.name ?? ""}`),
      );
      if (tagChanged) {
        changed = true;
        nextProxy = taggedProxy;
      }
      const { proxy: cleanedProxy, changed: cleanedChanged } =
        cleanupOutputAiStatusFields(nextProxy);
      if (cleanedChanged) {
        changed = true;
        nextProxy = cleanedProxy;
      }
      if (
        nextProxy._avg_speed_kb !== undefined ||
        nextProxy._speed_kb !== undefined ||
        nextProxy._speed !== undefined ||
        nextProxy._latency !== undefined
      ) {
        changed = true;
        nextProxy = { ...nextProxy };
        delete nextProxy._avg_speed_kb;
        delete nextProxy._speed_kb;
        delete nextProxy._speed;
        delete nextProxy._latency;
      }
      return nextProxy;
    });
    return { proxies, changed };
  }

  function normalizeFinalProxyName(proxy = {}) {
    const measuredSpeedKb =
      toSpeedKbFromAny(proxy.guaranteedSpeed, "B") ||
      toSpeedKbFromAny(proxy._avg_speed_kb) ||
      toSpeedKbFromAny(proxy._speed ? Number(proxy._speed) * 128 : 0);
    const rawName = `${proxy.name ?? ""}`.trim();
    if (!rawName) return rawName;

    let baseName = stripOutputTags(rawName);
    baseName = stripMeasuredSpeedSuffix(baseName);
    baseName = normalizeProxyName(baseName).displayName;
    if (!baseName) return rawName;

    return formatMeasuredName(baseName, measuredSpeedKb, 0);
  }

  function getOutputTags(proxy = {}, name = "") {
    ensureProxyAiShape(proxy);
    const tags = [];
    const openaiTag = aiTagByKey.openai;
    const geminiTag = aiTagByKey.gemini;
    const claudeTag = aiTagByKey.claude;
    const googleAiStudioTag = aiTagByKey.googleAiStudio;
    const allTag = aiTagByKey.all;
    const aiPayload = proxy.ai;
    const openaiTagField =
      `${aiPayload.openai?.[AI_VENDOR_TAG_FIELD] ?? ""}`.trim();
    const geminiTagField =
      `${aiPayload.gemini?.[AI_VENDOR_TAG_FIELD] ?? ""}`.trim();
    const claudeTagField =
      `${aiPayload.claude?.[AI_VENDOR_TAG_FIELD] ?? ""}`.trim();
    const googleAiStudioTagField =
      `${aiPayload.googleAiStudio?.[AI_VENDOR_TAG_FIELD] ?? ""}`.trim();
    const allTagField = `${aiPayload[AI_ALL_TAG_FIELD] ?? ""}`.trim();
    if (
      openaiTagField ||
      aiPayload.openai[AI_CACHE_CAN_ACCESS_FIELD] === true
    ) {
      if (openaiTag) tags.push(openaiTag);
    }
    if (
      geminiTagField ||
      aiPayload.gemini[AI_CACHE_CAN_ACCESS_FIELD] === true
    ) {
      if (geminiTag) tags.push(geminiTag);
    }
    if (
      claudeTagField ||
      aiPayload.claude[AI_CACHE_CAN_ACCESS_FIELD] === true
    ) {
      if (claudeTag) tags.push(claudeTag);
    }
    if (
      googleAiStudioTagField ||
      aiPayload.googleAiStudio[AI_CACHE_CAN_ACCESS_FIELD] === true
    ) {
      if (googleAiStudioTag) tags.push(googleAiStudioTag);
    }
    if (allTagField || aiPayload[AI_ALL_TAG_FIELD] === aiTagByKey.all) {
      if (allTag) tags.push(allTag);
    }
    return tags;
  }

  function stripOutputTags(name = "") {
    let result = `${name ?? ""}`.trim();
    const tagPattern = aiTags.map(escapeRegExp).join("|");
    if (!tagPattern) return result;
    const tagRegex = new RegExp(`\\s(?:${tagPattern})\\s*$`, "i");
    while (tagRegex.test(result)) {
      result = result.replace(tagRegex, "").trim();
    }
    return result;
  }

  function escapeRegExp(text = "") {
    return `${text ?? ""}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const speedBatchOrder = proxiesToCheck.map((proxy) => proxy._sorted_index);

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

      const latencyResultByIndex = new Map();
      const latencyDoneByIndex = new Set();
      let nextLatencyPrintPos = 0;
      const flushLatencyInOrder = () => {
        while (
          nextLatencyPrintPos < speedBatchOrder.length &&
          latencyDoneByIndex.has(speedBatchOrder[nextLatencyPrintPos])
        ) {
          const sortedIndex = speedBatchOrder[nextLatencyPrintPos];
          const latencyResult = latencyResultByIndex.get(sortedIndex);
          if (latencyResult?.logText) {
            logInfo(latencyResult.logText);
          }
          nextLatencyPrintPos++;
        }
      };

      await executeAsyncTasks(
        proxiesToCheck.map((proxy) => async () => {
          const sortedIndex = proxy._sorted_index;
          try {
            const port = batchHttpMeta.portBySortedIndex.get(sortedIndex);
            if (port === undefined || port === null) {
              latencyResultByIndex.set(sortedIndex, {
                ok: false,
                proxy,
                port: null,
                logText: `[speed-latency] [${proxy.name}] missing http-meta port mapping`,
              });
              return;
            }

            speedCheckedSet.add(sortedIndex);
            const latencyResult = await checkSpeedLatencyWithHttpMeta(
              proxy,
              port,
            );
            latencyResultByIndex.set(sortedIndex, {
              ...latencyResult,
              proxy,
              port,
            });
          } finally {
            latencyDoneByIndex.add(sortedIndex);
            flushLatencyInOrder();
          }
        }),
        { concurrency: normalConcurrency },
      );

      flushLatencyInOrder();

      const speedCandidates = speedBatchOrder
        .map((sortedIndex) => ({
          sortedIndex,
          latency: latencyResultByIndex.get(sortedIndex),
        }))
        .filter((item) => item.latency?.ok && item.latency?.proxy)
        .map((item) => ({
          sortedIndex: item.sortedIndex,
          proxy: item.latency.proxy,
          port: item.latency.port,
          latencyMs: item.latency.latencyMs,
        }));

      const speedResultBySortedIndex = new Map();
      const speedDoneByIndex = new Set();
      let nextSpeedPrintPos = 0;
      const speedCandidateSet = new Set(
        speedCandidates.map((item) => item.sortedIndex),
      );
      const flushSpeedInOrder = () => {
        while (nextSpeedPrintPos < speedBatchOrder.length) {
          const sortedIndex = speedBatchOrder[nextSpeedPrintPos];
          if (!speedCandidateSet.has(sortedIndex)) {
            nextSpeedPrintPos++;
            continue;
          }
          if (!speedDoneByIndex.has(sortedIndex)) {
            break;
          }
          const speedResult = speedResultBySortedIndex.get(sortedIndex);
          if (speedResult?.logText) {
            logInfo(speedResult.logText);
          }
          if (speedResult?.ok) {
            speedPassBatchSet.add(sortedIndex);
            speedResultBatchMap.set(sortedIndex, {
              durationMs: speedResult.durationMs,
              measuredSpeedKb: speedResult.measuredSpeedKb,
            });
          }
          nextSpeedPrintPos++;
        }
      };

      await executeAsyncTasks(
        speedCandidates.map((item) => async () => {
          const { sortedIndex, proxy, port, latencyMs } = item;
          try {
            const speedResult = await checkNormalWithHttpMeta(
              proxy,
              port,
              latencyMs,
            );
            speedResultBySortedIndex.set(sortedIndex, speedResult);
          } finally {
            speedDoneByIndex.add(sortedIndex);
            flushSpeedInOrder();
          }
        }),
        { concurrency: normalConcurrency },
      );

      flushSpeedInOrder();
    } catch (e) {
      logError(e);
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
    const aiBatchOrder = proxiesToCheck.map((proxy) => proxy._sorted_index);

    if (!proxiesToCheck.length || !aiDetections.length) {
      return { aiPassBatchSet };
    }

    // Pre-create ordered log slots so flush can distinguish "not ready" from "already flushed".
    for (const sortedIndex of aiBatchOrder) {
      pendingLogsByIndex.set(sortedIndex, {
        logs: [],
        done: false,
      });
    }

    let httpMetaPid;
    try {
      for (const proxy of proxiesToCheck) {
        clearLegacyAiFields(proxy);
      }
      const batchHttpMeta = await startHttpMetaForBatch(proxiesToCheck, {
        label: "ai",
        startDelay: aiHttpMetaStartDelay,
        proxyTimeout: aiTimeoutMs,
        timeoutMultiplier: aiDetections.length,
      });
      httpMetaPid = batchHttpMeta.pid;

      await executeAsyncTasks(
        proxiesToCheck.map((proxy) => async () => {
          const sortedIndex = proxy._sorted_index;
          try {
            const port = batchHttpMeta.portBySortedIndex.get(sortedIndex);
            if (port === undefined || port === null) {
              throw new Error(`[${proxy.name}] missing http-meta port mapping`);
            }

            aiCheckedSet.add(sortedIndex);
            let allSuccess = true;
            for (const detection of aiDetections.filter(Boolean)) {
              const cacheId = getAiCacheId(proxy, detection);
              if (useCache) {
                const cached = getAiCache(cacheId);
                if (cached?.[AI_CACHE_CAN_ACCESS_FIELD]) {
                  applyDetectionPayloadToProxyAi({
                    proxy,
                    detection,
                    payload: cached,
                  });
                  const regionText = getCachedSupportedRegionText({
                    detection,
                    cached,
                  });
                  enqueueNodeLog(
                    sortedIndex,
                    `[${proxy.name}] [${detection.name}] 支持, status=CACHE${regionText}`,
                  );
                  continue;
                }
                if (cached?.unsupported) {
                  applyDetectionPayloadToProxyAi({
                    proxy,
                    detection,
                    payload: cached,
                  });
                  const regionText =
                    detection.key === "gemini" && cached.unsupported_region
                      ? `, country3=${cached.unsupported_region}`
                      : detection.key === "claude" && cached.unsupported_region
                        ? `, country2=${cached.unsupported_region}`
                        : "";
                  enqueueNodeLog(
                    sortedIndex,
                    `[${proxy.name}] [${detection.name}] 不支持(地区限制), status=CACHE${regionText}`,
                  );
                  allSuccess = false;
                  break;
                }
                if (cached !== undefined) {
                  enqueueNodeLog(
                    sortedIndex,
                    `[${proxy.name}] [${detection.name}] 错误, status=CACHE`,
                  );
                } else {
                  enqueueNodeLog(
                    sortedIndex,
                    `[${proxy.name}] [${detection.name}] 未检测(未命中缓存), status=CACHE`,
                  );
                }
              }

              const result = await checkAiWithHttpMeta(
                proxy,
                port,
                detection,
                sortedIndex,
              );
              if (result.outcome !== "supported") {
                allSuccess = false;
                break;
              }
            }

            if (allSuccess) {
              aiPassBatchSet.add(sortedIndex);
            }
          } finally {
            markNodeLogCompleted(sortedIndex);
            flushReadyNodeLogs(aiBatchOrder);
          }
        }),
        { concurrency: aiConcurrency },
      );
    } catch (e) {
      logAiError(
        `[ai-stage-batch] failed: ${e?.stack || e?.message || String(e)}`,
      );
    } finally {
      flushReadyNodeLogs(aiBatchOrder);
      await stopHttpMetaForBatch(httpMetaPid, "ai");
    }

    return { aiPassBatchSet };
  }

  async function checkAiWithHttpMeta(proxy, port, detection, proxyIndex) {
    const cacheId = getAiCacheId(proxy, detection);
    try {
      const startedAt = Date.now();
      const requestMethod =
        detection.key === "gemini" || detection.key === "googleAiStudio"
          ? "get"
          : aiMethod;
      const res = await http({
        proxy: `http://${httpMeta.host}:${port}`,
        method: requestMethod,
        timeout: aiTimeoutMs,
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
      let msg = "";
      let bodyText = "";
      let body;
      let geminiCountry3 = "";
      let openaiCountry2 = "";
      let claudeCountry2 = "";
      let geminiLocation = "";
      const locationHeader = String(
        getHeaderValue(res.headers, "location") || "",
      );
      if (detection.key === "gemini") {
        geminiLocation = locationHeader;
        bodyText = String(res.body ?? res.rawBody ?? "");
        geminiCountry3 = getGeminiCountry3(bodyText);
        const details = [];
        if (locationHeader) details.push(`location: ${locationHeader}`);
        if (geminiCountry3) details.push(`gbar_country3: ${geminiCountry3}`);
        msg = details.join(", ");
      } else if (detection.key === "openai") {
        const rawBody = String(res.body ?? res.rawBody ?? "");
        bodyText = rawBody;
        const trace = parseTraceFields(rawBody);
        openaiCountry2 = String(trace.loc || "").toUpperCase();
        const details = [];
        if (trace.h) details.push(`h: ${trace.h}`);
        if (openaiCountry2) details.push(`country2: ${openaiCountry2}`);
        if (trace.ip) details.push(`ip: ${trace.ip}`);
        if (trace.colo) details.push(`colo: ${trace.colo}`);
        msg = details.join(", ");
      } else if (detection.key === "claude") {
        const rawBody = String(res.body ?? res.rawBody ?? "");
        bodyText = rawBody;
        claudeCountry2 = getClaudeCountry2(rawBody);
        msg = claudeCountry2 ? `country: ${claudeCountry2}` : "";
      } else if (detection.key === "googleAiStudio") {
        const rawBody = String(res.body ?? res.rawBody ?? "");
        body = rawBody;
        try {
          body = JSON.parse(rawBody);
        } catch (e) {}
        msg = String(
          body?.error?.code ||
            body?.error?.error_type ||
            body?.error?.status ||
            body?.error?.message ||
            body?.message ||
            "",
        );
        bodyText = typeof body === "string" ? body : rawBody;
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
      const outcome = classifyAiResult({
        detection,
        status,
        message: msg,
        bodyText,
        body,
        headers: res.headers,
        geminiCountry3,
        openaiCountry2,
        claudeCountry2,
      });

      if (outcome === "supported") {
        const supportedPayload = {
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
        applyDetectionPayloadToProxyAi({
          proxy,
          detection,
          payload: supportedPayload,
        });
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
        if (shouldWriteAiCache) {
          setAiCache(cacheId, supportedPayload);
        }
      } else if (outcome === "unsupported") {
        const unsupportedPayload = {
          unsupported: true,
          unsupported_message: msg || getUnsupportedMessage(bodyText),
          unsupported_latency: latency,
          ...(detection.key === "gemini" && geminiCountry3
            ? { unsupported_region: geminiCountry3 }
            : detection.key === "claude" && claudeCountry2
              ? { unsupported_region: claudeCountry2 }
              : {}),
        };
        applyDetectionPayloadToProxyAi({
          proxy,
          detection,
          payload: unsupportedPayload,
        });
        const regionText =
          detection.key === "openai" && openaiCountry2
            ? `, country2=${openaiCountry2}`
            : detection.key === "gemini" && geminiCountry3
              ? `, country3=${geminiCountry3}`
              : detection.key === "claude" && claudeCountry2
                ? `, country2=${claudeCountry2}`
                : "";
        const locationText =
          detection.key === "gemini" && status === 302 && geminiLocation
            ? `, location=${geminiLocation}`
            : "";
        enqueueNodeLog(
          proxyIndex,
          `[${proxy.name}] [${detection.name}] 不支持(地区限制), status=${status}${regionText}${locationText}`,
        );
        if (shouldWriteAiCache) {
          setAiCache(cacheId, unsupportedPayload);
        }
      } else {
        const detailText = buildErrorText(
          bodyText,
          status === 302 ? locationHeader : "",
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
          return { outcome: "error" };
        }
      }

      return { outcome };
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
        return { outcome: "error" };
      }
      return { outcome: "error" };
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
      const logText = `[speed-latency] [${proxy.name}] status=${status}, latency=${latencyMs}`;

      if (validStatus.test(`${status}`)) {
        return {
          ok: true,
          latencyMs,
          logText,
        };
      }

      return { ok: false, logText };
    } catch (e) {
      return {
        ok: false,
        logText: `[speed-latency] [${proxy.name}] ${e.message ?? e}`,
      };
    }
  }

  async function checkNormalWithHttpMeta(proxy, port, latencyMs = 0) {
    try {
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
      const logText = `[speed] [${proxy.name}] status=${status}, duration=${durationMs}, latency=${latencyMs}, effective_duration=${effectiveDurationMs}, effective_timeout=${DEFAULT_TIMEOUT_MS}, bytes=${responseBytes}, max_speed=${formatSpeedText(maxMeasuredSpeedKb)}, speed=${formatSpeedText(measuredSpeedKb)}`;

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
          logText,
        };
      }

      return { ok: false, logText };
    } catch (e) {
      return {
        ok: false,
        logText: `[speed] [${proxy.name}] ${e.message ?? e}`,
      };
    }
  }

  function classifyAiResult({
    detection,
    status,
    message = "",
    bodyText = "",
    body,
    headers = {},
    geminiCountry3 = "",
    openaiCountry2 = "",
    claudeCountry2 = "",
  }) {
    if (detection.key === "openai") {
      if (status !== 200) return "error";
      const country2 = `${openaiCountry2 ?? ""}`.toUpperCase();
      if (!country2) return "error";
      return openaiCountry2DenySet.has(country2) ? "unsupported" : "supported";
    }
    if (detection.key === "gemini") {
      if (status === 302) return "error";
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
    if (detection.key === "claude") {
      if (status !== 200) return "error";
      const title = extractHtmlTitle(bodyText);
      if (/unavailable/i.test(title)) {
        return "unsupported";
      }
      const country2 = `${claudeCountry2 ?? ""}`.toUpperCase();
      if (!country2) return "error";
      return claudeCountry2DenySet.has(country2) ? "unsupported" : "supported";
    }
    if (detection.key === "googleAiStudio") {
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
    if (detection.isSuccess?.({ status, message, bodyText, body, headers })) {
      return "supported";
    }
    return "error";
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
    logHttpMetaBoundary("START", label);
    logInfo(
      `[status] ${startStatus} [pid] ${pid} [ports_count] ${portsCount} [proxies] ${batchProxies.length} [timeout] ${totalTimeout}`,
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
      logHttpMetaBoundary("END", label);
      logInfo(`[status] ${stopStatus} [pid] ${pid}`);
    } catch (e) {
      if (label === "ai") {
        logAiError(
          `[http-meta ${label}] stop failed: ${e?.stack || e?.message || String(e)}`,
        );
      } else {
        logError(e);
      }
    }
  }

  function toAiProxyOutput(proxy, measuredSpeedKb = 0, durationMs = 0) {
    let parsed = clearLegacyOutputAiFields(safeParseProxy(proxy));
    parsed.ai = buildOutputAiPayload(proxy?.ai, true);
    const baseName = getBaseNameWithSpeed(proxy);
    parsed.measuredSpeed = formatLabeledSpeedText(proxy._speed_kb, "A");
    parsed.guaranteedSpeed = formatLabeledSpeedText(measuredSpeedKb, "B");
    parsed.name = getOutputProxyName(proxy);
    return parsed;
  }

  function toNormalProxyOutput(
    proxy,
    measuredSpeedKb,
    durationMs,
    keepAiResult = false,
  ) {
    const parsed = clearLegacyOutputAiFields(safeParseProxy(proxy));
    parsed.ai = buildOutputAiPayload(proxy?.ai, keepAiResult);
    parsed.name = getOutputProxyName(proxy);
    parsed.measuredSpeed = formatLabeledSpeedText(proxy._speed_kb, "A");
    parsed.guaranteedSpeed = formatLabeledSpeedText(measuredSpeedKb, "B");
    return parsed;
  }

  function getOutputProxyName(proxy = {}) {
    return `${proxy?._original_name ?? proxy?.name ?? ""}`.trim();
  }

  function formatMeasuredName(name, measuredSpeedKb = 0, durationMs = 0) {
    const speedSuffix =
      enableSpeedTest && measuredSpeedKb > 0
        ? ` ${formatEstimatedSpeedNameText(measuredSpeedKb)}`
        : "";
    return `${name}${speedSuffix}`;
  }

  function applyAiTagsToProxy(proxy = {}, tags = []) {
    const uniqueTags = new Set(tags.filter(Boolean));
    let changed = false;
    let nextProxy = proxy;

    for (const key of Object.keys(aiTagFieldByKey)) {
      const field = aiTagFieldByKey[key];
      const tag = aiTagByKey[key];
      const currentValue = `${nextProxy[field] ?? ""}`;
      const nextValue = tag && uniqueTags.has(tag) ? tag : "";
      if (
        (nextValue && currentValue !== nextValue) ||
        (!nextValue && currentValue)
      ) {
        if (!changed) {
          nextProxy = { ...nextProxy };
          changed = true;
        }
        if (nextValue) {
          nextProxy[field] = nextValue;
        } else {
          delete nextProxy[field];
        }
      }
    }

    return { proxy: nextProxy, changed };
  }

  function cleanupOutputAiStatusFields(proxy = {}) {
    const cleaned = clearLegacyOutputAiFields(proxy);
    return { proxy: cleaned, changed: cleaned !== proxy };
  }

  function applyDetectionPayloadToProxyAi({ proxy, detection, payload = {} }) {
    ensureProxyAiShape(proxy);
    const bucket = proxy.ai[detection.key];
    const nextBucket = {};

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

    proxy.ai[detection.key] = { ...bucket, ...nextBucket };
    applyAggregateAiTag(proxy);
  }

  function isAllAiDetectionsSupported(proxy = {}) {
    ensureProxyAiShape(proxy);
    if (!Array.isArray(aiDetections) || !aiDetections.length) {
      return false;
    }
    const aiPayload = proxy.ai;
    return aiDetections.every(
      (detection) =>
        aiPayload[detection.key][AI_CACHE_CAN_ACCESS_FIELD] === true,
    );
  }

  function applyAggregateAiTag(proxy = {}) {
    if (isAllAiDetectionsSupported(proxy)) {
      proxy.ai[AI_ALL_TAG_FIELD] = aiTagByKey.all;
      return;
    }
    delete proxy.ai[AI_ALL_TAG_FIELD];
  }

  function clearLegacyOutputAiFields(proxy = {}) {
    const nextProxy = { ...proxy };
    delete nextProxy.tagOpenai;
    delete nextProxy.tagGemini;
    delete nextProxy.tagClaude;
    delete nextProxy.tagGoogleAiStudio;
    delete nextProxy.tagAistudio;
    delete nextProxy.tagAi;
    delete nextProxy.canAccessOpenai;
    delete nextProxy.openaiLatency;
    delete nextProxy.canAccessGemini;
    delete nextProxy.geminiLatency;
    delete nextProxy.canAccessClaude;
    delete nextProxy.claudeLatency;
    delete nextProxy.canAccessGoogleAiStudio;
    delete nextProxy.googleAiStudioLatency;
    delete nextProxy.canAccessAistudio;
    delete nextProxy.aistudioLatency;
    delete nextProxy._openai;
    delete nextProxy._openai_latency;
    delete nextProxy._gemini;
    delete nextProxy._gemini_latency;
    delete nextProxy._claude;
    delete nextProxy._claude_latency;
    delete nextProxy._aistudio;
    delete nextProxy._aistudio_latency;
    return nextProxy;
  }

  function buildOutputAiPayload(sourceAi = {}, keepAiResult = false) {
    if (!keepAiResult) {
      return {
        openai: {},
        gemini: {},
        claude: {},
        googleAiStudio: {},
      };
    }

    const source =
      sourceAi && typeof sourceAi === "object" && !Array.isArray(sourceAi)
        ? sourceAi
        : {};
    const payload = {
      openai: pickOutputAiVendorFields(source.openai),
      gemini: pickOutputAiVendorFields(source.gemini),
      claude: pickOutputAiVendorFields(source.claude),
      googleAiStudio: pickOutputAiVendorFields(source.googleAiStudio),
    };
    if (source[AI_ALL_TAG_FIELD] === aiTagByKey.all) {
      payload[AI_ALL_TAG_FIELD] = aiTagByKey.all;
    }
    return payload;
  }

  function pickOutputAiVendorFields(vendorPayload = {}) {
    const source =
      vendorPayload &&
      typeof vendorPayload === "object" &&
      !Array.isArray(vendorPayload)
        ? vendorPayload
        : {};
    const picked = {};
    if (source[AI_CACHE_CAN_ACCESS_FIELD] === true) {
      picked[AI_CACHE_CAN_ACCESS_FIELD] = true;
    }
    if (AI_CACHE_LATENCY_FIELD in source) {
      picked[AI_CACHE_LATENCY_FIELD] = source[AI_CACHE_LATENCY_FIELD];
    }
    if (AI_VENDOR_TAG_FIELD in source) {
      picked[AI_VENDOR_TAG_FIELD] = source[AI_VENDOR_TAG_FIELD];
    }
    if ("supported_region" in source) {
      picked.supported_region = source.supported_region;
    }
    if ("unsupported" in source) {
      picked.unsupported = source.unsupported;
    }
    if ("unsupported_message" in source) {
      picked.unsupported_message = source.unsupported_message;
    }
    if ("unsupported_latency" in source) {
      picked.unsupported_latency = source.unsupported_latency;
    }
    if ("unsupported_region" in source) {
      picked.unsupported_region = source.unsupported_region;
    }
    return picked;
  }

  function ensureProxyAiShape(proxy = {}) {
    if (!proxy.ai || typeof proxy.ai !== "object" || Array.isArray(proxy.ai)) {
      proxy.ai = {};
    }
    for (const key of ["openai", "gemini", "claude", "googleAiStudio"]) {
      if (
        !proxy.ai[key] ||
        typeof proxy.ai[key] !== "object" ||
        Array.isArray(proxy.ai[key])
      ) {
        proxy.ai[key] = {};
      }
    }
  }

  function formatLabeledSpeedText(speedKb = 0, label = "") {
    const speedText = formatSpeedNameText(speedKb);
    if (!speedText) return "";
    const normalizedLabel = `${label ?? ""}`.trim().toUpperCase();
    return normalizedLabel ? `${normalizedLabel}${speedText}` : speedText;
  }

  function toSpeedKbFromAny(value, label = "") {
    if (typeof value === "number") {
      return Number.isFinite(value) && value > 0 ? value : 0;
    }
    const text = `${value ?? ""}`.trim();
    if (!text) return 0;

    const normalizedLabel = `${label ?? ""}`.trim().toUpperCase();
    if (normalizedLabel) {
      const labeledSpeed = parseLabeledSpeedToKb(text, normalizedLabel);
      if (labeledSpeed > 0) return labeledSpeed;
    }

    const plainSpeed = parseSpeedTextToKb(text);
    if (plainSpeed > 0) return plainSpeed;

    const numericValue = Number(text);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
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
      delete parsed._origin_server;
      delete parsed._origin_port;
      return parsed;
    } catch (e) {
      const fallback = { ...proxy };
      delete fallback._sorted_index;
      delete fallback._base_name_speed;
      delete fallback._speed_kb;
      delete fallback._original_name;
      delete fallback._origin_server;
      delete fallback._origin_port;
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

  function buildAiDetections(options = [], configByKey = AI_DETECTION_CONFIG) {
    return options
      .map((key) => `${key ?? ""}`.trim())
      .map((key) => configByKey[key])
      .filter(Boolean)
      .map((item) => ({ ...item }));
  }

  function normalizeAiOptions(rawAiDetect) {
    const text = `${rawAiDetect ?? ""}`.trim();
    const toCanonicalOption = (option = "") => {
      const normalized = `${option ?? ""}`.trim().toLowerCase();
      if (normalized === "google-ai-studio") return "googleAiStudio";
      return normalized;
    };
    if (!text) {
      return Array.from(new Set(AI_DEFAULT_OPTIONS.map(toCanonicalOption)));
    }
    const allowed = new Set(AI_ALLOWED_OPTIONS);
    const parsed = text
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => allowed.has(item))
      .map((item) => toCanonicalOption(item));
    return parsed.length
      ? Array.from(new Set(parsed))
      : Array.from(new Set(AI_DEFAULT_OPTIONS.map(toCanonicalOption)));
  }

  function enqueueNodeLog(proxyIndex, text = "") {
    if (!Number.isInteger(proxyIndex)) return;
    if (!pendingLogsByIndex.has(proxyIndex)) {
      pendingLogsByIndex.set(proxyIndex, {
        logs: [],
        done: false,
      });
    }
    pendingLogsByIndex.get(proxyIndex).logs.push(`${text ?? ""}`);
  }

  function markNodeLogCompleted(proxyIndex) {
    if (!Number.isInteger(proxyIndex)) return;
    if (!pendingLogsByIndex.has(proxyIndex)) {
      pendingLogsByIndex.set(proxyIndex, {
        logs: [],
        done: true,
      });
      return;
    }
    pendingLogsByIndex.get(proxyIndex).done = true;
  }

  function flushReadyNodeLogs(order = []) {
    if (!Array.isArray(order) || !order.length) return;
    for (const proxyIndex of order) {
      const buffered = pendingLogsByIndex.get(proxyIndex);
      if (!buffered) {
        continue;
      }
      if (!buffered?.done) break;
      for (const line of buffered.logs) {
        logAi(line);
      }
      pendingLogsByIndex.delete(proxyIndex);
    }
  }

  function getCachedSupportedRegionText({ detection, cached = {} }) {
    if (detection.key === "gemini" && cached.supported_region) {
      return `, country3=${cached.supported_region}`;
    }
    if (
      (detection.key === "openai" || detection.key === "claude") &&
      cached.supported_region
    ) {
      return `, country2=${cached.supported_region}`;
    }
    return "";
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
    const text = String(raw ?? "");
    if (!text) return "";
    const matched = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!matched?.[1]) return "";
    return toPlainText(matched[1]);
  }

  function toPlainText(raw = "") {
    let text = String(raw ?? "");
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
      .replace(/\s+/g, " ")
      .trim();
    return text;
  }

  function truncateText(text = "", maxLength = 300) {
    const value = String(text ?? "");
    if (!value) return "";
    const max = Math.max(1, parseInt(maxLength, 10) || 300);
    if (value.length <= max) return value;
    return `${value.slice(0, max)}...`;
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

  function getClaudeCountry2(bodyText = "") {
    const text = String(bodyText ?? "");
    if (!text) return "";
    const matched =
      text.match(/data-ion-ip-country="([A-Z]{2})"/i) ||
      text.match(/data-ion-ip-country='([A-Z]{2})'/i);
    return matched?.[1] ? matched[1].toUpperCase() : "";
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

  function getAiCache(id) {
    const serverWithPort = `${id?.serverWithPort ?? ""}`.trim();
    const vendorKey = `${id?.vendorKey ?? ""}`.trim();
    if (!serverWithPort || !vendorKey) return undefined;
    const nodeStore = store?.[serverWithPort];
    const aiStore = nodeStore?.ai;
    if (!aiStore) return undefined;
    return aiStore[vendorKey];
  }

  function setAiCache(id, value) {
    const serverWithPort = `${id?.serverWithPort ?? ""}`.trim();
    const vendorKey = `${id?.vendorKey ?? ""}`.trim();
    if (!serverWithPort || !vendorKey) return;
    const nodeStore = store?.[serverWithPort] ?? {};
    const aiStore = nodeStore.ai ?? {};
    store[serverWithPort] = {
      ...nodeStore,
      ai: {
        ...aiStore,
        [vendorKey]: value,
      },
    };
    markStoreDirty();
  }

  function getAiCacheId(proxy = {}, detection = {}) {
    const serverWithPort = getServerWithPortFromProxy(proxy);
    const server = proxy._origin_server ?? proxy.server ?? "";
    const port = proxy._origin_port ?? proxy.port ?? "";
    return {
      serverWithPort: serverWithPort || `${server}:${port}`,
      vendorKey: detection.cacheAiName,
    };
  }

  function getServerWithPortFromProxy(proxy = {}) {
    const server = `${proxy._origin_server ?? proxy.server ?? ""}`.trim();
    const port = `${proxy._origin_port ?? proxy.port ?? ""}`.trim();
    if (!server || !port) return "";
    return `${server}:${port}`;
  }

  function clearLegacyAiFields(proxy = {}) {
    delete proxy._openai;
    delete proxy._openai_latency;
    delete proxy._gemini;
    delete proxy._gemini_latency;
    delete proxy._claude;
    delete proxy._claude_latency;
    delete proxy._aistudio;
    delete proxy._aistudio_latency;
    delete proxy._googleAiStudio;
    delete proxy._googleAiStudio_latency;
  }

  function isUnsupportedResult({ message = "", bodyText = "" }) {
    return unsupportedTextRegex.test(`${message}\n${bodyText}`);
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
    const matched = `${bodyText}`.match(unsupportedTextRegex);
    return matched?.[0] || "";
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
