const configText =
  typeof $content === "string"
    ? $content
    : Array.isArray($files)
      ? $files.join("\n")
      : "";

const targetCollectionName = "Fallback";
const sourceMap = context?.source ?? {};
const fallbackSubs = await loadCollectionSubscriptions(targetCollectionName);
const subscriptions = fallbackSubs.length
  ? fallbackSubs
  : loadSubscriptionsFromContext(sourceMap, targetCollectionName);

const baseUrl = normalizeBaseUrl(
  $arguments?.base_url || $arguments?.sub_store_base || "https://sub.store",
);

const remoteProxyItems = buildRemoteProxyItems(subscriptions, sourceMap);

const remoteProxyLines = remoteProxyItems.map(({ subName, remoteName }) => {
  const subUrl = `${baseUrl}/download/${encodeURIComponent(subName)}/Loon`;
  return `${remoteName} = ${subUrl},enabled=true`;
});

let nextContent = replaceSection(configText, "Remote Proxy", remoteProxyLines);
nextContent = replaceAutoProxyGroups(nextContent, remoteProxyItems);
$content = nextContent;

function sanitizeAlias(value) {
  return String(value || "")
    .replace(/[\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[=,]/g, " ")
    .trim();
}

function normalizeBaseUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "https://sub.store";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, "");
}

function sanitizeGroupToken(value) {
  return String(value || "")
    .replace(/\s+/g, "_")
    .replace(/[^0-9A-Za-z_.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildRemoteProxyItems(subscriptions, sourceMap) {
  const usedNames = new Set();
  const items = [];
  for (const subInfo of Array.isArray(subscriptions) ? subscriptions : []) {
    const subName = subInfo.name;
    const sub = sourceMap?.[subName] ?? {};
    const alias = sanitizeAlias(
      subInfo.displayName ||
        sub.displayName ||
        sub["display-name"] ||
        sub.name ||
        subName,
    );
    const token = sanitizeGroupToken(alias) || sanitizeGroupToken(subName) || "Sub";
    const remoteName = makeUniqueName(`Auto_${token}`, usedNames);
    items.push({ subName, alias, remoteName });
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

  const autoNames = items.map((item) => item.remoteName);

  const rawLines = section.split(/\r?\n/);
  const sectionHeader = rawLines[0];
  const bodyLines = rawLines.slice(1);

  const removableAutoRegex = /^Auto_[^=\s]+\s*=\s*url-test,/i;
  const templateLine = bodyLines.find(
    (line) => removableAutoRegex.test(line) && !/AI_Filter/i.test(line),
  );
  const templateRhs =
    templateLine?.split("=").slice(1).join("=").trim() ||
    "url-test, url=http://www.gstatic.com/generate_204, interval=300, tolerance=50, img-url=https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Auto.png";

  const keptLines = bodyLines.filter(
    (line) => !(removableAutoRegex.test(line) && !/AI_Filter/i.test(line)),
  );
  const generatedAutoLines = autoNames.map((autoName, idx) => {
    return `${autoName} = ${buildAutoUrlTestRhs(templateRhs, autoName)}`;
  });

  const autoAiIndex = keptLines.findIndex((line) => /^\s*Auto_AI\s*=/i.test(line));
  if (autoAiIndex >= 0) {
    keptLines.splice(autoAiIndex, 0, ...generatedAutoLines);
  } else {
    keptLines.push(...generatedAutoLines);
  }

  const fallbackIndex = keptLines.findIndex((line) => /^\s*Fallback\s*=/i.test(line));
  if (fallbackIndex >= 0) {
    const current = keptLines[fallbackIndex];
    const suffix =
      current.match(/,\s*url\s*=.*$/i)?.[0] ||
      ", url=http://www.gstatic.com/generate_204, interval=300, max-timeout=3000";
    keptLines[fallbackIndex] = `Fallback = fallback, ${autoNames.join(", ")}${suffix}`;
  }

  const rebuiltSection = [sectionHeader, ...keptLines].join(eol);
  return text.replace(sectionRegex, rebuiltSection);
}

function buildAutoUrlTestRhs(rhs, alias) {
  const cleanAlias = sanitizeAlias(alias);
  const urlMatch = rhs.match(/,\s*url\s*=/i);
  if (!urlMatch) return rhs;

  const cutIndex = urlMatch.index;
  const left = rhs.slice(0, cutIndex).trim();
  const right = rhs.slice(cutIndex + 1).trim();
  const leftPayload = left.replace(/^url-test\s*,?\s*/i, "").trim().replace(/,\s*$/, "");
  const mergedLeft = leftPayload ? `${leftPayload}, ${cleanAlias}` : cleanAlias;
  return `url-test, ${mergedLeft}, ${right}`;
}

function loadSubscriptionsFromContext(source, expectedName) {
  const collection = source?._collection ?? {};
  if (collection.name !== expectedName) return [];
  const names = Array.isArray(collection.subscriptions)
    ? collection.subscriptions.filter(Boolean)
    : [];
  return names.map((name) => {
    const sub = source?.[name] ?? {};
    return {
      name,
      displayName: sub.displayName || sub["display-name"] || sub.name || name,
    };
  });
}

async function loadCollectionSubscriptions(collectionName) {
  try {
    const proxies = await produceArtifact({
      type: "collection",
      name: collectionName,
      platform: "ClashMeta",
      produceType: "internal",
    });
    const seen = new Map();
    for (const proxy of Array.isArray(proxies) ? proxies : []) {
      const name = proxy?._subName || proxy?.subscriptionName;
      if (!name || seen.has(name)) continue;
      seen.set(name, proxy?._subDisplayName || proxy?.subscriptionDisplayName || name);
    }
    return Array.from(seen.entries()).map(([name, displayName]) => ({
      name,
      displayName,
    }));
  } catch (e) {
    return [];
  }
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
