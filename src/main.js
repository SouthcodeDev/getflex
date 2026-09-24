import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/all';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText);

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
      charsClass: "char-mask",
      linesClass: "line-mask",
      autoSplit: true,
    },
    words: {
      type: "words, lines",
      mask: "lines",
      wordsClass: "word-mask",
      linesClass: "line-mask",
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

  document.fonts.ready.then(() => {
    initFOUC();
    initScrollAnimations();
    initLoadAnimations();
    initTextSplit();
  })
});
