// ==UserScript==
// @name         Mobile search engineer switcher
// @namespace    http://tampermonkey.net/
// @version      2023.10.27
// @description  Mobile search engineer switcher
// @author       You
// @require      https://cdn.bootcdn.net/ajax/libs/jquery/3.7.1/jquery.slim.min.js
// @include      *://*.bing.*/search*
// @include      *://*.google.*/search*
// @include      *://*.baidu.*/*word*
// @include      *://*.baidu.*/*wd*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bing.com
// @noframes

// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log('mobile search engineer switcher')

    if (!/Mobi|Android|iPhone/i.test(navigator.userAgent)) return;


    // Disable the scroll to top functionality
    if (location.host.includes('bing.com')) {
        window.addEventListener('focus', function () {
            window.scrollTo = function (x, y) {
                if (y !== 0) {
                    window.scrollTo.originalFunc(x, y);
                }
            };
            window.scrollTo.originalFunc = window.scrollTo;
        });
    }

    let selector = '';
    if (location.host.includes('bing.com')) {
        selector = '[role="navigation"] ul';
    } else if (location.host.includes('google.com')) {
        selector = '#hdtb-msb';
    } else if (location.host.includes('baidu.com')) {
        selector = '.se-tab-lists';
    }

    !function () {
        if ($(selector).length && !$('.injection-mses').length) {
            if (location.host.includes('bing.com')) {
                $(selector).prepend([
                    ['谷歌', 'google.com/search?q='],
                    ['百度', 'baidu.com/s?wd=']
                ].map(([name, url]) => {
                    return $(`<li class="injection-mses"><a>${name}</a></li>`).click(() => {
                        location.href = 'https://' + url + new URLSearchParams(location.search).get('q');
                    });
                }));
            } else if (location.host.includes('google.com')) {
                $(selector).prepend([
                    ['必应', 'bing.com/search?q='],
                    ['百度', 'baidu.com/s?wd=']
                ].map(([name, url]) => {
                    return $(`<div class="injection-mses hdtb-mitem"><a>${name}</a></div>`).click(() => {
                        location.href = 'https://' + url + new URLSearchParams(location.search).get('q');
                    });
                }));
            } else if (location.host.includes('baidu.com')) {
                $(selector).prepend([
                    ['必应', 'bing.com/search?q='],
                    ['谷歌', 'google.com/search?q='],
                ].map(([name, url]) => {
                    return $(`<a class="injection-mses se-tabitem"><span>${name}</span></a>`).click(() => {
                        const params = new URLSearchParams(location.search);
                        location.href = 'https://' + url + (params.get('wd') || params.get('word'));
                    });
                }));
            }
        } else {
            setTimeout(arguments.callee, 100);
        }
    }();
})();