import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/all';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import Lenis from 'lenis';
import Swiper from 'swiper';
import { Pagination } from 'swiper/modules';

gsap.registerPlugin(ScrollTrigger, SplitText, InertiaPlugin);


/* ==========================================================================
   Attribute reference (set these in Webflow)
   --------------------------------------------------------------------------
   data-anim-load="lines | words | fade | children-fade"   runs once on load
   data-anim-load-delay="0.2"                              extra delay, seconds
   data-fouc-prevent                                       opt out of the unhide

   data-anim-scroll="lines | words | fade | children-fade" runs on entry

   data-split="chars | words | lines | rich-lines"         needed for lines/words anims

   data-parallax="trigger"                                 drives the scroll range
   data-parallax="target"                                  optional child to move
   data-parallax-direction="vertical | horizontal"
   data-parallax-start / -end="20 / -20"                   travel in %
   data-parallax-scroll-start / -scroll-end="top bottom"
   data-parallax-scrub="true | 0.5"
   data-parallax-disable="mobile | mobileLandscape | tablet"
   ========================================================================== */

/* ==========================================================================
   Smooth scroll (Lenis)
   ========================================================================== */

// Top-level so it's accessible throughout the file
let lenis = null;

// Runs Lenis only where there's a real cursor — matchMedia boots it on
// (pointer: fine) and runs the returned cleanup if that ever stops matching.
// Driving it from gsap.ticker keeps Lenis and ScrollTrigger on one clock.
function initLenis() {
  gsap.matchMedia().add('(pointer: fine)', () => {
    lenis = new Lenis();
    lenis.on('scroll', ScrollTrigger.update);

    const raf = (time) => lenis.raf(time * 1000); // seconds → milliseconds
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(500, 33); // restore GSAP default
      lenis.destroy();
      lenis = null;
      ScrollTrigger.refresh();
    };
  });
}

/* ==========================================================================
   FOUC prevention
   ========================================================================== */

// Load-animated elements start hidden in CSS; this reveals them once fonts
// are ready so nothing flashes in its untweened state first.
// data-fouc-prevent opts an element out (handle its reveal yourself).
function initFOUC() {
  const loadEls = document.querySelectorAll("[data-anim-load]");
  loadEls.forEach((el) => {
    if (el.hasAttribute("data-fouc-prevent")) {
      return;
    } else {
      gsap.set(el, {
        visibility: "visible",
      });
    }
  });
  ScrollTrigger.refresh();
}

/* ==========================================================================
   Text splitting
   --------------------------------------------------------------------------
   The bridge between SplitText and the animation modules below: split the
   text, announce the fresh chars/words/lines on a `splitReady` event, and let
   listeners hand their tweens back so GSAP rebuilds them on every resplit.
   ========================================================================== */

function initTextSplit() {
  const animMap = new WeakMap();

  // Runs on every split, including autoSplit resizes: kill the element's
  // previous tweens, broadcast the new lines/words/chars, then return what the
  // listeners registered so SplitText can revert it before the next split.
  function handleSplit(el, self) {
    const prev = animMap.get(el);
    if (prev) prev.forEach((anim) => anim.kill());

    const anims = [];
    animMap.set(el, anims);

    el.dispatchEvent(
      new CustomEvent("splitReady", {
        detail: {
          lines: self.lines,
          words: self.words,
          chars: self.chars,
          register(anim) {
            anims.push(anim)
          },
        },
      })
    );

    if (!anims.length) return;
    if (anims.length === 1) return anims[0];
    const tl = gsap.timeline();
    anims.forEach((a) => tl.add(a, 0));
    return tl;
  }

  // One config per data-split value. Every variant also splits to lines so
  // masking has something to clip against, and autoSplit re-runs on resize.
  const splitConfig = {
    chars: {
      type: "chars, lines",
      mask: "chars",
      charsClass: "char",
      linesClass: "line",
      autoSplit: true,
    },
    words: {
      type: "words, lines",
      mask: "lines",
      wordsClass: "word",
      linesClass: "line",
      autoSplit: true,
    },
    lines: {
      type: "lines",
      mask: "lines",
      linesClass: "line-mask",
      autoSplit: true,
    },
    "rich-lines": {
      type: "lines",
      mask: "lines",
      linesClass: "line-mask",
      autoSplit: true,
    },
  };

  Object.entries(splitConfig).forEach(([key, config]) => {
    document.querySelectorAll(`[data-split="${key}"]`).forEach((el) => {
      // rich-lines splits each child on its own so nested markup survives
      const target = key === "rich-lines" ? [...el.children] : el;

      SplitText.create(target, {
        ...config,
        onSplit(self) {
          return handleSplit(el, self);
        },
      });
    });
  });
}

/* ==========================================================================
   Load animations
   --------------------------------------------------------------------------
   Fire once on page load. Split variants wait for `splitReady` and register
   their tween; the rest tween immediately. All honour data-anim-load-delay.
   ========================================================================== */

function initLoadAnimations() {
  const globalLoadDelay = 0;

  // Words rise into place behind their line masks, staggered left to right
  document.querySelectorAll("[data-anim-load=words]").forEach((el) => {
    const delay = parseFloat(el.getAttribute("data-anim-load-delay")) || 0;
    el.addEventListener("splitReady", (e) => {
      const { words, register } = e.detail;
      if (!words?.length) return;

      const tween = gsap.from(words, {
        delay: globalLoadDelay + delay,
        yPercent: 115,
        duration: 1,
        stagger: 0.075,
        ease: "power3.out",
      });
      register(tween);
    });
  });

  // Lines rise into place behind their masks, staggered top to bottom
  document.querySelectorAll("[data-anim-load=lines]").forEach((el) => {
    const delay = parseFloat(el.getAttribute("data-anim-load-delay")) || 0;
    el.addEventListener("splitReady", (e) => {
      const { lines, register } = e.detail;
      if (!lines?.length) return;

      const tween = gsap.from(lines, {
        delay: globalLoadDelay + delay,
        opacity: 0,
        yPercent: 112,
        duration: 1.125,
        stagger: 0.075,
        ease: "expo.out",
      });
      register(tween);
    });
  });

  // Plain opacity fade for anything that shouldn't move
  document.querySelectorAll("[data-anim-load=fade]").forEach((el) => {
    const delay = parseFloat(el.getAttribute("data-anim-load-delay")) || 0;
    gsap.from(el, {
      opacity: 0,
            y: "3rem",
      duration: 1,
      ease: "expo.out",
      delay: globalLoadDelay + delay,
    })
  })

  // Fades the element's direct children in one after another
  document.querySelectorAll("[data-anim-load=children-fade]").forEach((el) => {
    const delay = parseFloat(el.getAttribute("data-anim-load-delay")) || 0;
    gsap.from(el.children, {
      opacity: 0,
            y: "3rem",
      duration: 1.5,
      stagger: {
        each: 0.075,
      },
      ease: "expo.out",
      delay: globalLoadDelay + delay,
    })
  })
}

/* ==========================================================================
   Scroll animations
   --------------------------------------------------------------------------
   Same vocabulary as the load animations, triggered on entry instead.
   toggleActions "none play none reset" plays once forward, then re-arms only
   after the element has scrolled back past the top of the viewport.
   ========================================================================== */

function initScrollAnimations() {

  // Words rise in as the element enters the viewport
  document.querySelectorAll("[data-anim-scroll=words]").forEach((el) => {
    el.addEventListener("splitReady", (e) => {
      const { words, register } = e.detail;
      if (!words?.length) return;

      const tween = gsap.from(words, {
        yPercent: 115,
        duration: 1,
        stagger: 0.075,
        ease: "power3.out",
        scrollTrigger: {
          trigger: el,
          start: "top bottom",
          end: "top 90%",
          toggleActions: "none play none reset",
        },
      });
      register(tween);
    });
  });

  // Lines rise in as the element enters the viewport
  document.querySelectorAll("[data-anim-scroll=lines]").forEach((el) => {
    el.addEventListener("splitReady", (e) => {
      const { lines, register } = e.detail;
      if (!lines?.length) return;

      const tween = gsap.from(lines, {
        opacity: 0,
        yPercent: 112,
        duration: 1.125,
        stagger: 0.075,
        ease: "expo.out",
        scrollTrigger: {
          trigger: el,
          start: "top bottom",
          end: "top 90%",
          toggleActions: "none play none reset",
        },
      });
      register(tween);
    });
  });

  // Staggers a list, grid or card row in as the container enters
  document.querySelectorAll("[data-anim-scroll=children-fade]").forEach((el) => {
    const children = el.children;
    const childTargets = el.querySelectorAll("[data-anim-target]");
    const animTargets = childTargets ? childTargets : children;

    gsap.from(children, {
      opacity: 0,
            y: "3rem",
      duration: 1.66,
      ease: "expo.out",
      stagger: {
        each: 0.075,
      },
      scrollTrigger: {
        trigger: el,
        start: "top bottom",
        end: "top 80%",
        toggleActions: "none play none reset",
      },
    });
  });

  // Single element fades in on entry
  document.querySelectorAll("[data-anim-scroll=fade]").forEach((el) => {
    gsap.from(el, {
      y: "3rem",
      opacity: 0,
      duration: 1.66,
      ease: "expo.out",
      scrollTrigger: {
        trigger: el,
        start: "top bottom",
        end: "top 80%",
        toggleActions: "none play none reset",
      },
    });
  });
}

/* ==========================================================================
   Parallax
   ========================================================================== */

// Reads every data-parallax attribute off the trigger to build one scrubbed
// tween, wrapped in matchMedia so breakpoint opt-outs and cleanup on resize
// are handled for you. Defaults (20% → -20%, top bottom → bottom top) suit most.
function initGlobalParallax() {
  const mm = gsap.matchMedia()

  mm.add(
    {
      isMobile: "(max-width:479px)",
      isMobileLandscape: "(max-width:767px)",
      isTablet: "(max-width:991px)",
      isDesktop: "(min-width:992px)"
    },
    (context) => {
      const { isMobile, isMobileLandscape, isTablet } = context.conditions

      const ctx = gsap.context(() => {
        document.querySelectorAll('[data-parallax="trigger"]').forEach((trigger) => {
          // Check if this trigger has to be disabled on smaller breakpoints
          const disable = trigger.getAttribute("data-parallax-disable")
          if (
            (disable === "mobile" && isMobile) ||
            (disable === "mobileLandscape" && isMobileLandscape) ||
            (disable === "tablet" && isTablet)
          ) {
            return
          }

          // Optional: you can target an element inside a trigger if necessary
          const target = trigger.querySelector('[data-parallax="target"]') || trigger

          // Get the direction value to decide between xPercent or yPercent tween
          const direction = trigger.getAttribute("data-parallax-direction") || "vertical"
          const prop = direction === "horizontal" ? "xPercent" : "yPercent"

          // Get the scrub value, our default is 'true' because that feels nice with Lenis
          const scrubAttr = trigger.getAttribute("data-parallax-scrub")
          const scrub = scrubAttr ? parseFloat(scrubAttr) : true

          // Get the start position in %
          const startAttr = trigger.getAttribute("data-parallax-start")
          const startVal = startAttr !== null ? parseFloat(startAttr) : 20

          // Get the end position in %
          const endAttr = trigger.getAttribute("data-parallax-end")
          const endVal = endAttr !== null ? parseFloat(endAttr) : -20

          // Get the start value of the ScrollTrigger
          const scrollStartRaw = trigger.getAttribute("data-parallax-scroll-start") || "top bottom"
          const scrollStart = `clamp(${scrollStartRaw})`

          // Get the end value of the ScrollTrigger
          const scrollEndRaw = trigger.getAttribute("data-parallax-scroll-end") || "bottom top"
          const scrollEnd = `clamp(${scrollEndRaw})`

          gsap.fromTo(
            target,
            { [prop]: startVal },
            {
              [prop]: endVal,
              ease: "none",
              scrollTrigger: {
                trigger,
                start: scrollStart,
                end: scrollEnd,
                scrub,
              },
            }
          )
        })
      })

      return () => ctx.revert()
    }
  )
}

  function initMegaNavDirectionalHover() {
  const DUR = {
  bgMorph: 0.4, // container height morph between panels
  contentIn: 0.3, // fade items appearing
  contentOut: 0.2, // fade items disappearing
  stagger: 0.25, // total stagger spread across all fade items
  backdropIn: 0.1, // backdrop fade in
  backdropOut: 0.2, // backdrop fade out
  openScale: 0.35, // initial container open from 0
  closeScale: 0.25, // container close to 0
  };
  
  const HOVER_ENTER = 120;
  const HOVER_LEAVE = 300;

  // DOM references
  const menuWrap = document.querySelector("[data-menu-wrap]");
  const navList = document.querySelector("[data-nav-list]");
  const dropWrapper = document.querySelector("[data-dropdown-wrapper]");
  const dropContainer = document.querySelector("[data-dropdown-container]");
  const dropBg = document.querySelector("[data-dropdown-bg]");
  const backdrop = document.querySelector("[data-menu-backdrop]");
  const toggles = [...document.querySelectorAll("[data-dropdown-toggle]")];
  const panels = [...document.querySelectorAll("[data-nav-content]")];
  const burger = document.querySelector("[data-burger-toggle]");
  const backBtn = document.querySelector("[data-mobile-back]");
  const logo = document.querySelector("[data-menu-logo]");
  const [lineTop, lineMid, lineBot] = ["top", "mid", "bot"].map(
    (id) => document.querySelector(`[data-burger-line='${id}']`)
  );

  // Flag the nav once the page leaves the top, clear it when back at the top
  const navContainer = document.querySelector("[data-nav-container]");
  if (navContainer) {
    ScrollTrigger.create({
      onUpdate: (self) => navContainer.classList.toggle("is-scrolled", self.scroll() > 128),
    });
  }

  // State
  const state = {
    isOpen: false,
    activePanel: null,
    activePanelIndex: -1,
    isMobile: window.innerWidth <= 991,
    mobileMenuOpen: false,
    mobilePanelActive: null,
    hoverTimer: null,
    leaveTimer: null,
    tl: null,
    mobileTl: null,
    mobilePanelTl: null,
  };

  // Helpers
  const getPanel = (name) => document.querySelector(`[data-nav-content="${name}"]`);
  const getToggle = (name) => document.querySelector(`[data-dropdown-toggle="${name}"]`);
  const getFade = (el) => el.querySelectorAll("[data-menu-fade]");
  const getNavItems = () => navList.querySelectorAll("[data-nav-list-item]");
  const getIndex = (name) => toggles.indexOf(getToggle(name));
  const stagger = (n) => (n <= 1 ? 0 : { amount: DUR.stagger });

  function clearTimers() {
    clearTimeout(state.hoverTimer);
    clearTimeout(state.leaveTimer);
    state.hoverTimer = state.leaveTimer = null;
  }

  function killTl(key) {
    if (state[key]) { state[key].kill(); state[key] = null; }
  }

  function killDropdown() {
    killTl("tl");
    gsap.killTweensOf(dropContainer);
    gsap.killTweensOf(backdrop);
    panels.forEach((p) => { gsap.killTweensOf(p); gsap.killTweensOf(getFade(p)); });
  }

  function killMobile() {
    killTl("mobileTl");
    gsap.killTweensOf([navList, lineTop, lineMid, lineBot]);
  }

  function killMobilePanel() {
    killTl("mobilePanelTl");
    gsap.killTweensOf(getNavItems());
    gsap.killTweensOf([backBtn, logo]);
    panels.forEach((p) => { gsap.killTweensOf(p); gsap.killTweensOf(getFade(p)); });
  }

  function resetToggles() {
    toggles.forEach((t) => t.setAttribute("aria-expanded", "false"));
  }

  function resetDesktop() {
    panels.forEach((p) => {
      gsap.set(p, { visibility:"hidden", opacity:0, pointerEvents:"none", x:0, y:0, xPercent:0 });
      gsap.set(getFade(p), { autoAlpha:0, x:0, y:0, xPercent:0 });
    });
  
    gsap.set(dropContainer, { height:0, clearProps:"transform" });
    gsap.set(backdrop, { autoAlpha:0 });
  
    menuWrap.setAttribute("data-menu-open", "false");
    resetToggles();
  }

  function setupMobile() {
    panels.forEach((p) => {
      gsap.set(p, { autoAlpha: 0, xPercent: 0, visibility: "visible", pointerEvents: "none" });
      gsap.set(getFade(p), { xPercent: 20, autoAlpha: 0 });
    });
    gsap.set(getNavItems(), { xPercent: 0, y: 0, autoAlpha: 1 });
    gsap.set(navList, { autoAlpha: 0, x: 0 });
    gsap.set(backBtn, { autoAlpha: 0 });
    gsap.set(logo, { autoAlpha: 1 });
    gsap.set(dropContainer, { clearProps: "height" });
    gsap.set(backdrop, { autoAlpha: 0 });
  }

  function measurePanel(name) {
    const el = getPanel(name);
    if (!el) return 0;
    const s = el.style;
    const prev = [s.visibility, s.opacity, s.pointerEvents];
    Object.assign(s, { visibility: "visible", opacity: "0", pointerEvents: "none" });
    const h = el.getBoundingClientRect().height;
    [s.visibility, s.opacity, s.pointerEvents] = prev;
    return h;
  }

  // DESKTOP — open dropdown (first open)
  function openDropdown(panelName) {
    if (state.isOpen && state.activePanel === panelName) return;
    if (state.isOpen) return switchPanel(state.activePanel, panelName);

    const height = measurePanel(panelName);
    if (!height) return;

    killDropdown();
    resetDesktop();

    const el = getPanel(panelName);
    const fade = getFade(el);
    const toggle = getToggle(panelName);

    state.isOpen = true;
    state.activePanel = panelName;
    state.activePanelIndex = getIndex(panelName);
    menuWrap.setAttribute("data-menu-open", "true");
    if (toggle) toggle.setAttribute("aria-expanded", "true");

    gsap.set(dropContainer, { height: 0 });

    const tl = gsap.timeline();
    state.tl = tl;
    tl.to(backdrop, { autoAlpha: 1, duration: DUR.backdropIn, ease: "power2.out" }, 0);
    tl.to(dropContainer, { height, duration: DUR.openScale, ease: "power3.out" }, 0);
    tl.set(el, { visibility: "visible", opacity: 1, pointerEvents: "auto" }, 0.05);
    if (fade.length) {
      tl.fromTo(fade,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: DUR.contentIn, stagger: stagger(fade.length), ease: "power3.out" },
        0.1
      );
    }
  }

  // DESKTOP — close dropdown
  function closeDropdown() {
    if (!state.isOpen) return;
    const el = getPanel(state.activePanel);
    const fade = el ? getFade(el) : [];

    killDropdown();

    const tl = gsap.timeline({
      onComplete() {
        state.isOpen = false;
        state.activePanel = null;
        state.activePanelIndex = -1;
        state.tl = null;
        resetDesktop();
      },
    });
    state.tl = tl;
    if (fade.length) tl.to(fade, { autoAlpha: 0, y: -4, duration: DUR.contentOut * 0.7, ease: "power2.in" }, 0);
    tl.to(dropContainer, { height: 0, duration: DUR.closeScale, ease: "power2.in" }, 0.05);
    tl.to(backdrop, { autoAlpha: 0, duration: DUR.backdropOut, ease: "power2.out" }, 0);
    if (el) tl.set(el, { visibility: "hidden", opacity: 0, pointerEvents: "none" });
  }

  // DESKTOP — switch panel (directional)
  function switchPanel(fromName, toName) {
    const dir = getIndex(toName) > getIndex(fromName) ? 1 : -1;
    const fromEl = getPanel(fromName), toEl = getPanel(toName);
    if (!fromEl || !toEl) return;

    const fromFade = getFade(fromEl), toFade = getFade(toEl);
    const toHeight = measurePanel(toName);
    if (!toHeight) return;

    killDropdown();

    // Reset all panels, then restore fromEl as visible
    panels.forEach((p) => {
      gsap.set(p, { visibility: "hidden", opacity: 0, pointerEvents: "none", xPercent: 0 });
      gsap.set(getFade(p), { autoAlpha: 0, x: 0, y: 0 });
    });
    gsap.set(fromEl, { visibility: "visible", opacity: 1, pointerEvents: "auto", x: 0 });
    if (fromFade.length) gsap.set(fromFade, { autoAlpha: 1, x: 0, y: 0 });
    gsap.set(backdrop, { autoAlpha: 1 });

    const toToggle = getToggle(toName);
    state.activePanel = toName;
    state.activePanelIndex = getIndex(toName);
    resetToggles();
    if (toToggle) toToggle.setAttribute("aria-expanded", "true");

    const xOut = dir * -30, xIn = dir * 30;
    const tl = gsap.timeline();
    state.tl = tl;

    if (fromFade.length) tl.to(fromFade, { autoAlpha: 0, x: xOut, duration: DUR.contentOut, ease: "power2.in" }, 0);
    tl.set(fromEl, { visibility: "hidden", opacity: 0, pointerEvents: "none", xPercent: 0 }, DUR.contentOut);
    if (fromFade.length) tl.set(fromFade, { x: 0 }, DUR.contentOut);
    tl.to(dropContainer, { height: toHeight, duration: DUR.bgMorph, ease: "power3.out" }, 0.05);
    tl.set(toEl, { visibility: "visible", opacity: 1, pointerEvents: "auto", xPercent: 0 }, DUR.contentOut * 0.5);
    if (toFade.length) {
      tl.fromTo(toFade,
        { autoAlpha: 0, x: xIn },
        { autoAlpha: 1, x: 0, duration: DUR.contentIn, stagger: stagger(toFade.length), ease: "power3.out" },
        DUR.contentOut * 0.6
      );
    }
  }

  // DESKTOP — hover intent
  function handleToggleEnter(e) {
    if (state.isMobile) return;
    const name = e.currentTarget.getAttribute("data-dropdown-toggle");
    if (!name) return;
    clearTimeout(state.leaveTimer); state.leaveTimer = null;
    clearTimeout(state.hoverTimer);
    state.hoverTimer = setTimeout(() => openDropdown(name), state.isOpen ? 0 : HOVER_ENTER);
  }

  function handleToggleLeave() {
    if (state.isMobile) return;
    clearTimeout(state.hoverTimer); state.hoverTimer = null;
    state.leaveTimer = setTimeout(closeDropdown, HOVER_LEAVE);
  }

  function handleWrapperEnter() {
    if (state.isMobile) return;
    clearTimeout(state.leaveTimer); state.leaveTimer = null;
  }

  function handleWrapperLeave() {
    if (state.isMobile) return;
    state.leaveTimer = setTimeout(closeDropdown, HOVER_LEAVE);
  }

  // DESKTOP — close behaviors
  function handleEscape(e) {
    if (e.key !== "Escape") return;
    if (state.isMobile) {
      state.mobilePanelActive ? closeMobilePanel() : state.mobileMenuOpen && closeMobileMenu();
      return;
    }
    if (state.isOpen) {
      const t = getToggle(state.activePanel);
      closeDropdown();
      if (t) t.focus();
    }
  }

  function handleDocClick(e) {
    if (state.isMobile || !state.isOpen) return;
    if (!e.target.closest("[data-menu-wrap]")) closeDropdown();
  }

  // DESKTOP — keyboard navigation
  function focusFirstLink(panelName) {
    setTimeout(() => {
      const el = getPanel(panelName);
      if (!el) return;
      const link = el.querySelector("a");
      if (!link) return;
      gsap.set(link, { visibility: "visible" });
      link.focus();
    }, 80);
  }

  function handleKeydownOnToggle(e) {
    if (state.isMobile) return;
    const name = e.currentTarget.getAttribute("data-dropdown-toggle");

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (state.isOpen && state.activePanel === name) closeDropdown();
      else { openDropdown(name); focusFirstLink(name); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!state.isOpen || state.activePanel !== name) openDropdown(name);
      focusFirstLink(name);
    }
    if (e.key === "Tab" && !e.shiftKey && state.isOpen && state.activePanel === name) {
      e.preventDefault();
      const link = getPanel(name)?.querySelector("a");
      if (link) link.focus();
    }
  }

  function handleKeydownInPanel(e) {
    if (state.isMobile || !state.isOpen) return;
    const el = getPanel(state.activePanel);
    if (!el) return;

    const links = [...el.querySelectorAll("a")];
    const idx = links.indexOf(document.activeElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      links[(idx + 1) % links.length].focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (idx <= 0) { const t = getToggle(state.activePanel); if (t) t.focus(); }
      else links[idx - 1].focus();
    }
    if (e.key === "Tab" && !e.shiftKey && idx === links.length - 1) {
      e.preventDefault();
      const curIdx = toggles.indexOf(getToggle(state.activePanel));
      const next = curIdx < toggles.length - 1 ? toggles[curIdx + 1] : null;
      closeDropdown();
      if (next) next.focus();
    }
    if (e.key === "Tab" && e.shiftKey && idx === 0) {
      e.preventDefault();
      const t = getToggle(state.activePanel);
      if (t) t.focus();
    }
  }

  // MOBILE — burger animation
  function animateBurger(toX) {
    const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
    if (toX) {
      tl.to(lineTop, { y: "0.3125em", duration: 0.15 }, 0);
      tl.to(lineBot, { y: "-0.3125em", duration: 0.15 }, 0);
      tl.to(lineMid, { autoAlpha: 0, duration: 0.1 }, 0.1);
      tl.to(lineTop, { rotation: 45, duration: 0.2 }, 0.15);
      tl.to(lineBot, { rotation: -45, duration: 0.2 }, 0.15);
    } else {
      tl.to(lineTop, { rotation: 0, duration: 0.2 }, 0);
      tl.to(lineBot, { rotation: 0, duration: 0.2 }, 0);
      tl.to(lineTop, { y: 0, duration: 0.15 }, 0.15);
      tl.to(lineBot, { y: 0, duration: 0.15 }, 0.15);
      tl.to(lineMid, { autoAlpha: 1, duration: 0.1 }, 0.15);
    }
    return tl;
  }

  // MOBILE — open/close menu
  function openMobileMenu() {
    killMobile();
    state.mobileMenuOpen = true;
    menuWrap.setAttribute("data-menu-open", "true");
    burger.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";

    const items = getNavItems();
    const tl = gsap.timeline();
    state.mobileTl = tl;
    tl.add(animateBurger(true), 0);
    tl.to(navList, { autoAlpha: 1, duration: 0.3, ease: "power2.out" }, 0);
    if (items.length) {
      tl.fromTo(items,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.04, ease: "power3.out" },
        0.15
      );
    }
  }

  function closeMobileMenu() {
    const hadPanel = state.mobilePanelActive;
    const panelEl = hadPanel ? getPanel(hadPanel) : null;
  
    killMobile();
    killMobilePanel();
  
    menuWrap.setAttribute("data-menu-open", "false");
    state.mobileMenuOpen = false;
    state.mobilePanelActive = null;
    burger.setAttribute("aria-expanded", "false");
  
    const tl = gsap.timeline({
      onComplete() {
        document.body.style.overflow = "";
        state.mobileTl = null;
        setupMobile();
      },
    });
    state.mobileTl = tl;
  
    tl.add(animateBurger(false), 0);
  
    // If a panel was open, fade it out with the close — no snap reset
    if (hadPanel && panelEl) {
      tl.to(panelEl, { autoAlpha: 0, duration: 0.3, ease: "power2.inOut" }, 0.05);
      tl.to(backBtn, { autoAlpha: 0, duration: 0.2, ease: "power2.in" }, 0.05);
    }
  
    // Fade out the nav list container
    tl.to(navList, { autoAlpha: 0, duration: 0.3, ease: "power2.inOut" }, 0.05);
  }

  // MOBILE — slide-over panels 
  function openMobilePanel(panelName) {
    const el = getPanel(panelName);
    if (!el) return;
    killMobilePanel();
    state.mobilePanelActive = panelName;

    const navItems = getNavItems();
    const panelFade = getFade(el);

    const tl = gsap.timeline();
    state.mobilePanelTl = tl;

    // Fade out each nav item to the left
    if (navItems.length) {
      tl.to(navItems, {
        xPercent: -10, autoAlpha: 0,
        duration: 0.35, stagger: 0.03, ease: "power2.in",
      }, 0);
    }

    // Logo → back button swap
    tl.to(logo, { autoAlpha: 0, duration: 0.2, ease: "power2.in" }, 0);
    tl.to(backBtn, { autoAlpha: 1, duration: 0.25, ease: "power2.inOut" }, 0.15);

    // Show panel container, then fade in its items from the right
    tl.set(el, { autoAlpha: 1, xPercent: 0, pointerEvents: "auto" }, 0.2);
    if (panelFade.length) {
      tl.fromTo(panelFade,
        { xPercent: 8, autoAlpha: 0 },
        { xPercent: 0, autoAlpha: 1, duration: 0.3, stagger: stagger(panelFade.length), ease: "power3.out" },
        0.25
      );
    }
  }

  function closeMobilePanel() {
    if (!state.mobilePanelActive) return;
    const el = getPanel(state.mobilePanelActive);
    if (!el) return;
    killMobilePanel();

    const navItems = getNavItems();
    const panelFade = getFade(el);

    const tl = gsap.timeline({
      onComplete() { state.mobilePanelActive = null;
                     state.mobilePanelTl = null;;
                   },
    });
    state.mobilePanelTl = tl;

    // Fade out panel items to the right
    if (panelFade.length) {
      tl.to(el, {
        xPercent: 20, autoAlpha: 0,
        duration: 0.3, stagger: 0.02, ease: "power2.in",
      }, 0);
    }

    // Hide panel
    tl.set(el, { autoAlpha: 0, pointerEvents: "none" }, 0.25);

    // Back → logo swap
    tl.to(backBtn, { autoAlpha: 0, duration: 0.2, ease: "power2.in" }, 0);
    tl.to(logo, { autoAlpha: 1, duration: 0.25, ease: "power2.out" }, 0.15);

    // Fade nav items back in from center
    if (navItems.length) {
      tl.fromTo(navItems,
        { xPercent: -20, autoAlpha: 0 },
        { xPercent: 0, autoAlpha: 1, duration: 0.35, stagger: 0.03, ease: "power3.out" },
        0.25
      );
    }
  }

  function handleToggleClick(e) {
    if (!state.isMobile || !state.mobileMenuOpen) return;
    const name = e.currentTarget.getAttribute("data-dropdown-toggle");
    if (name) { e.preventDefault(); openMobilePanel(name); }
  }

  // RESIZE
  let resizeTimer = null;
  let lastWidth = window.innerWidth;
  function handleResize() {
    const w = window.innerWidth;
    if (w === lastWidth) return;
    lastWidth = w;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const was = state.isMobile;
      state.isMobile = window.innerWidth <= 991;

      if (was && !state.isMobile) {
        killMobile(); killMobilePanel();
        gsap.set(navList, { clearProps: "all" });
        gsap.set(getNavItems(), { clearProps: "all" });
        gsap.set(backBtn, { autoAlpha: 0 });
        gsap.set(logo, { clearProps: "all" });
        gsap.set([lineTop, lineMid, lineBot], { rotation: 0, y: 0, autoAlpha: 1 });
      
        panels.forEach((p) => {
          gsap.set(p, { clearProps: "all" });
          gsap.set(getFade(p), { clearProps: "all" });
        });
      
        burger.setAttribute("aria-expanded", "false");
        state.mobileMenuOpen = false;
        state.mobilePanelActive = null;
        document.body.style.overflow = "";
        resetDesktop();
      }
      
      if (!was && state.isMobile) {
        killDropdown();
        state.isOpen = false; state.activePanel = null; state.activePanelIndex = -1;
        clearTimers();
        menuWrap.setAttribute("data-menu-open", "false");
        resetToggles();
        setupMobile();
      }
      
    }, 150);
  }

  // EVENT BINDING
  toggles.forEach((btn) => {
    btn.addEventListener("mouseenter", handleToggleEnter);
    btn.addEventListener("mouseleave", handleToggleLeave);
    btn.addEventListener("keydown", handleKeydownOnToggle);
    btn.addEventListener("click", handleToggleClick);
  });
  
  dropWrapper.addEventListener("mouseenter", handleWrapperEnter);
  dropWrapper.addEventListener("mouseleave", handleWrapperLeave);
  
  panels.forEach((p) => p.addEventListener("keydown", handleKeydownInPanel));
  
  backdrop.addEventListener("click", closeDropdown);
  
  document.addEventListener("keydown", handleEscape);
  document.addEventListener("click", handleDocClick);
  
  burger.addEventListener("click", () => state.mobileMenuOpen ? closeMobileMenu() : openMobileMenu());
  
  // backBtn.addEventListener("click", closeMobilePanel);
  
  window.addEventListener("resize", handleResize);

  // INIT
  state.isMobile ? setupMobile() : resetDesktop();
}


  function initBouncyContentTabs() {
  const config = {
    travel: 0.35,
    settle: 0.25,
    squashDown: 0.15,
    squashBack: 0.45,
    overshoot: 8,
    cardSquash: 0.2,
    cardInflate: 0.45,
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let instanceCount = 0;

  document.querySelectorAll("[data-bouncy-tabs-init]").forEach((root) => {
    const nav = root.querySelector("[data-bouncy-tabs-nav]");
    const indicator = root.querySelector("[data-bouncy-tabs-indicator]");
    const ghost = root.querySelector("[data-bouncy-tabs-ghost]");
    const buttons = nav ? Array.from(nav.querySelectorAll("[data-bouncy-tabs-button]")) : [];
    if (!nav || !indicator || buttons.length < 2) return;

    const card = root.querySelector("[data-bouncy-tabs-card]");
    const panelsWrap = root.querySelector("[data-bouncy-tabs-panels]");
    const panels = panelsWrap
      ? Array.from(panelsWrap.querySelectorAll("[data-bouncy-tabs-panel]"))
      : [];
    const hasCard = Boolean(card && panelsWrap && panels.length);

    instanceCount += 1;
    buttons.forEach((button, i) => {
      const panel = panels[i];
      if (!panel) return;
      if (!button.id) button.id = "bouncy-tabs-" + instanceCount + "-tab-" + (i + 1);
      if (!panel.id) panel.id = "bouncy-tabs-" + instanceCount + "-panel-" + (i + 1);
      button.setAttribute("aria-controls", panel.id);
      panel.setAttribute("aria-labelledby", button.id);
    });

    let activeIndex = Math.max(0, buttons.findIndex((b) => b.hasAttribute("data-active")));
    const pos = { left: 0, right: 0 };
    let ghostVisible = false;
    const dur = (d) => (reduceMotion.matches ? 0 : d);

    function syncButtonState() {
      buttons.forEach((b, i) => {
        b.toggleAttribute("data-active", i === activeIndex);
        b.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
        b.tabIndex = i === activeIndex ? 0 : -1;
      });
    }

    function rectFor(button) {
      return {
        left: button.offsetLeft,
        right: button.offsetLeft + button.offsetWidth,
        top: button.offsetTop,
        height: button.offsetHeight,
      };
    }

    function render() {
      gsap.set(indicator, { x: pos.left, width: pos.right - pos.left });
    }

    function place(index) {
      const target = rectFor(buttons[index]);
      pos.left = target.left;
      pos.right = target.right;
      gsap.killTweensOf(pos);
      gsap.killTweensOf(indicator);
      gsap.set(indicator, { scaleY: 1, y: target.top, height: target.height });
      render();
    }

    function setPanelsHeight() {
      if (hasCard) gsap.set(panelsWrap, { height: panels[activeIndex].offsetHeight });
    }

    function swapPanelsInstant() {
      if (!hasCard) return;
      panels.forEach((p, i) => {
        gsap.killTweensOf(p);
        gsap.set(p, { autoAlpha: i === activeIndex ? 1 : 0, x: 0 });
        p.toggleAttribute("data-active", i === activeIndex);
      });
      gsap.set(card, { scaleX: 1, scaleY: 1, x: 0 });
      setPanelsHeight();
    }

    function transitionCard(prevIndex, movingRight) {
      if (!hasCard) return;
      const direction = movingRight ? 1 : -1;
      const incoming = panels[activeIndex];
      const outgoing = panels[prevIndex];
      if (!incoming || !outgoing) return;

      panels.forEach((p) => {
        if (p !== incoming && p !== outgoing) {
          gsap.killTweensOf(p);
          gsap.set(p, { autoAlpha: 0, x: 0 });
          p.removeAttribute("data-active");
        }
      });
      incoming.setAttribute("data-active", "");
      outgoing.removeAttribute("data-active");

      gsap.killTweensOf([card, panelsWrap, incoming, outgoing]);
      gsap.set(card, { transformOrigin: "50% 50%" });
      const targetHeight = incoming.offsetHeight;

      gsap.timeline()
        .to(card, {
          scaleX: 0.96,
          scaleY: 1.02,
          x: direction * 10,
          duration: config.cardSquash,
          ease: "power2.out",
        }, 0)
        .to(outgoing, { x: direction * -35, autoAlpha: 0, duration: 0.2, ease: "power2.out" }, 0)
        .to(panelsWrap, { height: targetHeight, duration: 0.3, ease: "power2.inOut" }, 0.1)
        .fromTo(
          incoming,
          { x: direction * 35, autoAlpha: 0 },
          { x: 0, autoAlpha: 1, duration: 0.3, ease: "power2.out" },
          config.cardSquash
        )
        .to(card, {
          scaleX: 1,
          scaleY: 1,
          x: 0,
          duration: config.cardInflate,
          ease: "back.out(2)",
        }, config.cardSquash)
        .set(outgoing, { x: 0 });
    }

    function goTo(index) {
      if (index === activeIndex) return;
      const prevIndex = activeIndex;
      const movingRight = index > activeIndex;
      activeIndex = index;
      syncButtonState();

      if (reduceMotion.matches) {
        place(index);
        swapPanelsInstant();
        return;
      }

      transitionCard(prevIndex, movingRight);

      const target = rectFor(buttons[index]);
      gsap.killTweensOf(pos);
      gsap.killTweensOf(indicator);

      const hDir = target.left === pos.left ? (movingRight ? 1 : -1) : (target.left > pos.left ? 1 : -1);
      const distance = Math.abs(target.left - pos.left);
      const maxOvershoot = Math.max(6, config.overshoot);
      let overshoot = gsap.utils.clamp(6, maxOvershoot, distance * 0.08) * hDir;
      if (hDir > 0) {
        overshoot = Math.min(overshoot, nav.clientWidth - target.right);
      } else {
        overshoot = Math.max(overshoot, -target.left);
      }

      gsap.set(indicator, { transformOrigin: "50% 50%" });
      gsap.to(indicator, {
        y: target.top,
        height: target.height,
        duration: config.travel,
        ease: "power3.out",
      });
      gsap.timeline()
        .to(pos, {
          left: target.left + overshoot,
          right: target.right + overshoot,
          duration: config.travel,
          ease: "power3.out",
          onUpdate: render,
        })
        .to(pos, {
          left: target.left,
          right: target.right,
          duration: config.settle,
          ease: "power2.inOut",
          onUpdate: render,
        });
      gsap.timeline()
        .to(indicator, { scaleY: 0.78, duration: config.squashDown, ease: "power2.out" })
        .to(indicator, { scaleY: 1, duration: config.squashBack, ease: "back.out(2.5)" });
    }

    function moveGhost(button) {
      if (!ghost) return;
      const target = rectFor(button);
      if (!ghostVisible) {
        ghostVisible = true;
        gsap.killTweensOf(ghost);
        gsap.set(ghost, {
          x: target.left,
          y: target.top,
          width: target.right - target.left,
          height: target.height,
        });
        gsap.to(ghost, { autoAlpha: 1, duration: dur(0.25), ease: "power2.out" });
      } else {
        gsap.to(ghost, {
          x: target.left,
          y: target.top,
          width: target.right - target.left,
          height: target.height,
          autoAlpha: 1,
          duration: dur(0.3),
          ease: "power3.out",
        });
      }
    }

    function hideGhost() {
      if (!ghost) return;
      ghostVisible = false;
      gsap.to(ghost, { autoAlpha: 0, duration: dur(0.2), ease: "power1.out" });
    }

    function refreshLayout() {
      const rows = new Set(buttons.map((b) => b.offsetTop));
      nav.toggleAttribute("data-wrapped", rows.size > 1);
      place(activeIndex);
      setPanelsHeight();
    }

    buttons.forEach((button, index) => {
      button.addEventListener("click", () => goTo(index));
      button.addEventListener("mouseenter", () => moveGhost(button));
    });

    nav.addEventListener("mouseleave", hideGhost);
    nav.addEventListener("keydown", (event) => {
      let next = null;
      if (event.key === "ArrowRight") next = Math.min(buttons.length - 1, activeIndex + 1);
      if (event.key === "ArrowLeft") next = Math.max(0, activeIndex - 1);
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = buttons.length - 1;
      if (next === null) return;
      event.preventDefault();
      if (next !== activeIndex) {
        goTo(next);
        buttons[next].focus();
      }
    });

    window.addEventListener("resize", refreshLayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshLayout);

    if (ghost) gsap.set(ghost, { autoAlpha: 0 });
    panels.forEach((p, i) => gsap.set(p, { autoAlpha: i === activeIndex ? 1 : 0 }));
    
    syncButtonState();
    refreshLayout();
  });
}

function initAccordionCSS() {
  document.querySelectorAll('[data-accordion-css-init]').forEach((accordion) => {
    const closeSiblings = accordion.getAttribute('data-accordion-close-siblings') === 'true';

    accordion.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-accordion-toggle]');
      if (!toggle) return; // Exit if the clicked element is not a toggle

      const singleAccordion = toggle.closest('[data-accordion-status]');
      if (!singleAccordion) return; // Exit if no accordion container is found

      const isActive = singleAccordion.getAttribute('data-accordion-status') === 'active';
      singleAccordion.setAttribute('data-accordion-status', isActive ? 'not-active' : 'active');
      
      // When [data-accordion-close-siblings="true"]
      if (closeSiblings && !isActive) {
        accordion.querySelectorAll('[data-accordion-status="active"]').forEach((sibling) => {
          if (sibling !== singleAccordion) sibling.setAttribute('data-accordion-status', 'not-active');
        });
      }
    });
  });
}

function initCTAAnim() {
  const footer = document.querySelector('[data-cta]');
  const maskEl = footer.querySelector('[data-cta-mask]');

  gsap.from(maskEl, {
    maskSize: "auto 0%",
    scrollTrigger: {
      trigger: footer,
      start: "top bottom",
      end: "center center",
      scrub: 1.5,
    }
  })
}


function initMomentumBasedHover() {

  // If this device can’t hover with a fine pointer, stop here
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {return;}
  
  // Configuration (tweak these for feel)
  const xyMultiplier       = 30;  // multiplies pointer velocity for x/y movement
  const rotationMultiplier = 20;  // multiplies normalized torque for rotation speed
  const inertiaResistance  = 200; // higher = stops sooner

  // Pre-build clamp functions for performance
  const clampXY  = gsap.utils.clamp(-1080, 1080);
  const clampRot = gsap.utils.clamp(-60, 60);

  // Initialize each root container
  document.querySelectorAll('[data-momentum-hover-init]').forEach(root => {
    let prevX = 0, prevY = 0;
    let velX  = 0, velY  = 0;
    let rafId = null;

    // Track pointer velocity (throttled to RAF)
    root.addEventListener('mousemove', e => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        velX = e.clientX - prevX;
        velY = e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;
        rafId = null;
      });
    });

    // Attach hover inertia to each child element
    root.querySelectorAll('[data-momentum-hover-element]').forEach(el => {
      el.addEventListener('mouseenter', e => {
        const target = el.querySelector('[data-momentum-hover-target]');
        if (!target) return;

        // Compute offset from center to pointer
        const { left, top, width, height } = target.getBoundingClientRect();
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        const offsetX = e.clientX - centerX;
        const offsetY = e.clientY - centerY;

        // Compute raw torque (px²/frame)
        const rawTorque = offsetX * velY - offsetY * velX;

        // Normalize torque so rotation ∝ pointer speed (deg/sec)
        const leverDist    = Math.hypot(offsetX, offsetY) || 1;
        const angularForce = rawTorque / leverDist;

        // Calculate and clamp velocities
        const velocityX        = clampXY(velX * xyMultiplier);
        const velocityY        = clampXY(velY * xyMultiplier);
        const rotationVelocity = clampRot(angularForce * rotationMultiplier);

        // Apply GSAP inertia tween
        gsap.to(target, {
          inertia: {
            x:        { velocity: velocityX,        end: 0 },
            y:        { velocity: velocityY,        end: 0 },
            rotation: { velocity: rotationVelocity, end: 0 },
            resistance: inertiaResistance
          }
        });
      });
    });
  });
}

/* ==========================================================================
   Swipers
   --------------------------------------------------------------------------
   data-swiper="name"          the .swiper container (standard Swiper markup:
                               .swiper > .swiper-wrapper > .swiper-slide)
   data-swiper-pagination      empty div for the dots, inside the container or
                               a sibling of it
   ========================================================================== */

function initSwipers() {
  // One entry per data-swiper value. `media` is when the swiper should exist.
  const SWIPERS = {
    testimonials: {
      media: '(max-width: 767px)',
      options: {
        slidesPerView: 1,
        spaceBetween: 16,
        grabCursor: true,
      },
    },
  };

  document.querySelectorAll('[data-swiper]').forEach((container) => {
    const setup = SWIPERS[container.dataset.swiper];
    if (!setup) return;

    const pagination =
      container.querySelector('[data-swiper-pagination]') ||
      container.parentElement.querySelector(':scope > [data-swiper-pagination]');

    let swiper = null;

    const enable = () => {
      if (swiper) return;
      swiper = new Swiper(container, {
        ...setup.options,
        modules: [Pagination],
        pagination: pagination ? { el: pagination, clickable: true } : false,
      });
    };

    const disable = () => {
      if (!swiper) return;
      swiper.destroy(true, true);
      swiper = null;
      // Swiper leaves its bullets behind on destroy
      if (pagination) pagination.innerHTML = '';
    };

    const mq = window.matchMedia(setup.media);
    const update = () => (mq.matches ? enable() : disable());
    mq.addEventListener('change', update);
    update();
  });
}

/**
 * Bill split calculator
 *
 * Root:  [data-calc="root"] with data-calc-page="home | bills | rent | mortgage | car"
 *        optional data-calc-default="<bill key>" to start on a different bill of that page's list
 *
 * Emits "calculator:update" on the root (detail: { bill, amount, payment1, payment2, fees })
 * and mirrors the active bill on root[data-calc-active] so a Learn more modal can read it.
 */
function initCalculators() {
  const CONFIG = {
    fees: {
      processing: 0.005, // of the total bill, added to payment 1
      split: 0.03,       // of the split (2nd) half, added to payment 2
      membership: 5.99,  // flat, rent only, added to payment 1
    },
    // amount = default when the bill is selected; min/max/step drive the slider
    bills: {
      rent:      { label: "Rent",        amount: 1400, min: 500, max: 5000, step: 10, membership: true },
      mortgage:  { label: "Mortgage",    amount: 2400, min: 500, max: 6000, step: 10 },
      car:       { label: "Car payment", amount: 480,  min: 100, max: 1500, step: 10 },
      utilities: { label: "Utilities",   amount: 300,  min: 50,  max: 1000, step: 10 },
      childcare: { label: "Childcare",   amount: 400,  min: 100, max: 2500, step: 10 },
      insurance: { label: "Insurance",   amount: 350,  min: 50,  max: 1500, step: 10 },
      internet:  { label: "Internet",    amount: 250,  min: 25,  max: 500,  step: 5 },
      tv:        { label: "TV",          amount: 250,  min: 25,  max: 500,  step: 5 },
      phone:     { label: "Phone",       amount: 250,  min: 25,  max: 500,  step: 5 },
    },
    // Bills available per page; the first one is the default. One bill = no dropdown.
    pages: {
      home:     ["rent", "mortgage", "car", "utilities", "childcare", "insurance", "internet", "tv", "phone"],
      bills:    ["utilities", "childcare", "insurance", "internet", "tv", "phone"],
      rent:     ["rent"],
      mortgage: ["mortgage"],
      car:      ["car"],
    },
    defaultPage: "home",
    pageKeySteps: 10, // PageUp / PageDown jump size, in steps
  };

  const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  // Work in integer cents so the two payments always add up exactly
  function calculate(total, bill) {
    const totalC = Math.round(total * 100);
    const firstHalf = Math.round(totalC / 2);
    const secondHalf = totalC - firstHalf;
    const processing = Math.round(totalC * CONFIG.fees.processing);
    const split = Math.round(secondHalf * CONFIG.fees.split);
    const membership = bill.membership ? Math.round(CONFIG.fees.membership * 100) : 0;

    return {
      payment1: (firstHalf + processing + membership) / 100,
      payment2: (secondHalf + split) / 100,
      fees: { processing: processing / 100, split: split / 100, membership: membership / 100 },
    };
  }

  let uid = 0;

  document.querySelectorAll('[data-calc="root"]').forEach((root) => {
    if (root.dataset.calcReady === "true") return;

    const q = (name) => root.querySelector(`[data-calc="${name}"]`);
    const ui = {
      select: q("select"),
      toggle: q("select-toggle"),
      label: q("select-label"),
      list: q("select-list"),
      optionTemplate: q("select-option"),
      amount: q("amount"),
      slider: q("slider"),
      fill: q("slider-fill"),
      thumb: q("slider-thumb"),
      payment1: q("payment-1"),
      payment2: q("payment-2"),
      feeProcessing: q("fee-processing"),
      feeSplit: q("fee-split"),
      feeMembership: q("fee-membership"),
      rowMembership: q("row-membership"),
    };
    if (!ui.slider || !ui.thumb || !ui.amount || !ui.payment1 || !ui.payment2) return;

    root.dataset.calcReady = "true";
    const id = `calc-${++uid}`;

    const page = CONFIG.pages[root.dataset.calcPage] ? root.dataset.calcPage : CONFIG.defaultPage;
    const billKeys = CONFIG.pages[page].filter((key) => CONFIG.bills[key]);
    const startKey = billKeys.includes(root.dataset.calcDefault) ? root.dataset.calcDefault : billKeys[0];

    const state = { key: startKey, value: CONFIG.bills[startKey].amount };
    const bill = () => CONFIG.bills[state.key];

    /* ---------- Render ---------- */

    function render() {
      const b = bill();
      const progress = ((state.value - b.min) / (b.max - b.min)) * 100;
      const result = calculate(state.value, b);

      if (ui.fill) ui.fill.style.width = `${progress}%`;
      ui.thumb.style.left = `${progress}%`;
      ui.amount.textContent = usd0.format(state.value);

      ui.thumb.setAttribute("aria-valuemin", b.min);
      ui.thumb.setAttribute("aria-valuemax", b.max);
      ui.thumb.setAttribute("aria-valuenow", state.value);
      ui.thumb.setAttribute("aria-valuetext", `${usd0.format(state.value)} per month`);

      ui.payment1.textContent = usd2.format(result.payment1);
      ui.payment2.textContent = usd2.format(result.payment2);
      if (ui.feeProcessing) ui.feeProcessing.textContent = usd2.format(result.fees.processing);
      if (ui.feeSplit) ui.feeSplit.textContent = usd2.format(result.fees.split);
      if (ui.feeMembership) ui.feeMembership.textContent = usd2.format(CONFIG.fees.membership);
      // Inline display beats the Webflow class's display value; the hidden attribute wouldn't
      if (ui.rowMembership) ui.rowMembership.style.display = b.membership ? "" : "none";

      root.dataset.calcActive = state.key;
      root.dispatchEvent(
        new CustomEvent("calculator:update", {
          detail: { bill: state.key, amount: state.value, ...result },
        })
      );
    }

    /* ---------- Slider ---------- */

    function setValue(raw) {
      const { min, max, step } = bill();
      const value = clamp(Math.round((raw - min) / step) * step + min, min, max);
      if (value === state.value) return;
      state.value = value;
      render();
    }

    ui.thumb.setAttribute("role", "slider");
    ui.thumb.setAttribute("tabindex", "0");
    ui.thumb.setAttribute("aria-label", "Monthly bill amount");
    ui.thumb.setAttribute("aria-orientation", "horizontal");

    let rect = null;
    const valueAt = (clientX) => {
      const { min, max } = bill();
      return min + clamp((clientX - rect.left) / rect.width, 0, 1) * (max - min);
    };

    ui.slider.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      rect = ui.slider.getBoundingClientRect(); // cached for the whole drag
      ui.slider.setPointerCapture(e.pointerId);
      ui.slider.dataset.calcDragging = "true";
      ui.thumb.focus({ preventScroll: true });
      setValue(valueAt(e.clientX));
    });

    ui.slider.addEventListener("pointermove", (e) => {
      if (ui.slider.dataset.calcDragging !== "true") return;
      setValue(valueAt(e.clientX));
    });

    const endDrag = () => delete ui.slider.dataset.calcDragging;
    ui.slider.addEventListener("pointerup", endDrag);
    ui.slider.addEventListener("pointercancel", endDrag);

    ui.thumb.addEventListener("keydown", (e) => {
      const { min, max, step } = bill();
      const moves = {
        ArrowRight: state.value + step,
        ArrowUp: state.value + step,
        ArrowLeft: state.value - step,
        ArrowDown: state.value - step,
        PageUp: state.value + step * CONFIG.pageKeySteps,
        PageDown: state.value - step * CONFIG.pageKeySteps,
        Home: min,
        End: max,
      };
      if (!(e.key in moves)) return;
      e.preventDefault();
      setValue(moves[e.key]);
    });

    /* ---------- Bill dropdown ---------- */

    const hasDropdown = ui.select && ui.toggle && ui.list && ui.optionTemplate && billKeys.length > 1;
    const options = [];

    if (ui.label) ui.label.textContent = bill().label;

    if (!hasDropdown) {
      // Single-bill pages: plain label, no toggle behaviour
      if (ui.select) ui.select.dataset.calcStatic = "true";
      if (ui.list) ui.list.remove();
    } else {
      ui.list.id = `${id}-list`;
      ui.list.setAttribute("role", "listbox");
      ui.list.setAttribute("aria-label", "Bill type");

      ui.toggle.setAttribute("role", "button");
      ui.toggle.setAttribute("tabindex", "0");
      ui.toggle.setAttribute("aria-haspopup", "listbox");
      ui.toggle.setAttribute("aria-controls", ui.list.id);
      ui.toggle.setAttribute("aria-expanded", "false");

      // The single option in Webflow is a styling template, cloned per bill
      ui.optionTemplate.remove();
      billKeys.forEach((key) => {
        const option = ui.optionTemplate.cloneNode(true);
        option.textContent = CONFIG.bills[key].label;
        option.id = `${id}-${key}`;
        option.dataset.calcBill = key;
        option.setAttribute("role", "option");
        option.setAttribute("tabindex", "-1");
        ui.list.appendChild(option);
        options.push(option);
      });

      const syncSelected = () =>
        options.forEach((o) => o.setAttribute("aria-selected", String(o.dataset.calcBill === state.key)));
      syncSelected();

      const isOpen = () => ui.select.dataset.calcOpen === "true";

      const onOutside = (e) => {
        if (!ui.select.contains(e.target)) close(false);
      };

      function open() {
        ui.select.dataset.calcOpen = "true";
        ui.toggle.setAttribute("aria-expanded", "true");
        (options.find((o) => o.dataset.calcBill === state.key) || options[0]).focus({ preventScroll: true });
        document.addEventListener("pointerdown", onOutside);
      }

      function close(returnFocus) {
        if (!isOpen()) return;
        ui.select.dataset.calcOpen = "false";
        ui.toggle.setAttribute("aria-expanded", "false");
        document.removeEventListener("pointerdown", onOutside);
        if (returnFocus) ui.toggle.focus({ preventScroll: true });
      }

      function choose(key) {
        if (key !== state.key) {
          state.key = key;
          state.value = bill().amount; // each bill resets to its own default amount
          if (ui.label) ui.label.textContent = bill().label;
          syncSelected();
          render();
        }
        close(true);
      }

      ui.toggle.addEventListener("click", () => (isOpen() ? close(true) : open()));
      ui.toggle.addEventListener("keydown", (e) => {
        if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
          e.preventDefault();
          open();
        }
      });

      ui.list.addEventListener("click", (e) => {
        const option = e.target.closest("[data-calc-bill]");
        if (option) choose(option.dataset.calcBill);
      });

      ui.list.addEventListener("keydown", (e) => {
        const index = options.indexOf(document.activeElement);
        const focusAt = (i) => options[(i + options.length) % options.length].focus();

        switch (e.key) {
          case "ArrowDown": focusAt(index + 1); break;
          case "ArrowUp":   focusAt(index - 1); break;
          case "Home":      focusAt(0); break;
          case "End":       focusAt(options.length - 1); break;
          case "Enter":
          case " ":
            if (index > -1) choose(options[index].dataset.calcBill);
            break;
          case "Escape":    close(true); break;
          case "Tab":       close(false); return; // let focus move on naturally
          default: return;
        }
        e.preventDefault();
      });
    }

    render();
  });
}

/* ==========================================================================
   Card split — hero payment card splits into two with a gooey "birth"
   ========================================================================== */
function initCardSplit() {
  const CONFIG = {
    gap: 24, // px between the two cards once split
    // Goo reach: the neck can bridge a gap of roughly 1.35 × blur, so keep blur above (gap + overshoot) / 1.35
    // or it tears on its own before the snap. Contrast sharpens the edge; its threshold is fixed at 0.5 so the
    // goo never grows past the card's edge (a lower threshold shows a rim around the initial card).
    // Both are written to the SVG filter by JS, so the embed's values don't matter
    blur: 22,
    contrast: 40,
    intro: { delay: 0.375, duration: 1.2, ease: "expo.out", y: "3rem", scale: 0.96 },
    swap: { duration: 0.9, ease: "expo.out", stagger: 0.06 },
    // ease drives travel + width together (back.out gives the overshoot); stretchEase grows height.
    // snapAt/snapDuration collapse the blur while the overshoot pulls the cards furthest apart
    goo: {
      start: 0,
      duration: 0.8,
      ease: "back.out(1.7)",
      stretchEase: "power3.out",
      startScale: 0,
      snapAt: 0.36, // keep snapAt/snapDuration in proportion to duration so the snap stays at peak overshoot
      snapDuration: 0.32,
    },
    reveal: { offset: 0.1, duration: 0.9, ease: "expo.out", stagger: 0.06 }, // offset: seconds after the right card starts fading in
  };

  const hero = document.querySelector("[data-home-hero]");
  if (!hero) return;

  const initial = hero.querySelector('[data-split-card="initial"]');
  const right = hero.querySelector('[data-split-card="right"]');
  const triggerWrap = initial?.querySelector("[data-split-trigger]");
  if (!initial || !right || !triggerWrap) return;

  // Trigger lives inside a Webflow component, so the attribute sits on its wrapper
  const trigger = triggerWrap.querySelector("a, button") || triggerWrap;
  const bounds = hero.querySelector("[data-split-bounds]") || hero;
  const masks = [...initial.querySelectorAll("[data-split-mask]")];
  const current = masks.map((m) => m.children[0]).filter(Boolean);
  const next = masks.map((m) => m.children[1]).filter(Boolean);

  // Right card reveals through its own masks; anything unmasked (the fee note) just fades up
  const rightMasked = [...right.querySelectorAll("[data-split-mask]")].map((m) => m.firstElementChild).filter(Boolean);
  const rightRest = [...right.children].filter((c) => !c.matches("[data-split-mask]") && !c.querySelector("[data-split-mask]"));

  const goo = hero.querySelector("[data-split-goo]");
  const blobs = goo ? [...goo.querySelectorAll("[data-split-blob]")] : [];
  const blurEl = document.querySelector("#card-goo feGaussianBlur");
  const matrixEl = document.querySelector("#card-goo feColorMatrix");

  // Each card can have its own magnet layer (see initCardFloat). Only layers inside the goo's
  // stage count; anything above it moves the goo too, so it needs no compensation
  const stage = goo?.parentElement.closest("[data-card-float]") || goo?.parentElement;
  const magnetFor = (card) => {
    const m = card.closest("[data-card-magnet]");
    return m && stage?.contains(m) && m !== stage ? m : null;
  };
  const initialMagnet = magnetFor(initial);
  const rightMagnet = magnetFor(right);

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const useGoo = !reduceMotion && goo && blobs.length === 2 && blurEl;

  let isSplit = false;

  // Duplicates stay out of the tab order / screen readers until swapped in
  next.forEach((el) => (el.inert = true));
  right.inert = true;
  gsap.set(right, { autoAlpha: 0 });

  /* ---------- Intro ---------- */
  // cardsplit:ready lets the magnet measure the card at its resting position, not mid-intro
  const intro = gsap.timeline({
    delay: CONFIG.intro.delay,
    onComplete: () => hero.dispatchEvent(new CustomEvent("cardsplit:ready")),
  });
  if (reduceMotion) {
    intro.set(initial, { autoAlpha: 1 });
  } else {
    intro
      .fromTo(
        initial,
        { autoAlpha: 0, y: CONFIG.intro.y, scale: CONFIG.intro.scale },
        { autoAlpha: 1, y: 0, scale: 1, duration: CONFIG.intro.duration, ease: CONFIG.intro.ease }
      )
      .from(current, { yPercent: 100, duration: 0.9, ease: "expo.out", stagger: 0.05 }, 0.15);
  }

  /* ---------- Layout helpers ---------- */
  // Ideal offset puts the new card beside the first; clamp so it never leaves the container
  const getOffset = () => {
    const room = bounds.getBoundingClientRect().right - initial.getBoundingClientRect().left - right.offsetWidth;
    return Math.max(0, Math.min(initial.offsetWidth + CONFIG.gap, room));
  };

  // The filter only paints ~10% past its element, so the goo layer is padded to cover the whole trip
  const PAD = CONFIG.blur * 4;
  const sizeGoo = (offset) => {
    const w = initial.offsetWidth;
    const h = initial.offsetHeight;
    gsap.set(goo, {
      top: -PAD,
      left: -PAD,
      width: offset + Math.max(w, right.offsetWidth) + PAD * 2,
      height: Math.max(h, right.offsetHeight) + PAD * 2,
    });
    gsap.set(blobs[0], { top: PAD, left: PAD, width: w, height: h, x: 0 });
    // Blob B is "budded" as a droplet centred on the initial card's right edge
    gsap.set(blobs[1], {
      top: PAD,
      left: PAD,
      width: right.offsetWidth,
      height: right.offsetHeight,
      x: w - right.offsetWidth / 2,
      scale: CONFIG.goo.startScale,
      transformOrigin: "center center",
    });
    gsap.set(blurEl, { attr: { stdDeviation: CONFIG.blur } });
    const c = CONFIG.contrast;
    matrixEl?.setAttribute("values", `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${c} ${-c / 2}`);
  };

  /* ---------- Split ---------- */
  const split = (e) => {
    e.preventDefault();
    if (isSplit) return;
    isSplit = true;
    intro.progress(1);

    const hadFocus = triggerWrap.contains(document.activeElement);
    const offset = getOffset();
    // Offset via `left` so x/y stay free for the right card's own magnet
    gsap.set(right, { left: offset });

    current.forEach((el) => (el.inert = true));
    next.forEach((el) => (el.inert = false));
    if (hadFocus) next.map((el) => el.querySelector("a, button")).find(Boolean)?.focus({ preventScroll: true });

    const done = () => {
      right.inert = false;
      hero.dispatchEvent(new CustomEvent("cardsplit:complete"));
    };

    if (reduceMotion) {
      masks.forEach((m) => gsap.set(m.children, { yPercent: -100 }));
      gsap.to(right, { autoAlpha: 1, duration: 0.3, onComplete: done });
      return;
    }

    // The cards keep floating/magnetising during the split, so the blobs track them live.
    // Blob A follows the initial card; blob B blends from the initial card's shift to the
    // right card's as it travels, so it buds from one and lands under the other
    const budX = initial.offsetWidth - right.offsetWidth / 2;
    const heights = new Map([initialMagnet, rightMagnet].filter(Boolean).map((m) => [m, m.offsetHeight]));
    const shift = (m) =>
      m
        ? {
            x: gsap.getProperty(m, "x"),
            y: gsap.getProperty(m, "y") + (gsap.getProperty(m, "yPercent") * heights.get(m)) / 100,
          }
        : { x: 0, y: 0 };
    const syncBlobs = () => {
      const a = shift(initialMagnet);
      const b = shift(rightMagnet);
      const p = gsap.utils.clamp(0, 1, (gsap.getProperty(blobs[1], "x") - budX) / (offset - budX || 1));
      gsap.set(blobs[0], { left: PAD + a.x, top: PAD + a.y });
      gsap.set(blobs[1], { left: PAD + a.x + (b.x - a.x) * p, top: PAD + a.y + (b.y - a.y) * p });
    };

    const tl = gsap.timeline({ onComplete: done, onUpdate: useGoo ? syncBlobs : null });

    // Each mask's pair moves together; masks stagger against each other
    masks.forEach((m, i) => {
      tl.to(m.children, { yPercent: -100, duration: CONFIG.swap.duration, ease: CONFIG.swap.ease }, i * CONFIG.swap.stagger);
    });

    const g = CONFIG.goo;
    // Crossfade once the overshoot has settled (within ~2px), so card and blob line up
    const revealAt = g.start + g.duration - 0.1;

    if (useGoo) {
      sizeGoo(offset);
      syncBlobs();
      // Blob A sits still under the initial card so the neck always starts from its edge;
      // only the spawning card (blob B) moves and overshoots
      tl.set(goo, { display: "block" }, 0)
        // x and scaleX share one ease so the trailing edge stays glued to the card while the leading
        // edge overshoots and springs back. scaleY on a slower ease stretches the droplet wide first
        .to(blobs[1], { x: offset, scaleX: 1, duration: g.duration, ease: g.ease }, g.start)
        .to(blobs[1], { scaleY: 1, duration: g.duration, ease: g.stretchEase }, g.start)
        // Collapsing the blur at peak separation snaps the neck, so it can't rejoin as the card settles back
        .to(blurEl, { attr: { stdDeviation: 0 }, duration: g.snapDuration, ease: "power2.in" }, g.start + g.snapAt);
    } else {
      tl.fromTo(right, { left: 0 }, { left: offset, duration: g.duration, ease: g.ease }, g.start);
    }

    // Real card crossfades in over the blob (white on white) with its content hidden in the masks,
    // then the content slides up row by row like the initial card's swap
    const r = CONFIG.reveal;
    const contentAt = revealAt + r.offset;
    tl.set(rightMasked, { yPercent: 100 }, 0)
      .set(rightRest, { autoAlpha: 0 }, 0)
      .to(right, { autoAlpha: 1, duration: 0.35, ease: "power1.out" }, revealAt)
      .to(rightMasked, { yPercent: 0, duration: r.duration, ease: r.ease, stagger: r.stagger }, contentAt)
      .to(rightRest, { autoAlpha: 1, duration: r.duration, ease: r.ease }, contentAt + rightMasked.length * r.stagger);

    if (useGoo) tl.set(goo, { display: "none" });
  };

  trigger.addEventListener("click", split);

  // Keep the split layout valid across resizes
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (isSplit) gsap.set(right, { left: getOffset() });
    }, 150);
  });
}

/* ==========================================================================
   Card float + magnet — ambient motion on wrapper layers, independent of the split
   --------------------------------------------------------------------------
   Each [data-card-magnet] layer (one per card) bobs and magnetises on its own,
   so the two cards never move in lockstep. The group only shares a gentle tilt.
   ========================================================================== */
function initCardFloat() {
  const CONFIG = {
    // tilt is shared by the group; each card then bobs with its own period (durationY + index * stepY)
    float: { rotation: 1, durationR: 4.6, y: 8, durationY: 3.2, stepY: 0.7 },
    // strength: share of the cursor offset followed at full proximity; maxPull caps travel (px);
    // falloff > 1 makes the pull fade faster with distance (1 = linear, so it stays strong across the section);
    // stepDuration gives each card its own lag; minGap is the closest the cards may be pulled together (px)
    magnet: { strength: 0.05, maxPull: 12, falloff: 1, duration: 1.2, stepDuration: 0.3, ease: "power3.out", minGap: 8 },
  };

  const hero = document.querySelector("[data-home-hero]");
  if (!hero) return;
  const floatEl = hero.querySelector("[data-card-float]");
  const magnets = [...hero.querySelectorAll("[data-card-magnet]")];
  if (!floatEl && !magnets.length) return;

  const mm = gsap.matchMedia();

  /* ---------- Float ---------- */
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    const f = CONFIG.float;
    const loops = [];

    if (floatEl) {
      gsap.set(floatEl, { rotation: -f.rotation });
      loops.push(gsap.to(floatEl, { rotation: f.rotation, duration: f.durationR, ease: "sine.inOut", yoyo: true, repeat: -1 }));
    }

    // The bob uses yPercent so it stacks with the magnet's x/y instead of fighting it
    magnets.forEach((el, i) => {
      const amp = (f.y / (el.offsetHeight || 1)) * 100;
      const bob = gsap.fromTo(
        el,
        { yPercent: amp / 2 },
        { yPercent: -amp / 2, duration: f.durationY + i * f.stepY, ease: "sine.inOut", yoyo: true, repeat: -1 }
      );
      bob.seek(i * 1.1); // start out of phase
      loops.push(bob);
    });

    // Zero idle cost once the hero is scrolled away
    const io = new IntersectionObserver(([entry]) => {
      loops.forEach((t) => (entry.isIntersecting ? t.resume() : t.pause()));
    });
    io.observe(hero);

    return () => io.disconnect();
  });

  /* ---------- Magnet ---------- */
  if (!magnets.length) return;

  mm.add("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)", () => {
    const { strength, maxPull, falloff, duration, stepDuration, ease, minGap } = CONFIG.magnet;

    const items = magnets.map((el, i) => ({
      el,
      card: el.matches("[data-split-card]") ? el : el.querySelector("[data-split-card]") || el,
      xTo: gsap.quickTo(el, "x", { duration: duration + i * stepDuration, ease }),
      yTo: gsap.quickTo(el, "y", { duration: duration + i * stepDuration, ease }),
      box: null,
    }));
    let reach = 1;
    let measured = false;

    // Each card's resting bounds in page coords (its magnet offset removed). Hidden cards — the right
    // card before the split — get no box and stay put until re-measured on cardsplit:complete
    const measure = () => {
      items.forEach((item) => {
        if (getComputedStyle(item.card).visibility === "hidden") {
          item.box = null;
          return;
        }
        const r = item.card.getBoundingClientRect();
        const ox = window.scrollX - gsap.getProperty(item.el, "x");
        const oy = window.scrollY - gsap.getProperty(item.el, "y");
        item.box = { left: r.left + ox, right: r.right + ox, top: r.top + oy, bottom: r.bottom + oy };
      });
      // Pull fades to zero across the hero's longest side, so it's live anywhere inside the section
      const heroRect = hero.getBoundingClientRect();
      reach = Math.max(heroRect.width, heroRect.height);
      measured = true;
    };

    const onMove = (e) => {
      if (!measured) measure();
      const active = items.filter((item) => item.box);

      active.forEach((item) => {
        const { box } = item;
        // Direction from the card's centre, strength from the distance to its nearest edge (0 when over it)
        const dx = e.pageX - (box.left + box.right) / 2;
        const dy = e.pageY - (box.top + box.bottom) / 2;
        const edgeX = Math.max(box.left - e.pageX, 0, e.pageX - box.right);
        const edgeY = Math.max(box.top - e.pageY, 0, e.pageY - box.bottom);
        const proximity = (1 - Math.min(Math.hypot(edgeX, edgeY) / reach, 1)) ** falloff;

        const dist = Math.hypot(dx, dy) || 1;
        const pull = Math.min(dist * strength, maxPull) * proximity;
        item.tx = (dx / dist) * pull;
        item.ty = (dy / dist) * pull;
      });

      // With the cursor between two side-by-side cards both lean into the gap; share out any
      // excess so they stop minGap apart instead of overlapping
      active
        .slice()
        .sort((a, b) => a.box.left - b.box.left)
        .forEach((b, i, row) => {
          const a = row[i - 1];
          if (!a) return;
          const excess = a.tx - b.tx - (b.box.left - a.box.right - minGap);
          if (excess > 0) {
            a.tx -= excess / 2;
            b.tx += excess / 2;
          }
        });

      active.forEach(({ xTo, yTo, tx, ty }) => {
        xTo(tx);
        yTo(ty);
      });
    };
    const onLeave = () => {
      items.forEach(({ xTo, yTo }) => {
        xTo(0);
        yTo(0);
      });
    };

    let resizeTimer;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 150);
    };

    hero.addEventListener("pointerenter", measure);
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerleave", onLeave);
    hero.addEventListener("cardsplit:ready", measure);
    hero.addEventListener("cardsplit:complete", measure);
    window.addEventListener("resize", onResize);

    return () => {
      hero.removeEventListener("pointerenter", measure);
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
      hero.removeEventListener("cardsplit:ready", measure);
      hero.removeEventListener("cardsplit:complete", measure);
      window.removeEventListener("resize", onResize);
    };
  });
}

/* ==========================================================================
   Init
   --------------------------------------------------------------------------
   Lenis and parallax start immediately; anything that measures text waits on
   document.fonts so lines are split against real webfont metrics.
   Order matters: the splitReady listeners must be attached before
   initTextSplit runs, since that's what dispatches the event.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initLenis();
  initGlobalParallax();
  initMegaNavDirectionalHover();
  initBouncyContentTabs();
  initAccordionCSS();
  initCTAAnim();
    initMomentumBasedHover();
  initSwipers();
  initCalculators();
  initCardSplit();
  initCardFloat();
});


  document.fonts.ready.then(() => {
    initFOUC();
    initScrollAnimations();
    initLoadAnimations();
    initTextSplit();
  })