const targetCollectionName = "Fallback";
const subscriptions = await loadCollectionSubscriptions(targetCollectionName);
setDownloadFilenameHeader();

const baseUrl = $arguments?.base_url;
const remoteProxyItems = buildRemoteProxyItems(subscriptions);

const remoteProxyLines = remoteProxyItems.map(({ subName, remoteName }) => {
  const subUrl = `${baseUrl}${process.env.SUB_STORE_FRONTEND_BACKEND_PATH}/download/${encodeURIComponent(subName)}/Loon`;
  return `${remoteName} = ${subUrl},enabled=true`;
});

let nextContent = replaceSection($content, "Remote Proxy", remoteProxyLines);
nextContent = replaceAutoProxyGroups(nextContent, remoteProxyItems);
$content = nextContent;

function buildRemoteProxyItems(subscriptions) {
  const usedRemoteNames = new Set();
  const usedAutoNames = new Set();
  const items = [];
  for (const subInfo of Array.isArray(subscriptions) ? subscriptions : []) {
    const subName = String(subInfo?.name || "").trim();
    const displayName = String(subInfo?.displayName || "").trim();
    const baseName = displayName || subName || "Sub";
    const remoteName = makeUniqueName(baseName, usedRemoteNames);
    const autoName = makeUniqueName(`Auto_${baseName}`, usedAutoNames);
    items.push({
      subName,
      remoteName,
      autoName,
      isNoExpiry: Boolean(subInfo?.isNoExpiry),
    });
  }
  return items;
}

function makeUniqueName(base, used) {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let index = 2;
  while (used.has(`${base}_${index}`)) index++;
  const next = `${base}_${index}`;
  used.add(next);
  return next;
}

function replaceAutoProxyGroups(text, items) {
  if (!Array.isArray(items) || items.length === 0) return text;

  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const sectionName = "Proxy Group";
  const escapedHeader = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionRegex = new RegExp(
    `(\\[${escapedHeader}\\][\\s\\S]*?)(?=\\r?\\n\\[[^\\]]+\\]|$)`,
    "i",
  );
  const section = text.match(sectionRegex)?.[0];
  if (!section) return text;

  const remoteNames = items.map((item) => item.remoteName);
  const autoTimeLimitedName = "Auto_TimeLimited";
  const autoNoExpiryName = "Auto_NoExpiry";
  const noExpiryAutoNames = items
    .filter((item) => item.isNoExpiry)
    .map((item) => item.autoName);
  const timeLimitedAutoNames = items
    .filter((item) => !item.isNoExpiry)
    .map((item) => item.autoName);

  const rawLines = section.split(/\r?\n/);
  const sectionHeader = rawLines[0];
  const bodyLines = rawLines.slice(1);

  const urlTestLineRegex = /^\s*([^=\s][^=]*?)\s*=\s*url-test\s*,/i;
  const templateLine = bodyLines.find((line) => urlTestLineRegex.test(line));
  const templateRhs =
    templateLine?.split("=").slice(1).join("=").trim() ||
    "url-test, url=http://www.gstatic.com/generate_204, interval=300, tolerance=200, max-timeout=1500, img-url=https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Auto.png";

  const keptLines = [];
  for (const line of bodyLines) {
    if (/^\s*Auto_AI\s*=/i.test(line)) {
      continue;
    }
    const match = line.match(urlTestLineRegex);
    if (!match) {
      keptLines.push(line);
      continue;
    }
  }

  const generatedAutoLineMap = new Map(
    items.map((item) => [
      item.autoName,
      `${item.autoName} = ${buildAutoUrlTestRhs(templateRhs, item.remoteName)}`,
    ]),
  );
  const generatedTimeLimitedAutoLines = timeLimitedAutoNames
    .map((name) => generatedAutoLineMap.get(name))
    .filter(Boolean);
  const generatedNoExpiryAutoLines = noExpiryAutoNames
    .map((name) => generatedAutoLineMap.get(name))
    .filter(Boolean);
  const generatedAutoTimeLimitedLine = `${autoTimeLimitedName} = ${buildAutoAggregateUrlTestRhs(templateRhs, timeLimitedAutoNames)}`;
  const generatedAutoNoExpiryLine = `${autoNoExpiryName} = ${buildAutoAggregateUrlTestRhs(templateRhs, noExpiryAutoNames)}`;
  const fallbackLineIndex = keptLines.findIndex((line) =>
    /^\s*Fallback\s*=/i.test(line),
  );
  const generatedLines = [
    generatedAutoTimeLimitedLine,
    generatedAutoNoExpiryLine,
    ...generatedTimeLimitedAutoLines,
    ...generatedNoExpiryAutoLines,
  ];
  if (fallbackLineIndex >= 0) {
    keptLines.splice(fallbackLineIndex + 1, 0, ...generatedLines);
  } else {
    keptLines.push(...generatedLines);
  }

  const fallbackIndex = keptLines.findIndex((line) =>
    /^\s*Fallback\s*=/i.test(line),
  );
  if (fallbackIndex >= 0) {
    keptLines[fallbackIndex] = rewriteFallbackLineWithAutoMembers(
      keptLines[fallbackIndex],
      [autoTimeLimitedName, autoNoExpiryName],
    );
  }
  const proxyIndex = keptLines.findIndex((line) =>
    /^\s*Proxy\s*=\s*select\s*,/i.test(line),
  );
  if (proxyIndex >= 0) {
    const proxyAutoMembers = [...timeLimitedAutoNames, ...noExpiryAutoNames];
    keptLines[proxyIndex] = mergeRemoteIntoProxySelectLine(
      keptLines[proxyIndex],
      remoteNames,
      proxyAutoMembers,
    );
  }

  const rebuiltSection = [sectionHeader, ...keptLines].join(eol);
  return text.replace(sectionRegex, rebuiltSection);
}

function mergeRemoteIntoProxySelectLine(line, remoteNames, autoMembers) {
  const eqIndex = line.indexOf("=");
  if (eqIndex < 0) return line;
  const left = line.slice(0, eqIndex + 1);
  const right = line.slice(eqIndex + 1).trim();
  const parts = right
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return line;

  const head = parts.shift();
  const optionsStart = parts.findIndex((p) => /=/.test(p));
  const policyParts =
    optionsStart >= 0 ? parts.slice(0, optionsStart) : parts.slice();
  const optionParts = optionsStart >= 0 ? parts.slice(optionsStart) : [];

  const remoteMap = new Map(
    (Array.isArray(remoteNames) ? remoteNames : []).map((n) => [
      String(n).toLowerCase(),
      n,
    ]),
  );
  const autoMap = new Map(
    (Array.isArray(autoMembers) ? autoMembers : []).map((n) => [
      String(n).toLowerCase(),
      n,
    ]),
  );
  const filteredPolicies = policyParts.filter(
    (p) =>
      !/^Auto_AI$/i.test(String(p).trim()) &&
      !remoteMap.has(String(p).toLowerCase()) &&
      !autoMap.has(String(p).toLowerCase()),
  );

  // Keep Proxy group clean: do not add remote policy names back.
  // We only keep Auto_<displayName> entries in Proxy.

  const fallbackMemberIndex = filteredPolicies.findIndex((p) =>
    /^Fallback$/i.test(String(p).trim()),
  );
  const autoInsertAt =
    fallbackMemberIndex >= 0
      ? fallbackMemberIndex + 1
      : filteredPolicies.findIndex((p) => /^All_Filter$/i.test(p)) >= 0
        ? filteredPolicies.findIndex((p) => /^All_Filter$/i.test(p))
        : filteredPolicies.length;
  filteredPolicies.splice(
    autoInsertAt,
    0,
    ...(Array.isArray(autoMembers) ? autoMembers : []),
  );

  const dedupedPolicies = [];
  const seen = new Set();
  for (const p of filteredPolicies) {
    const key = String(p).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedPolicies.push(p);
  }

  const rebuilt = [head, ...dedupedPolicies, ...optionParts].join(", ");
  return `${left} ${rebuilt}`;
}

function buildAutoUrlTestRhs(rhs, alias) {
  return buildAutoAggregateUrlTestRhs(rhs, [alias]);
}

function buildAutoAggregateUrlTestRhs(rhs, aliases) {
  const members = Array.isArray(aliases)
    ? aliases.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const urlMatch = rhs.match(/,\s*url\s*=/i);
  if (!urlMatch) return rhs;

  const cutIndex = urlMatch.index;
  const left = rhs.slice(0, cutIndex).trim();
  const right = rhs.slice(cutIndex + 1).trim();
  const leftPayload = left
    .replace(/^url-test\s*,?\s*/i, "")
    .trim()
    .replace(/,\s*$/, "");
  const leftParts = leftPayload
    ? leftPayload
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const leftOptionParts = leftParts.filter((part) => /=/.test(part));
  const mergedLeftParts = [...members, ...leftOptionParts];
  const mergedLeft = mergedLeftParts.join(", ");
  return mergedLeft
    ? `url-test, ${mergedLeft}, ${right}`
    : `url-test, ${right}`;
}

function rewriteFallbackLineWithAutoMembers(line, autoMembers) {
  const eqIndex = line.indexOf("=");
  if (eqIndex < 0) return line;

  const name = line.slice(0, eqIndex).trim() || "Fallback";
  const rhs = line.slice(eqIndex + 1).trim();
  const parts = rhs
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return line;

  const type = parts.shift();
  if (!/^fallback$/i.test(type)) return line;

  const optionsStart = parts.findIndex((p) => /=/.test(p));
  const options = (optionsStart >= 0 ? parts.slice(optionsStart) : []).filter(
    (p) => !/^Auto_AI$/i.test(String(p).trim()),
  );

  const dedupedMembers = [];
  const seen = new Set();
  for (const m of Array.isArray(autoMembers) ? autoMembers : []) {
    const key = String(m).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedMembers.push(m);
  }

  const rebuilt = [type, ...dedupedMembers, ...options].join(", ");
  return `${name} = ${rebuilt}`;
}

async function loadCollectionSubscriptions(collectionName) {
  const allCollections = $substore.read("collections") || [];
  const allSubscriptions = $substore.read("subs") || [];
  const collection = Array.isArray(allCollections)
    ? allCollections.find((item) => item?.name === collectionName)
    : null;
  if (!collection) throw new Error(`collection ${collectionName} not found`);

  const list = [];
  const seen = new Set();
  for (const subName of Array.isArray(collection.subscriptions)
    ? collection.subscriptions
    : []) {
    const normalized = String(subName || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    const sub = Array.isArray(allSubscriptions)
      ? allSubscriptions.find((item) => item?.name === normalized)
      : null;
    const displayName = String(
      sub?.displayName || sub?.["display-name"] || sub?.name || normalized,
    ).trim();
    const isNoExpiry = Array.isArray(sub?.tag)
      ? sub.tag.includes("NoExpiry")
      : false;
    list.push({
      name: normalized,
      displayName: displayName || normalized,
      isNoExpiry,
    });
  }
  if (!list.length)
    throw new Error(`collection ${collectionName} has no subscriptions`);
  return list;
}

function replaceSection(text, sectionName, lines) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const safeLines = Array.isArray(lines) ? lines : [];
  const escapedHeader = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionHeader = `[${sectionName}]`;
  const sectionRegex = new RegExp(
    `(\\[${escapedHeader}\\][\\s\\S]*?)(?=\\r?\\n\\[[^\\]]+\\]|$)`,
    "i",
  );

  if (!sectionRegex.test(text)) {
    const appendix = [sectionHeader, ...safeLines, ""].join(eol);
    return `${text}${text.endsWith(eol) ? "" : eol}${appendix}`;
  }

  return text.replace(
    sectionRegex,
    `${sectionHeader}${eol}${safeLines.join(eol)}${eol}`,
  );
}

function setDownloadFilenameHeader() {
  const rawName = String($arguments?.filename ?? "loon.conf").trim();
  if (!rawName) return;

  const safeName = sanitizeHeaderValue(rawName);
  if (!safeName) return;

  const fallbackName = toAsciiFilename(safeName);
  const utf8Name = encodeRFC5987ValueChars(safeName);

  $options ??= {};
  $options._res ??= {};
  $options._res.headers ??= {};
  $options._res.headers["content-disposition"] =
    'attachment; filename="' +
    fallbackName +
    "\"; filename*=UTF-8''" +
    utf8Name;
}

function sanitizeHeaderValue(value) {
  return String(value || "")
    .replace(/[\r\n"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toAsciiFilename(value) {
  const ascii = String(value || "")
    .replace(/[^\x20-\x7E]/g, "_")
    .trim();
  return ascii || "loon.conf";
}

function encodeRFC5987ValueChars(value) {
  return encodeURIComponent(String(value || ""))
    .replace(/[\'()]/g, escape)
    .replace(/\*/g, "%2A")
    .replace(/%(7C|60|5E)/g, (match) => match.toLowerCase());
}
