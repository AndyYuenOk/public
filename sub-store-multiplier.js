function operator(proxies, targetPlatform, context) {
  let multiplier = $arguments.multiplier ?? 1;
  if (!multiplier) return;

  let [int, decimal] = multiplier.split(".");

  let multiplierReg = `(?<![\d.])(?:${int}\.[1-9]\d*|[${int + 1}-9]\d*(?:\.\d+)?)[x倍]`;

  if (multiplier < 1) {
    multiplierReg = `0\.[0-${decimal}][x倍]`;
  }

  return proxies.filter((proxy) => {
    const isMatch = RegExp(multiplierReg, "i").test(proxy.name);

    if (multiplier < 1) {
      return isMatch;
    }

    return !isMatch;
  });
}
