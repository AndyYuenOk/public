async function operator(proxies, targetPlatform, context) {
  if (targetPlatform === "JSON") {
    context.freeCache = 0;
    context.entranceCache = 0;
    context.egressCache = 0;
    context.aiCache = 0;
    if (!(context.entranceCache || context.egressCache || context.aiCache)) {
      const firstSource = Object.values(context.source)[0];
      $substore.delete(`${firstSource.name}-${firstSource.displayName}`);
    }
  }
}
