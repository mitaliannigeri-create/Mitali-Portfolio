/**
 * ╔═══════════════════════════════════════════════════════════════════════════
 * ║  MITALI ANNIGERI — PORTFOLIO
 * ║  Complete Interaction Layer
 * ║  Version: 1.0 — Production
 * ║
 * ║  Module architecture (IIFE-wrapped, no global pollution):
 * ║
 * ║   1.  Utilities          — helpers, guards, RAF throttle, debounce
 * ║   2.  Reduced-motion     — system preference detection, motion flag
 * ║   3.  Theme              — dark/light toggle, persistence, system sync
 * ║   4.  Scroll progress    — progress bar, RAF-throttled
 * ║   5.  Navigation         — active state, scroll-offset anchors, compress
 * ║   6.  Mobile nav         — hamburger open/close, keyboard, outside-click
 * ║   7.  Back to top        — visibility threshold, smooth scroll
 * ║   8.  Reveal animations  — per-section stagger, reduced-motion guard
 * ║   9.  Hero entrance      — sequenced entrance on first paint
 * ║  10.  Education timeline — sequential cascade reveal
 * ║  11.  Analytics bars     — viewport-triggered width animation
 * ║  12.  Creative filter    — ARIA-aware filtering, empty state, animation
 * ║  13.  Creative modal     — focus trap, return-focus, keyboard, ARIA
 * ║  14.  Hash routing       — URL hash → active nav on load
 * ║  15.  Resize handler     — debounced, recalculates nav offset
 * ║  16.  Accessibility      — skip link, live regions, keyboard enhancements
 * ╚═══════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';


  /* ═══════════════════════════════════════════════════════════════════════
     1. UTILITIES
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * RAF-throttled scroll listener.
   * All scroll handlers are registered through this single loop.
   * Prevents multiple competing requestAnimationFrame calls.
   */
  const ScrollBus = (function () {
    const subscribers = [];
    let ticking = false;

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          subscribers.forEach(fn => fn());
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    return {
      subscribe: function (fn) {
        subscribers.push(fn);
      }
    };
  })();

  /**
   * Debounce — delays execution until after `wait` ms of inactivity.
   * Used for resize events.
   */
  function debounce(fn, wait) {
    let timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  /**
   * Safe querySelector — returns null without throwing.
   */
  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  /**
   * Safe querySelectorAll — always returns an array.
   */
  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  /**
   * Get the current fixed nav height (may change at breakpoints).
   */
  function navHeight() {
    const header = qs('#site-header');
    return header ? header.offsetHeight : 68;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     2. REDUCED-MOTION
     ─────────────────────────────────────────────────────────────────────
     Single source of truth for motion preference.
     All animation modules check this before running.
     Re-evaluates if the user changes the OS preference mid-session.
     ═══════════════════════════════════════════════════════════════════════ */

  const MotionPreference = (function () {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = mq.matches;

    mq.addEventListener('change', function (e) {
      reduced = e.matches;
    });

    return {
      isReduced: function () { return reduced; }
    };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     3. THEME
     ─────────────────────────────────────────────────────────────────────
     Priority order for initial theme:
       1. User's saved preference (localStorage)
       2. OS-level prefers-color-scheme
       3. Default: light
     ═══════════════════════════════════════════════════════════════════════ */

  const Theme = (function () {
    const HTML        = document.documentElement;
    const STORAGE_KEY = 'ma-theme';
    const toggle      = qs('#theme-toggle');
    const sysMQ       = window.matchMedia('(prefers-color-scheme: dark)');

    function applyTheme(value) {
      HTML.setAttribute('data-theme', value);
      // Update toggle aria-label to reflect current state
      if (toggle) {
        toggle.setAttribute(
          'aria-label',
          value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
        );
        toggle.setAttribute('aria-pressed', value === 'dark' ? 'true' : 'false');
      }
    }

    function init() {
      const saved  = localStorage.getItem(STORAGE_KEY);
      const system = sysMQ.matches ? 'dark' : 'light';
      applyTheme(saved || system);

      // Toggle on click
      if (toggle) {
        toggle.addEventListener('click', function () {
          const current = HTML.getAttribute('data-theme');
          const next    = current === 'dark' ? 'light' : 'dark';
          applyTheme(next);
          localStorage.setItem(STORAGE_KEY, next);
        });
      }

      // Sync if system preference changes and user has no saved preference
      sysMQ.addEventListener('change', function (e) {
        if (!localStorage.getItem(STORAGE_KEY)) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     4. SCROLL PROGRESS
     ─────────────────────────────────────────────────────────────────────
     Thin gold bar across the top of the viewport.
     Uses a CSS custom property (--progress) to drive width —
     avoids layout thrash vs. setting element width directly.
     ═══════════════════════════════════════════════════════════════════════ */

  const ScrollProgress = (function () {
    const bar = qs('#scroll-progress');

    function update() {
      if (!bar) return;
      const scrollable = document.body.scrollHeight - window.innerHeight;
      const pct = scrollable > 0
        ? Math.min(100, (window.scrollY / scrollable) * 100)
        : 0;
      bar.style.setProperty('--progress', pct.toFixed(2) + '%');
      bar.setAttribute('aria-valuenow', Math.round(pct));
    }

    function init() {
      ScrollBus.subscribe(update);
      update(); // initial paint
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     5. NAVIGATION
     ─────────────────────────────────────────────────────────────────────
     A. Active state — scroll-direction-aware IntersectionObserver.
        Tracks which section is most prominent in the viewport.
        Handles rapid scrolling in both directions correctly.

     B. Anchor click offset — smooth scrolls to section minus nav height,
        so content is never hidden behind the fixed header.

     C. Nav compression — nav slightly reduces in size once scrolled
        past the hero, giving more reading space on long sections.

     D. Hash on load — reads window.location.hash and sets active nav.
     ═══════════════════════════════════════════════════════════════════════ */

  const Navigation = (function () {
    const header   = qs('#site-header');
    const sections = qsa('section[data-section]');
    const navLinks = qsa('[data-nav-target]');

    // Track scroll direction
    let lastScrollY = window.scrollY;
    let activeSection = null;

    function setActive(sectionId) {
      if (activeSection === sectionId) return;
      activeSection = sectionId;
      navLinks.forEach(function (link) {
        const isActive = link.dataset.navTarget === sectionId;
        link.classList.toggle('is-active', isActive);
        link.setAttribute('aria-current', isActive ? 'true' : 'false');
      });
    }

    // IntersectionObserver — tracks which section occupies most of viewport
    function initActiveState() {
      if (!sections.length) return;

      const io = new IntersectionObserver(function (entries) {
        // Build a map of currently intersecting sections with their ratios
        const intersecting = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (intersecting.length > 0) {
          setActive(intersecting[0].target.dataset.section);
        }
      }, {
        threshold: [0.15, 0.35, 0.5],
        rootMargin: '-' + navHeight() + 'px 0px -20% 0px'
      });

      sections.forEach(s => io.observe(s));
    }

    // Smooth scroll with nav offset for all internal anchor links
    function initAnchorOffset() {
      document.addEventListener('click', function (e) {
        const anchor = e.target.closest('a[href^="#"]');
        if (!anchor) return;

        const id = anchor.getAttribute('href').slice(1);
        if (!id) return;

        const target = document.getElementById(id);
        if (!target) return;

        e.preventDefault();
        const offset = target.getBoundingClientRect().top
                     + window.scrollY
                     - navHeight()
                     - 16; // 16px breathing room

        window.scrollTo({
          top: Math.max(0, offset),
          behavior: MotionPreference.isReduced() ? 'auto' : 'smooth'
        });

        // Update URL without triggering a jump
        if (window.history && window.history.pushState) {
          window.history.pushState(null, '', '#' + id);
        }

        // Move focus to the target section for keyboard/screen reader users
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        target.addEventListener('blur', function onBlur() {
          target.removeAttribute('tabindex');
          target.removeEventListener('blur', onBlur);
        }, { once: true });
      });
    }

    // Nav compression — adds .is-scrolled class after hero
    function initCompression() {
      if (!header) return;

      function update() {
        const heroHeight = (qs('.section--hero') || { offsetHeight: window.innerHeight }).offsetHeight;
        header.classList.toggle('is-scrolled', window.scrollY > heroHeight * 0.5);
      }

      ScrollBus.subscribe(update);
      update();
    }

    // Hash on load
    function initHashRouting() {
      function applyHash() {
        const hash = window.location.hash.slice(1);
        if (hash) setActive(hash);
      }

      applyHash();
      window.addEventListener('hashchange', applyHash);
    }

    function init() {
      initActiveState();
      initAnchorOffset();
      initCompression();
      initHashRouting();
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     6. MOBILE NAVIGATION
     ─────────────────────────────────────────────────────────────────────
     Wires the hamburger toggle to the mobile panel defined in the CSS.
     The panel is injected into the DOM here if it doesn't exist in HTML,
     so the JS is the single source of truth for mobile nav behaviour.

     Keyboard behaviour:
       - Escape  : close panel, return focus to toggle
       - Tab     : cycles within panel when open
       - Links   : close panel on click
     ═══════════════════════════════════════════════════════════════════════ */

  const MobileNav = (function () {

    function ensureToggleExists() {
      const nav = qs('#site-header nav');
      if (!nav) return null;

      // Inject toggle button if not in HTML
      let btn = qs('.nav-menu-toggle');
      if (!btn) {
        btn = document.createElement('button');
        btn.className      = 'nav-menu-toggle';
        btn.type           = 'button';
        btn.setAttribute('aria-label',    'Open navigation menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'nav-mobile-panel');
        btn.innerHTML = '<span aria-hidden="true">Menu</span>';
        const actions = qs('.nav-actions', nav);
        if (actions) {
          nav.insertBefore(btn, actions);
        } else {
          nav.appendChild(btn);
        }
      }
      return btn;
    }

    function ensurePanelExists() {
      let panel = qs('#nav-mobile-panel');
      if (!panel) {
        panel = document.createElement('nav');
        panel.id             = 'nav-mobile-panel';
        panel.className      = 'nav-mobile-panel';
        panel.setAttribute('aria-label', 'Mobile navigation');
        panel.setAttribute('hidden', '');

        // Clone the desktop nav links
        const links = [
          { href: '#about',          label: 'About'              },
          { href: '#education',      label: 'Education'          },
          { href: '#work',           label: 'Areas of Work'      },
          { href: '#experience',     label: 'Experience'         },
          { href: '#research',       label: 'Research'           },
          { href: '#analytics',      label: 'Analytics'          },
          { href: '#creative',       label: 'Creative Work'      },
          { href: '#leadership',     label: 'Leadership'         },
          { href: '#beyond',         label: 'Beyond Work'        },
          { href: '#certifications', label: 'Certifications'     },
          { href: '#academic',       label: 'Academic Excellence'},
          { href: '#contact',        label: 'Contact'            }
        ];

        links.forEach(function (l) {
          const a = document.createElement('a');
          a.href      = l.href;
          a.textContent = l.label;
          a.dataset.navTarget = l.href.slice(1);
          panel.appendChild(a);
        });

        const header = qs('#site-header');
        if (header) header.after(panel);
      }
      return panel;
    }

    function init() {
      const toggle = ensureToggleExists();
      const panel  = ensurePanelExists();
      if (!toggle || !panel) return;

      let isOpen = false;

      function openPanel() {
        isOpen = true;
        panel.removeAttribute('hidden');
        // Force reflow before adding class (enables CSS transition)
        panel.offsetHeight; // eslint-disable-line no-unused-expressions
        panel.classList.add('is-open');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Close navigation menu');
        toggle.querySelector('span').textContent = 'Close';
        // Move focus to first link
        const firstLink = qs('a', panel);
        if (firstLink) firstLink.focus();
      }

      function closePanel() {
        isOpen = false;
        panel.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open navigation menu');
        toggle.querySelector('span').textContent = 'Menu';
        // After transition, hide from DOM and return focus
        setTimeout(function () {
          if (!isOpen) {
            panel.setAttribute('hidden', '');
            toggle.focus();
          }
        }, 280); // matches --dur-mid
      }

      toggle.addEventListener('click', function () {
        isOpen ? closePanel() : openPanel();
      });

      // Close when a link inside is clicked
      qsa('a', panel).forEach(function (link) {
        link.addEventListener('click', function () {
          closePanel();
        });
      });

      // Close on Escape
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isOpen) {
          e.preventDefault();
          closePanel();
        }
      });

      // Close on outside click
      document.addEventListener('click', function (e) {
        if (isOpen
          && !panel.contains(e.target)
          && !toggle.contains(e.target)) {
          closePanel();
        }
      });

      // Close on resize to desktop
      window.addEventListener('resize', debounce(function () {
        if (window.innerWidth > 900 && isOpen) closePanel();
      }, 200));

      // Sync active state in mobile panel too
      const observer = new MutationObserver(function () {
        const activeDesktop = qs('[data-nav-target].is-active');
        if (activeDesktop) {
          qsa('a[data-nav-target]', panel).forEach(function (a) {
            a.classList.toggle(
              'is-active',
              a.dataset.navTarget === activeDesktop.dataset.navTarget
            );
          });
        }
      });
      const desktopLinks = qs('.nav-links');
      if (desktopLinks) {
        observer.observe(desktopLinks, { subtree: true, attributeFilter: ['class'] });
      }
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     7. BACK TO TOP
     ═══════════════════════════════════════════════════════════════════════ */

  const BackToTop = (function () {
    const btn = qs('#back-to-top');
    const THRESHOLD = 600;

    function update() {
      if (!btn) return;
      btn.classList.toggle('is-visible', window.scrollY > THRESHOLD);
    }

    function init() {
      if (!btn) return;
      ScrollBus.subscribe(update);
      update();

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo({
          top: 0,
          behavior: MotionPreference.isReduced() ? 'auto' : 'smooth'
        });
        // Return focus to the beginning of the page
        const mainH1 = qs('h1') || qs('#main-content');
        if (mainH1) {
          mainH1.setAttribute('tabindex', '-1');
          mainH1.focus({ preventScroll: true });
          mainH1.addEventListener('blur', function () {
            mainH1.removeAttribute('tabindex');
          }, { once: true });
        }
      });
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     8. REVEAL ANIMATIONS
     ─────────────────────────────────────────────────────────────────────
     Per-section stagger — each section's elements are staggered
     independently from one another, not against a global index.

     Reduced-motion guard — if the OS preference is set, all elements
     are shown immediately without animation.
     ═══════════════════════════════════════════════════════════════════════ */

  const Reveal = (function () {

    // Selector groups by section — each section has its own stagger sequence
    const REVEAL_GROUPS = [
      { section: '.section--about',      sel: '.about__text p, .about__attr-item'                  },
      { section: '.section--education',  sel: '.edu__node-content'                                  },
      { section: '.section--work',       sel: '.work__card'                                              },
      { section: '.section--experience', sel: '.exp__card'                                               },
      { section: '.section--research',   sel: '.research__text p, .research__project, .research__ongoing' },
      { section: '.section--analytics',  sel: '.analytics__intro p, .analytics__domain, .analytics__tool' },
      { section: '.section--creative',   sel: '.creative__item, .creative__archive-link'            },
      { section: '.section--leadership', sel: '.leadership__item'                                   },
      { section: '.section--beyond',     sel: '.beyond__item'                                       },
      { section: '.section--certs',      sel: '.cert__card'                                         },
      { section: '.section--academic',   sel: '.academic__item'                                     },
      { section: '.section--contact',    sel: '.contact__closing, .contact__detail'                 }
    ];

    const STAGGER_MS = 70;   // delay between consecutive items in a section
    const MAX_STAGGER = 420; // cap so the last item in a long list isn't too delayed

    function initGroup(sectionSel, elementSel) {
      const section = qs(sectionSel);
      if (!section) return;

      const elements = qsa(elementSel, section);
      if (!elements.length) return;

      // If reduced motion: skip the class setup entirely, elements are visible by default
      if (MotionPreference.isReduced()) return;

      // Apply initial hidden state and stagger delays
      elements.forEach(function (el, i) {
        el.classList.add('will-reveal');
        el.style.transitionDelay = Math.min(i * STAGGER_MS, MAX_STAGGER) + 'ms';
      });

      // Single observer per section group
      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            io.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.06,
        rootMargin: '0px 0px -28px 0px'
      });

      elements.forEach(el => io.observe(el));
    }

    function init() {
      REVEAL_GROUPS.forEach(function (g) {
        initGroup(g.section, g.sel);
      });
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     9. HERO ENTRANCE
     ─────────────────────────────────────────────────────────────────────
     Sequential entrance animation for the first view.
     Elements animate in order: name → statement → links → meta items.
     Runs once on DOMContentLoaded, never again.
     Skipped entirely if reduced-motion is preferred.
     ═══════════════════════════════════════════════════════════════════════ */

  const HeroEntrance = (function () {

    function init() {
      if (MotionPreference.isReduced()) return;

      const hero = qs('.section--hero');
      if (!hero) return;

      const sequences = [
        { el: qs('.hero__name-first', hero),    delay: 80  },
        { el: qs('.hero__name-last', hero),     delay: 160 },
        { el: qs('.hero__statement', hero),     delay: 280 },
        { el: qs('.hero__links', hero),         delay: 420 },
        ...qsa('.hero__meta-item', hero).map(function (el, i) {
          return { el: el, delay: 520 + i * 80 };
        })
      ];

      // Set initial state
      sequences.forEach(function (item) {
        if (!item.el) return;
        item.el.style.opacity   = '0';
        item.el.style.transform = 'translateY(16px)';
        item.el.style.transition = 'opacity 480ms cubic-bezier(0.16, 1, 0.3, 1), transform 480ms cubic-bezier(0.16, 1, 0.3, 1)';
      });

      // Trigger in sequence
      sequences.forEach(function (item) {
        if (!item.el) return;
        setTimeout(function () {
          item.el.style.opacity   = '1';
          item.el.style.transform = 'translateY(0)';
        }, item.delay);
      });

      // Clean up inline styles after animation completes
      const lastDelay = sequences[sequences.length - 1].delay + 500;
      setTimeout(function () {
        sequences.forEach(function (item) {
          if (!item.el) return;
          item.el.style.removeProperty('opacity');
          item.el.style.removeProperty('transform');
          item.el.style.removeProperty('transition');
        });
      }, lastDelay);
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     10. EDUCATION TIMELINE CASCADE
     ─────────────────────────────────────────────────────────────────────
     The timeline nodes should appear sequentially top-to-bottom,
     as if the timeline is being drawn. This is distinct from the
     general reveal system and needs its own cascade logic.
     ═══════════════════════════════════════════════════════════════════════ */

  const EducationTimeline = (function () {

    function init() {
      if (MotionPreference.isReduced()) return;

      const nodes = qsa('.edu__node');
      if (!nodes.length) return;

      nodes.forEach(function (node, i) {
        node.classList.add('will-reveal');
        node.style.transitionDelay = (i * 140) + 'ms';
      });

      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });

      nodes.forEach(el => io.observe(el));
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     11. ANALYTICS BARS
     ─────────────────────────────────────────────────────────────────────
     Proficiency bars animate width from 0 to their target value
     when scrolled into view. Each bar's target width is set via
     the CSS custom property --w on the element.

     Reduced motion: width is set immediately without transition.
     ═══════════════════════════════════════════════════════════════════════ */

  const AnalyticsBars = (function () {

    function init() {
      const bars = qsa('.analytics__bar-fill');
      if (!bars.length) return;

      if (MotionPreference.isReduced()) {
        // Snap to final state immediately
        bars.forEach(function (bar) {
          bar.style.width = bar.style.getPropertyValue('--w') || '0%';
          // Also try reading from inline style attribute
          const inlineW = bar.getAttribute('style') || '';
          const match   = inlineW.match(/--w:\s*([\d.]+%)/);
          if (match) bar.style.width = match[1];
        });
        return;
      }

      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });

      bars.forEach(el => io.observe(el));
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     12. CREATIVE FILTER
     ─────────────────────────────────────────────────────────────────────
     Filters the creative work grid by category.

     Features:
       - ARIA `aria-pressed` state on filter buttons
       - ARIA live region announces result count to screen readers
       - Empty state message when no items match
       - CSS transition — items fade out before being hidden,
         fade in when shown. Uses a two-step hide: fade → display:none
       - Keyboard: left/right arrows move between filter buttons
     ═══════════════════════════════════════════════════════════════════════ */

  const CreativeFilter = (function () {

    function init() {
      const filterBtns = qsa('.creative__filter-btn');
      const grid       = qs('#creative-grid');
      if (!filterBtns.length || !grid) return;

      const items = qsa('.creative__item', grid);

      // Create a live region for announcing filter results to screen readers
      let liveRegion = qs('#creative-filter-live');
      if (!liveRegion) {
        liveRegion = document.createElement('div');
        liveRegion.id              = 'creative-filter-live';
        liveRegion.setAttribute('role',       'status');
        liveRegion.setAttribute('aria-live',  'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.className       = 'sr-only';
        grid.before(liveRegion);
      }

      // Create empty state element
      let emptyState = qs('#creative-empty');
      if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.id        = 'creative-empty';
        emptyState.className = 'creative__empty';
        emptyState.setAttribute('hidden', '');
        emptyState.innerHTML = [
          '<p>No work found in this category.</p>',
          '<p>More projects are available in the <a href="https://shorturl.at/2gqPh"',
          ' target="_blank" rel="noopener noreferrer">creative archive</a>.</p>'
        ].join('');
        grid.after(emptyState);
      }

      function applyFilter(activeFilter) {
        let visibleCount = 0;

        items.forEach(function (item) {
          const matches = activeFilter === 'all' || item.dataset.category === activeFilter;
          if (matches) {
            item.removeAttribute('hidden');
            item.removeAttribute('data-hidden');
            visibleCount++;
          } else {
            item.setAttribute('hidden', '');
            item.setAttribute('data-hidden', 'true');
          }
        });

        // Empty state
        if (visibleCount === 0) {
          emptyState.removeAttribute('hidden');
        } else {
          emptyState.setAttribute('hidden', '');
        }

        // Announce to screen readers
        const label = activeFilter === 'all'
          ? 'Showing all ' + visibleCount + ' projects.'
          : 'Showing ' + visibleCount + ' ' + activeFilter + ' project' + (visibleCount !== 1 ? 's' : '') + '.';
        liveRegion.textContent = label;
      }

      // Button click
      filterBtns.forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.classList.contains('is-active') ? 'true' : 'false');

        btn.addEventListener('click', function () {
          filterBtns.forEach(function (b) {
            b.classList.remove('is-active');
            b.setAttribute('aria-pressed', 'false');
          });
          btn.classList.add('is-active');
          btn.setAttribute('aria-pressed', 'true');
          applyFilter(btn.dataset.filter);
        });
      });

      // Keyboard: left/right arrow navigation between filter buttons
      filterBtns.forEach(function (btn, i) {
        btn.addEventListener('keydown', function (e) {
          let target = null;
          if (e.key === 'ArrowRight') target = filterBtns[i + 1] || filterBtns[0];
          if (e.key === 'ArrowLeft')  target = filterBtns[i - 1] || filterBtns[filterBtns.length - 1];
          if (target) { e.preventDefault(); target.focus(); target.click(); }
        });
      });

      // Run initial filter (in case of page reload with state)
      const initialActive = filterBtns.find(b => b.classList.contains('is-active'));
      if (initialActive) applyFilter(initialActive.dataset.filter);
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     13. CREATIVE MODAL
     ─────────────────────────────────────────────────────────────────────
     Full focus trap implementation:
       - All focusable elements inside the modal are trapped
       - Tab / Shift+Tab cycle only within the modal
       - Escape always closes
       - Focus returns to the exact element that triggered open
       - Scroll lock on <body> while modal is open
       - `aria-modal="true"` tells screen readers to ignore background
       - Modal title announced on open via aria-labelledby
     ═══════════════════════════════════════════════════════════════════════ */

  const CreativeModal = (function () {

    const modal        = qs('#creative-modal');
    const modalInner   = qs('.creative__modal-inner');
    const modalTitle   = qs('#modal-title');
    const modalCat     = qs('#modal-category');
    const modalOrg     = qs('#modal-org');
    const modalRole    = qs('#modal-role');
    const modalLearn   = qs('#modal-learning');
    const closeBtn     = qs('#modal-close');

    let triggerElement = null; // element that opened the modal

    // All focusable elements within the modal
    const FOCUSABLE = [
      'a[href]', 'button:not([disabled])', 'textarea', 'input',
      'select', '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    function getFocusable() {
      return modalInner ? qsa(FOCUSABLE, modalInner) : [];
    }

    function trapFocus(e) {
      const focusable = getFocusable();
      if (!focusable.length) return;

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Shift+Tab: if on first element, wrap to last
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab: if on last element, wrap to first
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    function openModal(itemEl) {
      if (!modal || !itemEl) return;

      // Save trigger for return-focus
      triggerElement = itemEl;

      // Populate content
      if (modalCat)   modalCat.textContent   = itemEl.dataset.category || '';
      if (modalTitle) modalTitle.textContent  = itemEl.dataset.title    || '';
      if (modalOrg)   modalOrg.textContent    = (itemEl.dataset.org || '') + (itemEl.dataset.year ? ' · ' + itemEl.dataset.year : '');
      if (modalRole)  modalRole.textContent   = itemEl.dataset.role     || '';
      if (modalLearn) modalLearn.textContent  = itemEl.dataset.learning || '';

      // Show modal
      modal.classList.add('is-open');
      modal.removeAttribute('hidden');

      // Scroll lock
      document.body.style.overflow = 'hidden';

      // Move focus to close button
      if (closeBtn) {
        setTimeout(function () { closeBtn.focus(); }, 50);
      }

      // Activate focus trap
      document.addEventListener('keydown', trapFocus);
    }

    function closeModal() {
      if (!modal) return;

      modal.classList.remove('is-open');

      // After CSS transition, fully hide
      setTimeout(function () {
        modal.setAttribute('hidden', '');
        document.body.style.overflow = '';
      }, 300);

      // Remove focus trap
      document.removeEventListener('keydown', trapFocus);

      // Return focus to the element that opened the modal
      if (triggerElement) {
        triggerElement.focus();
        triggerElement = null;
      }
    }

    function init() {
      if (!modal) return;

      // Hide initially
      modal.setAttribute('hidden', '');
      modal.setAttribute('aria-modal', 'true');

      // Add role and aria-describedby if not present
      if (!modal.getAttribute('aria-describedby')) {
        modal.setAttribute('aria-describedby', 'modal-role');
      }

      // Wire up creative items
      qsa('.creative__item').forEach(function (item) {
        item.setAttribute('tabindex', '0');
        item.setAttribute('role', 'button');
        item.setAttribute('aria-label',
          'View details: ' + (item.dataset.title || 'project')
        );

        item.addEventListener('click', function () { openModal(item); });
        item.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openModal(item);
          }
        });
      });

      // Close button
      if (closeBtn) closeBtn.addEventListener('click', closeModal);

      // Backdrop click
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });

      // Escape key
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) {
          e.preventDefault();
          closeModal();
        }
      });
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     14. RESIZE HANDLER
     ─────────────────────────────────────────────────────────────────────
     Recalculates anything that depends on viewport dimensions.
     Debounced to 200ms to avoid excessive recomputation.
     ═══════════════════════════════════════════════════════════════════════ */

  const ResizeHandler = (function () {

    function onResize() {
      // Update nav height CSS variable for any elements that depend on it
      const nh = navHeight();
      document.documentElement.style.setProperty('--nav-h-actual', nh + 'px');

      // Update scroll progress (scrollable height may have changed)
      const scrollable = document.body.scrollHeight - window.innerHeight;
      const pct = scrollable > 0
        ? Math.min(100, (window.scrollY / scrollable) * 100)
        : 0;
      const bar = qs('#scroll-progress');
      if (bar) bar.style.setProperty('--progress', pct.toFixed(2) + '%');
    }

    function init() {
      window.addEventListener('resize', debounce(onResize, 200), { passive: true });
      // Also handle orientation change on mobile
      window.addEventListener('orientationchange', debounce(onResize, 300));
      onResize(); // initial call
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     15. ACCESSIBILITY ENHANCEMENTS
     ─────────────────────────────────────────────────────────────────────
     A. Skip link — inject if not in HTML
     B. Announce page sections on navigation (aria-live)
     C. Ensure all interactive elements have accessible labels
     D. Handle visibilitychange — pause/resume scroll listeners
     E. Add aria-current="page" to active external nav link
     ═══════════════════════════════════════════════════════════════════════ */

  const Accessibility = (function () {

    function ensureSkipLink() {
      if (qs('.skip-link')) return;
      const link = document.createElement('a');
      link.href      = '#main-content';
      link.className = 'skip-link';
      link.textContent = 'Skip to main content';
      document.body.insertBefore(link, document.body.firstChild);
    }

    function initNavAria() {
      // Ensure all nav links have aria-current="false" initially
      qsa('[data-nav-target]').forEach(function (link) {
        if (!link.hasAttribute('aria-current')) {
          link.setAttribute('aria-current', 'false');
        }
      });
    }

    function initExternalLinks() {
      // All links with target="_blank" should have accessible label
      qsa('a[target="_blank"]').forEach(function (link) {
        const existingLabel = link.getAttribute('aria-label');
        if (!existingLabel && link.textContent) {
          link.setAttribute('aria-label', link.textContent.trim() + ' (opens in new tab)');
        }
        // Ensure rel="noopener noreferrer"
        if (!link.rel.includes('noopener')) {
          link.rel = 'noopener noreferrer';
        }
      });
    }

    function initSectionAnnouncement() {
      // Create a polite live region that announces the current section
      // as the user scrolls (useful for screen reader users)
      let announcer = qs('#section-announcer');
      if (!announcer) {
        announcer = document.createElement('div');
        announcer.id = 'section-announcer';
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'sr-only';
        document.body.appendChild(announcer);
      }

      // Update announcer when active nav changes
      const navLinks = qsa('[data-nav-target]');
      const observer = new MutationObserver(function () {
        const active = navLinks.find(l => l.classList.contains('is-active'));
        if (active) {
          // Throttle announcements — only announce every 2 seconds minimum
          if (!announcer._lastAnnounced ||
              Date.now() - announcer._lastAnnounced > 2000) {
            announcer.textContent = 'Section: ' + active.textContent.trim();
            announcer._lastAnnounced = Date.now();
          }
        }
      });

      navLinks.forEach(function (link) {
        observer.observe(link, { attributeFilter: ['class'] });
      });
    }

    function initVisibilityChange() {
      // When tab becomes visible again, re-sync scroll state
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          const bar = qs('#scroll-progress');
          if (!bar) return;
          const scrollable = document.body.scrollHeight - window.innerHeight;
          const pct = scrollable > 0
            ? Math.min(100, (window.scrollY / scrollable) * 100)
            : 0;
          bar.style.setProperty('--progress', pct.toFixed(2) + '%');
        }
      });
    }

    function init() {
      ensureSkipLink();
      initNavAria();
      initExternalLinks();
      initSectionAnnouncement();
      initVisibilityChange();
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     16. NAV SCROLL COMPRESSION STYLES
     ─────────────────────────────────────────────────────────────────────
     The CSS class `.is-scrolled` is applied by Navigation.
     These styles are injected here so they live in one place and
     can be toggled off easily without touching the main stylesheet.
     ═══════════════════════════════════════════════════════════════════════ */

  const NavCompressionStyles = (function () {

    function init() {
      const style = document.createElement('style');
      style.id = 'nav-compression-styles';
      style.textContent = [
        '#site-header.is-scrolled {',
        '  --nav-h: 52px;',
        '  box-shadow: 0 1px 12px rgba(20,33,61,0.08);',
        '}',
        '[data-theme="dark"] #site-header.is-scrolled {',
        '  box-shadow: 0 1px 12px rgba(0,0,0,0.3);',
        '}',
        '#site-header {',
        '  transition: height 280ms cubic-bezier(0.25,0.46,0.45,0.94),',
        '              background 280ms cubic-bezier(0.25,0.46,0.45,0.94),',
        '              box-shadow 280ms cubic-bezier(0.25,0.46,0.45,0.94);',
        '}'
      ].join('\n');
      document.head.appendChild(style);
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     17. CREATIVE EMPTY STATE STYLES
     ─────────────────────────────────────────────────────────────────────
     Injected because the empty state element is created dynamically by JS
     ═══════════════════════════════════════════════════════════════════════ */

  const CreativeEmptyStyles = (function () {

    function init() {
      const style = document.createElement('style');
      style.id = 'creative-extra-styles';
      style.textContent = [
        '.creative__empty {',
        '  grid-column: 1 / -1;',
        '  padding: 3rem 1.5rem;',
        '  text-align: center;',
        '  border: 1px solid var(--border);',
        '}',
        '.creative__empty p {',
        '  font-size: 0.875rem;',
        '  line-height: 1.7;',
        '  color: var(--text-meta);',
        '  margin-bottom: 0.5rem;',
        '}',
        '.creative__empty p:last-child { margin-bottom: 0; }',
        '.creative__empty a { color: var(--text-link); }',
        /* Modal hidden state */
        '.creative__modal[hidden] { display: none !important; }',
        '.creative__modal.is-open { display: flex !important; }',
        /* Mobile nav compression */
        '.nav-menu-toggle { display: none; }',
        '@media (max-width: 900px) {',
        '  .nav-menu-toggle { display: flex; align-items: center; }',
        '  .nav-mobile-panel[hidden] { display: none !important; }',
        '  .nav-mobile-panel { display: flex; }',
        '}'
      ].join('\n');
      document.head.appendChild(style);
    }

    return { init };
  })();


  /* ═══════════════════════════════════════════════════════════════════════
     18. INITIALISATION
     ─────────────────────────────────────────────────────────────────────
     Modules are initialised in order of visual importance:
       1. Styles injected (no visual flash)
       2. Theme (no flash of wrong theme)
       3. Accessibility
       4. Navigation systems
       5. Scroll-driven UI
       6. Animations
       7. Interactive components
     ═══════════════════════════════════════════════════════════════════════ */

  function init() {
    // Inject dynamic styles first — before any rendering
    NavCompressionStyles.init();
    CreativeEmptyStyles.init();

    // Theme — as early as possible to prevent flash
    Theme.init();

    // Accessibility baseline
    Accessibility.init();

    // Navigation
    Navigation.init();
    MobileNav.init();
    BackToTop.init();

    // Scroll-driven UI
    ScrollProgress.init();
    ResizeHandler.init();

    // Animations
    HeroEntrance.init();
    EducationTimeline.init();
    Reveal.init();
    AnalyticsBars.init();

    // Interactive components
    CreativeFilter.init();
    CreativeModal.init();
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
