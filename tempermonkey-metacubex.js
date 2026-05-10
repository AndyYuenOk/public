// ==UserScript==
// @name         MetaCubeXD 节点名称全显示
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  取消 MetaCubeXD 仪表盘中的省略号限制，完整显示节点长名称
// @author       Gemini
// @match        https://metacubex.github.io/metacubexd/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  // 使用 GM_addStyle 注入 CSS，!important 确保优先级最高
  GM_addStyle(`
        /* 针对 MetaCubeXD 卡片布局的微调，防止文字堆叠 */
        .relative.h-full.p-1 h2 {
          -webkit-line-clamp: unset;
        }
    `);
})();
