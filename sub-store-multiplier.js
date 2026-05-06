function operator(proxies, targetPlatform, context) {
  let multiplier = $arguments.multiplier;
  if (!multiplier) return;

  let multiplierMap = {
    0.1: /0\.[0-1]x/i,
    0.5: /0\.[0-5]x/i,
    1: /(?<![\d.])(?:1\.[1-9]\d*|[2-9]\d*(?:\.\d+)?)x/i,
    2: /(?<![\d.])(?:2\.[1-9]\d*|[3-9]\d*(?:\.\d+)?)x/i,
    3: /(?<![\d.])(?:3\.[1-9]\d*|[4-9]\d*(?:\.\d+)?)x/i,
  };

  return proxies.filter((proxy) => {
    if (multiplierMap[multiplier].test(proxy.name)) {
      return multiplier < 1;
    }
    return true;
  });
}
