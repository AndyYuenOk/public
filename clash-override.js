const main = (config) => {
  config.rules.unshift('DOMAIN-SUFFIX,ikuncode.cc,DIRECT');
  config.rules.unshift('DOMAIN-SUFFIX,cctq.ai,DIRECT');
  config.rules.unshift('DOMAIN-SUFFIX,right.codes,DIRECT');
  config.rules.unshift('DOMAIN-SUFFIX,blackaicoding.com,DIRECT');
  config.rules.unshift('DOMAIN-SUFFIX,ip-api.com,DIRECT');
  config.rules.unshift('IP-CIDR,23.94.183.182/32,DIRECT,no-resolve');

  config.rules.unshift('PROCESS-NAME,com.docker.backend.exe,DIRECT');
  config.rules.unshift('DOMAIN-KEYWORD,docker,Proxy');

  return config;
};
