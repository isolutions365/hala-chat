/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-3b23c8c3'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "welcome.html",
    "revision": "37a0133ea1ac3a0a54e1dde7e2364214"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "cc7c4ee7577bb67750c6bde50641db1f"
  }, {
    "url": "pwa-512x512.png",
    "revision": "7a545e034574d9e81f6e0762f48d5fcb"
  }, {
    "url": "pwa-192x192.png",
    "revision": "717fc07c5a479e26039d3b2132dd32d5"
  }, {
    "url": "index.html",
    "revision": "13b28e8b8a739a52026552b746a7517e"
  }, {
    "url": "icon.svg",
    "revision": "f18dcf9743ffb4230cf486b53a9ae555"
  }, {
    "url": "icon-maskable.svg",
    "revision": "2a8b632cc56b85367b1b42b8236c98c4"
  }, {
    "url": "favicon.png",
    "revision": "a9ae909e6569bbcdca1b0a19cdb30458"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "3a79eb2879c8af661638e55459256886"
  }, {
    "url": "assets/workbox-window.prod.es5-BBnX5xw4.js",
    "revision": null
  }, {
    "url": "assets/radio-DYZNRE-8.js",
    "revision": null
  }, {
    "url": "assets/mic-BW3LnVZl.js",
    "revision": null
  }, {
    "url": "assets/main-c4dGt6Vo.js",
    "revision": null
  }, {
    "url": "assets/main-CSUq6CXd.css",
    "revision": null
  }, {
    "url": "assets/formatters-C5Eh3Yzt.js",
    "revision": null
  }, {
    "url": "assets/arrow-up-right-CmCyro-K.js",
    "revision": null
  }, {
    "url": "assets/ConversationScreen-S2RKVC7k.js",
    "revision": null
  }, {
    "url": "assets/ChatListScreen-B7FVUvfk.js",
    "revision": null
  }, {
    "url": "assets/ActiveCallScreen-CjlEqsyE.js",
    "revision": null
  }, {
    "url": "assets/aistudio/image_dad32c3b.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_c6cfd014.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_6d6e5ef2.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_0e5af334.png",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "3a79eb2879c8af661638e55459256886"
  }, {
    "url": "favicon.png",
    "revision": "a9ae909e6569bbcdca1b0a19cdb30458"
  }, {
    "url": "icon.svg",
    "revision": "f18dcf9743ffb4230cf486b53a9ae555"
  }, {
    "url": "pwa-192x192.png",
    "revision": "717fc07c5a479e26039d3b2132dd32d5"
  }, {
    "url": "pwa-512x512.png",
    "revision": "7a545e034574d9e81f6e0762f48d5fcb"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "cc7c4ee7577bb67750c6bde50641db1f"
  }, {
    "url": "manifest.webmanifest",
    "revision": "a21a9796df45ccf830f99ecb2015a0d7"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.StaleWhileRevalidate({
    "cacheName": "google-fonts-stylesheets",
    plugins: []
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-webfonts",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 30,
      maxAgeSeconds: 31536000
    })]
  }), 'GET');

}));
