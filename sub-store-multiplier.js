function operator(proxies, targetPlatform, context) {
  let multiplier = $arguments.multiplier ?? 1;
  if (!multiplier) return;

  let multiplierMap = {
    0.1: /0\.[0-1][x倍]/i,
    0.5: /0\.[0-5][x倍]/i,
    1: /(?<![\d.])(?:1\.[1-9]\d*|[2-9]\d*(?:\.\d+)?)[x倍]/i,
    2: /(?<![\d.])(?:2\.[1-9]\d*|[3-9]\d*(?:\.\d+)?)[x倍]/i,
    3: /(?<![\d.])(?:3\.[1-9]\d*|[4-9]\d*(?:\.\d+)?)[x倍]/i,
  };

  return proxies.filter((proxy) => {
    const isMatch = multiplierMap[multiplier].test(proxy.name);

    if (multiplier < 1) {
      return isMatch;
    }

    return !isMatch;
  });
}
