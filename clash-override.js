const main = (config) => {
  config['sub-rules'] ??= {};
  config['sub-rules'].docker = [
    'DOMAIN-KEYWORD,docker,Proxy',
    'DOMAIN-KEYWORD,github,Proxy',
    'MATCH,DIRECT',
  ];

  config.rules.unshift('DOMAIN-SUFFIX,ip-api.com,DIRECT');
  config.rules.unshift('IP-CIDR,23.94.183.182/32,DIRECT,no-resolve');
  config.rules.unshift('DOMAIN-SUFFIX,host.docker.internal,DIRECT');
  config.rules.unshift('SUB-RULE,(PROCESS-NAME,com.docker.backend.exe),docker');

  return config;
};
