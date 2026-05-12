async function operator(proxies, targetPlatform, context) {
  if (targetPlatform === "JSON") {
    const firstSource = Object.values(context.source)[0];
    $substore.delete(`${firstSource.name}-${firstSource.displayName}`);
  }
}
