async function operator(proxies, targetPlatform, context) {
  if (targetPlatform === "JSON") {
    context.freeCache = 0;
    context.entranceCache = 0;
    context.egressCache = 0;
    context.aiCache = 0;

    const source = Object.values(context.source)[0];
    const key = `#${source.name}-${source.displayName}`;
    const proxyMap = $substore.read(key) ?? {};
    const names = proxies.map((proxy) => proxy.name);
    for (const name in proxyMap) {
      if (!names.includes(name)) {
        delete proxyMap[name];
      }
    }
    $substore.write(proxyMap, key);
  }
}
