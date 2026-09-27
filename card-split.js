/* ==========================================================================
   Card split — hero payment card splits into two with a gooey "birth"
   ========================================================================== */
function initCardSplit() {
  const CONFIG = {
    gap: 16, // px between the two cards once split
    blur: 12, // goo reach — must match the stdDeviation in the SVG embed
    intro: { delay: 0.375, duration: 1.2, ease: "expo.out", y: "3rem", scale: 0.96 },
    swap: { duration: 0.9, ease: "expo.out", stagger: 0.06 },
    goo: { start: 0.03, duration: 1.2, ease: "power3.inOut", stretchEase: "power4.inOut", startScale: 0.15 },
    recoil: -10, // px the initial card "pushes back" as the new card leaves it
    reveal: { duration: 0.6, ease: "expo.out", stagger: 0.05 },
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

  const goo = hero.querySelector("[data-split-goo]");
  const blobs = goo ? [...goo.querySelectorAll("[data-split-blob]")] : [];
  const blurEl = document.querySelector("#card-goo feGaussianBlur");

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const useGoo = !reduceMotion && goo && blobs.length === 2 && blurEl;

  let isSplit = false;

  // Duplicates stay out of the tab order / screen readers until swapped in
  next.forEach((el) => (el.inert = true));
  right.inert = true;
  gsap.set(right, { autoAlpha: 0 });

  /* ---------- Intro ---------- */
  const intro = gsap.timeline({ delay: CONFIG.intro.delay });
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
  };

  /* ---------- Split ---------- */
  const split = (e) => {
    e.preventDefault();
    if (isSplit) return;
    isSplit = true;
    intro.progress(1);

    const hadFocus = triggerWrap.contains(document.activeElement);
    const offset = getOffset();
    gsap.set(right, { x: offset });

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

    const tl = gsap.timeline({ onComplete: done });

    // Each mask's pair moves together; masks stagger against each other
    masks.forEach((m, i) => {
      tl.to(m.children, { yPercent: -100, duration: CONFIG.swap.duration, ease: CONFIG.swap.ease }, i * CONFIG.swap.stagger);
    });

    const g = CONFIG.goo;
    const revealAt = g.start + g.duration - 0.2;

    if (useGoo) {
      sizeGoo(offset);
      tl.set(goo, { display: "block" }, 0)
        // Blob A shadows the real card so the neck always starts from the card's edge
        .to([initial, blobs[0]], { x: CONFIG.recoil, duration: 0.35, ease: "power2.out" }, g.start)
        .to([initial, blobs[0]], { x: 0, duration: 0.9, ease: "elastic.out(1, 0.5)" }, g.start + 0.35)
        // Growing while it travels keeps its trailing edge near the card, so the neck lives the whole trip.
        // scaleY on a steeper ease makes the droplet stretch wide before it fills out.
        .to(blobs[1], { x: offset, scaleX: 1, duration: g.duration, ease: g.ease }, g.start)
        .to(blobs[1], { scaleY: 1, duration: g.duration, ease: g.stretchEase }, g.start)
        // Collapsing the blur snaps the neck — otherwise a small gap stays bridged forever
        .to(blurEl, { attr: { stdDeviation: 0 }, duration: 0.4, ease: "power2.in" }, g.start + g.duration * 0.7);
    } else {
      tl.fromTo(right, { x: 0 }, { x: offset, duration: g.duration, ease: g.ease }, g.start);
    }

    // Real card crossfades in over the blob (white on white), bringing its shadow and text
    tl.to(right, { autoAlpha: 1, duration: 0.35, ease: "power1.out" }, revealAt)
      .from(
        right.children,
        { y: "0.75rem", autoAlpha: 0, duration: CONFIG.reveal.duration, ease: CONFIG.reveal.ease, stagger: CONFIG.reveal.stagger },
        revealAt
      );

    if (useGoo) tl.set(goo, { display: "none" });
  };

  trigger.addEventListener("click", split);

  // Keep the split layout valid across resizes
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (isSplit) gsap.set(right, { x: getOffset() });
    }, 150);
  });
}

/* ==========================================================================
   Card float + magnet — ambient motion on wrapper layers, independent of the split
   ========================================================================== */
function initCardFloat() {
  const CONFIG = {
    float: { y: 8, rotation: 1, durationY: 3.2, durationR: 4.6 },
    magnet: { strength: 0.08, radius: 520, duration: 1, ease: "power3.out" },
  };

  const hero = document.querySelector("[data-home-hero]");
  const floatEl = hero?.querySelector("[data-card-float]");
  const magnetEl = hero?.querySelector("[data-card-magnet]");
  if (!hero || !floatEl) return;

  const mm = gsap.matchMedia();

  /* ---------- Float ---------- */
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    // Two loops with unrelated durations never visibly repeat
    gsap.set(floatEl, { rotation: -CONFIG.float.rotation });
    const loops = [
      gsap.to(floatEl, { y: -CONFIG.float.y, duration: CONFIG.float.durationY, ease: "sine.inOut", yoyo: true, repeat: -1 }),
      gsap.to(floatEl, { rotation: CONFIG.float.rotation, duration: CONFIG.float.durationR, ease: "sine.inOut", yoyo: true, repeat: -1 }),
    ];

    // Zero idle cost once the hero is scrolled away
    const io = new IntersectionObserver(([entry]) => {
      loops.forEach((t) => (entry.isIntersecting ? t.resume() : t.pause()));
    });
    io.observe(hero);

    return () => io.disconnect();
  });

  /* ---------- Magnet ---------- */
  if (!magnetEl) return;

  mm.add("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)", () => {
    const xTo = gsap.quickTo(magnetEl, "x", { duration: CONFIG.magnet.duration, ease: CONFIG.magnet.ease });
    const yTo = gsap.quickTo(magnetEl, "y", { duration: CONFIG.magnet.duration, ease: CONFIG.magnet.ease });
    let center = null;

    // Centre of every visible card (so it re-centres on the pair after the split), in page coords
    const measure = () => {
      const rects = [...hero.querySelectorAll("[data-split-card]")]
        .filter((c) => getComputedStyle(c).visibility !== "hidden")
        .map((c) => c.getBoundingClientRect());
      if (!rects.length) return;
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      center = {
        x: (left + right) / 2 - gsap.getProperty(magnetEl, "x") + window.scrollX,
        y: (top + bottom) / 2 - gsap.getProperty(magnetEl, "y") + window.scrollY,
      };
    };

    const onMove = (e) => {
      if (!center) measure();
      const dx = e.pageX - center.x;
      const dy = e.pageY - center.y;
      const inRange = Math.hypot(dx, dy) < CONFIG.magnet.radius;
      xTo(inRange ? dx * CONFIG.magnet.strength : 0);
      yTo(inRange ? dy * CONFIG.magnet.strength : 0);
    };
    const onLeave = () => {
      xTo(0);
      yTo(0);
    };

    let resizeTimer;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 150);
    };

    hero.addEventListener("pointerenter", measure);
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerleave", onLeave);
    hero.addEventListener("cardsplit:complete", measure);
    window.addEventListener("resize", onResize);

    return () => {
      hero.removeEventListener("pointerenter", measure);
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
      hero.removeEventListener("cardsplit:complete", measure);
      window.removeEventListener("resize", onResize);
    };
  });
}
