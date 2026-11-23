(function () {
  'use strict';

  /* ---------------- 路由表 ---------------- */
  var ROUTES = ['/', '/story', '/football', '/blog', '/post', '/tips'];
  var TITLES = {
    '/': 'Chew Teck Wai',
    '/story': '时间线 — Chew Teck Wai',
    '/football': '后腰 — Chew Teck Wai',
    '/blog': '博客 — Chew Teck Wai',
    '/post': '博客 — Chew Teck Wai',
    '/tips': '班级小贴士 — Chew Teck Wai'
  };

  var views = Array.prototype.slice.call(document.querySelectorAll('.view'));
  var progress = document.getElementById('progress');
  var root = document.documentElement;

  /* ---------------- 文章库 ----------------
     正文唯一来源是 assets/articles.html；首页不再内联 25 篇文章，首屏 HTML 体积减半。
     进入 /blog 或文章页时按需加载，加载完成后补渲染一次。 */
  // 从 site.js 自身位置反推站点根：换仓库名、换域名或本地预览都不会 404
  var ARTICLES_URL = (function () {
    var self = document.querySelector('script[src$="site.js"]');
    if (!self || !self.src) return '/me/assets/articles.html';
    return self.src.replace(/assets\/site\.js.*$/, '') + 'assets/articles.html';
  })();
  var POSTS = [];
  var POST_BY_SLUG = {};
  var artHost = document.getElementById('articles');
  var articlesReady = false;
  var articlesLoading = false;
  var articleWaiters = [];

  function collectPosts() {
    POSTS.length = 0;
    POST_BY_SLUG = {};
    if (!artHost) return;
    Array.prototype.forEach.call(artHost.querySelectorAll('template[data-art]'), function (t) {
      var post = {
        slug: t.getAttribute('data-art'),
        title: t.getAttribute('data-title') || '',
        date: t.getAttribute('data-date') || '',
        desc: t.getAttribute('data-desc') || '',
        topic: t.getAttribute('data-topic') || '',
        frag: t.content || null
      };
      if (!post.slug) return;
      // 字数与阅读时长由正文自己算，不写死在属性里，免得改文后对不上
      var plain = (t.content && t.content.textContent) || '';
      post.chars = plain.replace(/\s+/g, '').length;
      post.minutes = Math.max(1, Math.round(post.chars / 400));
      POSTS.push(post);
      POST_BY_SLUG[post.slug] = post;
    });
  }

  function loadArticles(done) {
    if (articlesReady) { if (done) done(); return; }
    if (done) articleWaiters.push(done);
    if (articlesLoading) return;
    articlesLoading = true;
    fetch(ARTICLES_URL).then(function (r) {
      if (!r.ok) throw new Error('articles HTTP ' + r.status);
      return r.text();
    }).then(function (text) {
      var doc = new DOMParser().parseFromString(text, 'text/html');
      Array.prototype.forEach.call(doc.querySelectorAll('template[data-art]'), function (t) {
        artHost.appendChild(document.importNode(t, true));
      });
      collectPosts();
      buildBlogList();
      articlesReady = true;
      articlesLoading = false;
      articleWaiters.splice(0).forEach(function (fn) { fn(); });
    }).catch(function () {
      // 取不到文章时保持页面可用：博客列表留空，正文页仍显示静态文章
      articlesLoading = false;
      articleWaiters.splice(0).forEach(function (fn) { fn(); });
    });
  }

  function parseHash(hash) {
    var h = String(hash || '').replace(/^#/, '');
    if (!h || h === '/') {
      // 生成页用 data-default-route 指定落点，避免地址栏出现 #/ 也能打开文章
      var dr = root.getAttribute('data-default-route');
      var ds = root.getAttribute('data-default-slug');
      if (dr && ROUTES.indexOf(dr) > -1) return { route: dr, slug: ds || null };
      return { route: '/', slug: null };
    }
    h = h.replace(/\/+$/, '');

    var m = /^\/blog\/([A-Za-z0-9_-]+)$/.exec(h);
    if (m && POST_BY_SLUG[m[1]]) return { route: '/post', slug: m[1] };

    return { route: ROUTES.indexOf(h) > -1 ? h : '/', slug: null };
  }

  /* ---------------- 滚动淡入（全站动效 #2） ----------------
     reduced-motion 下不注册 observer，元素由 CSS !important 直接可见。 */
  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var io = null;

  if (!reduceQuery.matches && 'IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0 });
  }

  function observePending() {
    if (!io) return;
    var nodes = document.querySelectorAll('.reveal:not(.is-in)');
    Array.prototype.forEach.call(nodes, function (el) { io.observe(el); });
  }

  /* ---------------- 阅读进度线（仅 /story） ---------------- */
  var rafId = 0;

  function paintProgress() {
    rafId = 0;
    if (!progress) return;
    var isStory = root.getAttribute('data-route') === '/story';
    var max = root.scrollHeight - window.innerHeight;
    var p = (isStory && max > 0) ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    progress.style.setProperty('--p', String(p));
  }

  function queueProgress() {
    if (!rafId) rafId = window.requestAnimationFrame(paintProgress);
  }

  window.addEventListener('scroll', queueProgress, { passive: true });
  window.addEventListener('resize', queueProgress);

  /* ---------------- 视图切换 ----------------
     C10：只在路由真的变化时滚回顶部；首次进入不动，保留浏览器原生滚动恢复。 */
  var prevKey = null;

  function renderPost(slug) {
    var post = POST_BY_SLUG[slug];
    if (!post) return;

    var h1 = document.getElementById('post-h1');
    var lede = document.getElementById('post-lede');
    var meta = document.getElementById('post-meta');
    var body = document.getElementById('post-body');
    var footNote = document.getElementById('post-foot-note');
    if (!body) return;

    if (h1) h1.textContent = post.title;
    if (lede) lede.textContent = post.desc;
    if (meta) {
      meta.textContent = post.date + ' · ' +
        String(post.chars).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' 字 · 约 ' +
        post.minutes + ' 分钟';
    }
    if (footNote) footNote.textContent = post.date;

    // 生成页正文已静态落位，跳过重绘，但「继续读」仍要补上
    if (body.getAttribute('data-slug') === slug) { renderMore(post); return; }
    while (body.firstChild) body.removeChild(body.firstChild);
    if (post.frag) body.appendChild(post.frag.cloneNode(true));
    body.setAttribute('data-slug', slug);

    renderMore(post);
  }

  /* ---------------- 继续读 ----------------
     相关推荐：同 data-topic 的其它文章取最新的 2 篇；同主题不足时，
     用全站最新文章补齐到 2 篇。推荐列表与博客列表同样式，点进去就是下一篇。 */
  var TOPIC_NAME = { investment: '投资', ai: 'AI 与工具', learning: '学习方法', thinking: '思考' };

  function renderMore(post) {
    var box = document.getElementById('post-more');
    var list = document.getElementById('post-more-list');
    if (!box || !list) return;

    var same = POSTS.filter(function (p) { return p !== post && p.topic === post.topic; });
    var rest = POSTS.filter(function (p) { return p !== post && p.topic !== post.topic; });
    var pick = same.slice(0, 2);
    var k = 0;
    while (pick.length < 2 && k < rest.length) {
      if (pick.indexOf(rest[k]) === -1) pick.push(rest[k]);
      k++;
    }

    while (list.firstChild) list.removeChild(list.firstChild);
    pick.forEach(function (p) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '/me/blog/' + p.slug + '/';
      a.className = 'post-more-link';
      var t = document.createElement('span');
      t.className = 'post-more-title';
      t.textContent = p.title;
      var meta = document.createElement('span');
      meta.className = 'post-more-date num';
      meta.textContent = (p.date || '').slice(0, 7);
      a.appendChild(t);
      a.appendChild(meta);
      li.appendChild(a);
      list.appendChild(li);
    });
    box.hidden = pick.length === 0;
  }

  function buildBlogList() {
    var list = document.querySelector('.blog-list');
    if (!list || !POSTS.length) return;

    while (list.firstChild) list.removeChild(list.firstChild);

    var lastYear = null;
    POSTS.forEach(function (p) {
      var year = (p.date || '').slice(0, 4);
      if (year && year !== lastYear) {
        var y = document.createElement('div');
        y.className = 'blog-year num';
        y.textContent = year;
        list.appendChild(y);
        lastYear = year;
      }

      var row = document.createElement('a');
      row.className = 'blog-row';
      row.href = '/me/blog/' + p.slug + '/';

      var meta = document.createElement('span');
      meta.className = 'blog-meta';

      var d = document.createElement('span');
      d.className = 'num';
      d.textContent = (p.date || '').slice(5);

      // 阅读时长不进列表：日期 + 标题 + 一句话摘要已经够判断要不要点
      meta.appendChild(d);

      // h2 不是 h3：页面 h1 是「博客」，列表项再往下跳一级会出现 heading-order 违规
      var t = document.createElement('h2');
      t.className = 'blog-title';
      t.textContent = p.title;

      var s = document.createElement('span');
      s.className = 'blog-desc';
      s.textContent = p.desc;

      row.appendChild(meta);
      row.appendChild(t);
      row.appendChild(s);
      list.appendChild(row);
    });

    var count = document.getElementById('blog-count');
    if (count) {
      var years = POSTS.map(function (p) { return (p.date || '').slice(0, 4); })
                       .filter(Boolean).sort();
      count.textContent = POSTS.length + ' 篇 · ' +
        (years.length ? years[0] + ' – ' + years[years.length - 1] : '');
    }
  }

  function markZoomable() {
    /* 给当前可见视图里的图片和 SVG 信息图补上「可点、可聚焦」的语义。
       只标语义，不绑事件——点击统一走下面的 document 委托，博客正文后渲染也覆盖得到。 */
    var nodes = document.querySelectorAll('.view img, .view svg.art-fig');
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.closest('.lightbox')) return;
      // 二维码只保留点击放大，不进 Tab 顺序，避免键盘用户停在无法操作的停靠点
      if (!el.closest('.contact-qr') && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('aria-label')) {
        var label = el.getAttribute('alt') || el.getAttribute('aria-label') || '图片';
        el.setAttribute('aria-label', label + '，放大查看');
      }
    });
  }

  function applyRoute() {
    var parsed = parseHash(window.location.hash);
    var route = parsed.route;
    var key = route + (parsed.slug ? '/' + parsed.slug : '');
    var changed = prevKey !== null && key !== prevKey;

    // 博客列表与文章页依赖文章库；未加载完先挂起，加载完自动重跑本函数
    if ((route === '/blog' || route === '/post') && !articlesReady) {
      loadArticles(function () { applyRoute(); });
      return;
    }

    if (route === '/post') renderPost(parsed.slug);

    views.forEach(function (view) {
      view.classList.toggle('is-active', view.getAttribute('data-view') === route);
    });
    root.setAttribute('data-route', route);

    var post = parsed.slug ? POST_BY_SLUG[parsed.slug] : null;
    document.title = post ? post.title + ' — Chew Teck Wai' : TITLES[route];

    if (changed) window.scrollTo(0, 0);
    prevKey = key;

    observePending();
    queueProgress();
    /* 图片放大：给当前视图里的图补上「可点」的语义与键盘可达性 */
    markZoomable();
  }

  collectPosts();
  buildBlogList();

  if (!window.location.hash && !root.getAttribute('data-default-route')) {
    try { window.history.replaceState(null, '', '#/'); } catch (e) {}
  }

  window.addEventListener('hashchange', applyRoute);
  applyRoute();
  // 首屏渲染不阻塞；文章库异步到位后再补一次渲染，博客列表与继续读才出现
  loadArticles(function () { applyRoute(); });

  /* 页头「联系我」：切回首页后滚到二维码区 */
  document.querySelectorAll('[data-contact]').forEach(function (a) {
    a.addEventListener('click', function () {
      setTimeout(function () {
        var el = document.getElementById('contact');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
    });
  });

  /* 班级小贴士：一键复制请假模板。
     file:// 下 navigator.clipboard 常被禁，退回 execCommand；
     都不行就提示手动选中，不弹窗、不打断阅读。 */
  var tplBtn = document.getElementById('tpl-copy');
  var tplPre = document.getElementById('tpl-text');
  var tplStatus = document.getElementById('tpl-status');
  if (tplBtn && tplPre && tplStatus) {
    var tplTimer = null;
    function tplDone(ok) {
      tplStatus.textContent = ok ? '已复制' : '请手动选中复制';
      if (tplTimer) clearTimeout(tplTimer);
      tplTimer = setTimeout(function () { tplStatus.textContent = ''; }, 2600);
    }
    function tplFallback(text) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        tplDone(ok);
      } catch (e) { tplDone(false); }
    }
    tplBtn.addEventListener('click', function () {
      var text = tplPre.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { tplDone(true); },
          function () { tplFallback(text); }
        );
      } else {
        tplFallback(text);
      }
    });
  }

  /* 回到顶部：滚动过 1.2 屏才淡入（刚下滑一点不冒按钮）。
     scroll 用 rAF 合并，一次滚动只算一次；系统开了「减少动态效果」就直接跳，不做平滑。 */
  var toTop = document.getElementById('to-top');
  if (toTop) {
    var toTopRaf = 0;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function syncToTop() {
      toTopRaf = 0;
      toTop.classList.toggle('is-visible', window.scrollY > window.innerHeight * 1.2);
    }
    function queueToTop() {
      if (!toTopRaf) toTopRaf = window.requestAnimationFrame(syncToTop);
    }

    window.addEventListener('scroll', queueToTop, { passive: true });
    window.addEventListener('resize', queueToTop, { passive: true });

    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      /* 回顶后按钮随即隐藏，焦点留在隐藏元素上会让读屏用户失去落点，交还给文档 */
      if (typeof toTop.blur === 'function') toTop.blur();
    });

    syncToTop();
  }

  /* ---------------- 图片放大（J-46） ----------------
     点任意图片：独立铺满窗口看；点图片循环 适应 → 1:1 → 2x → 3x → 回适应。
     关闭：点画面外、点右上角关闭、按 ESC。关闭后焦点回到原来那张图。
     事件委托：博客正文是脚本渲染的，绑 document 才能覆盖所有图片。
     博客里的内联 SVG 信息图（.art-fig）同样可点开。 */
  var lb = document.getElementById('lightbox');
  var lbStage = document.getElementById('lightbox-stage');
  var lbClose = document.getElementById('lightbox-close');
  var lbCap = document.getElementById('lightbox-cap');
  var lbReturn = null;
  var lbBase = 0;           // 打开时的基准宽度（照片取原像素，SVG 取适应宽度），缩放都按它算
  var lbSteps = [1, 2, 3];
  var lbStep = -1;          // -1 = 适应窗口

  function lbFit() {
    lbStep = -1;
    lb.classList.remove('is-raw');
    var m = lbStage.firstElementChild;
    if (m) { m.style.width = ''; m.style.maxWidth = '100%'; m.style.maxHeight = '100%'; }
  }

  function lbZoom(step) {
    var m = lbStage.firstElementChild;
    if (!m) return;
    lbStep = step;
    lb.classList.add('is-raw');
    m.style.maxWidth = 'none';
    m.style.maxHeight = 'none';
    m.style.width = Math.round(lbBase * lbSteps[step]) + 'px';
    if (m.tagName && m.tagName.toLowerCase() === 'svg') m.style.height = 'auto';
  }

  if (lb && lbStage) {
    // 灯箱打开时让背景整体 inert：既挡 Tab，也挡读屏读到弹层后面的内容
    var bgNodes = document.querySelectorAll('.site-header, main, .site-footer, .to-top');
    function setBackgroundInert(on) {
      Array.prototype.forEach.call(bgNodes, function (node) {
        if (on) node.setAttribute('inert', '');
        else node.removeAttribute('inert');
      });
    }

    function lbOpen(el) {
      var isSvg = el.tagName && el.tagName.toLowerCase() === 'svg';
      lbReturn = el;
      lbStage.textContent = '';
      var big;
      if (isSvg) {
        big = el.cloneNode(true);
        big.setAttribute('class', 'lightbox-media lightbox-media--svg');
        big.removeAttribute('style');
        lbCap.textContent = el.getAttribute('aria-label') || '';
      } else {
        var src = el.currentSrc || el.getAttribute('src');
        if (!src) return;
        big = document.createElement('img');
        big.className = 'lightbox-media';
        big.src = src;
        big.alt = el.getAttribute('alt') || '';
        big.decoding = 'async';
        lbCap.textContent = el.getAttribute('alt') || '';
      }
      lbStage.appendChild(big);
      lb.hidden = false;
      setBackgroundInert(true);
      root.classList.add('lb-locked');
      /* 打开时锁住背景滚动，关回去再放行；手机上避免穿透滑动 */
      document.body.style.overflow = 'hidden';
      lbFit();
      /* 基准宽度优先级：原图已解码就用 naturalWidth；懒加载还没解码时退到标签上的
         width 属性（本站每张图都写了原尺寸），最后才量当前渲染宽。 */
      lbBase = isSvg
        ? (Math.round(big.getBoundingClientRect().width) || 800)
        : (el.naturalWidth || parseInt(el.getAttribute('width'), 10) ||
           Math.round(big.getBoundingClientRect().width) || 800);
      if (!isSvg && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      if (lbClose) lbClose.focus();
    }

    function lbShut() {
      if (lb.hidden) return;
      lb.hidden = true;
      setBackgroundInert(false);
      lb.classList.remove('is-raw');
      lbStage.textContent = '';
      root.classList.remove('lb-locked');
      document.body.style.overflow = '';
      if (lbReturn && typeof lbReturn.focus === 'function') lbReturn.focus();
      lbReturn = null;
    }

    /* 点击：图片本体开灯箱；灯箱内点图切换缩放档；点空白关闭 */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || t.nodeType !== 1) return;
      if (lb.contains(t)) {
        if (t === lbClose) { lbShut(); return; }
        /* 点图片本体（含 SVG 内部的 path/rect）都算：往上找最近的媒体元素 */
        var hit = t.classList && t.classList.contains('lightbox-media') ? t : (t.closest ? t.closest('.lightbox-media') : null);
        if (hit) {
          if (lbStep + 1 >= lbSteps.length) { lbFit(); }
          else { lbZoom(lbStep + 1); }
          return;
        }
        if (t === lbStage || t === lb) { lbShut(); }
        return;
      }
      if (t.tagName === 'IMG') {
        e.preventDefault();
        lbOpen(t);
        return;
      }
      var fig = t.closest ? t.closest('svg.art-fig') : null;
      if (fig) {
        e.preventDefault();
        lbOpen(fig);
      }
    });

    /* 键盘也能开图：焦点在图片或信息图上，回车/空格即可 */
    document.addEventListener('keydown', function (e) {
      if (!lb.hidden) {
        // 弹层内只有关闭按钮可聚焦，Tab 一律留在按钮上，配合 inert 形成完整焦点陷阱
        if (e.key === 'Tab') { e.preventDefault(); if (lbClose) lbClose.focus(); return; }
        if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); lbShut(); }
        return;
      }
      var t = e.target;
      if (!t || (e.key !== 'Enter' && e.key !== ' ')) return;
      if (t.tagName === 'IMG') {
        e.preventDefault();
        lbOpen(t);
        return;
      }
      var fig = t.closest ? t.closest('svg.art-fig') : null;
      if (fig) { e.preventDefault(); lbOpen(fig); }
    });

    /* 灯箱里图片自己抛错时（本地 file:// 也能触发），保持关闭态即可，不弹提示 */
    lbStage.addEventListener('error', function () { lbShut(); }, true);
  }
})();

/* a11y：当前页导航项加 aria-current=page（读屏可播报） */
(function(){
  var nav = document.querySelector('.site-nav');
  if(!nav) return;
  function sync(){
    var r = document.documentElement.getAttribute('data-route') || '/';
    if (r.length > 1) r = r.replace(/\/+$/,'');
    nav.querySelectorAll('a').forEach(function(a){
      var h = (a.getAttribute('href')||'').replace(/^#/,'');
      if (h === r) a.setAttribute('aria-current','page');
      else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange', function(){ setTimeout(sync, 0); });
  window.addEventListener('load', function(){ setTimeout(sync, 0); });
  sync();
})();

/* 9.Navigation：地址不存在时给出提示（原本静默回首页） */
(function(){
  var toast = null, timer = null;
  function dismiss(){ if (toast && toast.parentNode) toast.parentNode.removeChild(toast); toast = null; clearTimeout(timer); }
  function show(){
    if (toast) return;
    toast = document.createElement('div');
    toast.className = 'route-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = '这个地址没找到，已经带你回首页了。点一下关闭。';
    toast.addEventListener('click', dismiss);
    document.body.appendChild(toast);
    timer = setTimeout(dismiss, 6000);
  }
  function check(){
    setTimeout(function(){
      var h = location.hash.replace(/^#/, '');
      if (!h || h === '/' || h === '') return;
      var route = document.documentElement.getAttribute('data-route') || '/';
      var known = ['/story','/football','/blog','/contact','/post','/'];
      var isPost = /^\/post\//.test(h) || /^\/blog\//.test(h);
      if (!isPost && known.indexOf(h) === -1 && route === '/') show();
    }, 120);
  }
  window.addEventListener('hashchange', check);
  window.addEventListener('load', check);
})();
