# Debug: number odometer doesn't play on page load

## What should happen

Number counters ("odometers") on the page roll up when scrolled into view:

1. The first time a group scrolls into view, it plays.
2. Scrolling past it does nothing; the numbers stay at their final values.
3. Scrolling back up until the group is fully below the viewport resets it, and it plays again on the next entry.
4. **If a group is already visible when the page loads, it should play right away with no scroll.**

## The bug

Point 4 fails. One odometer group (a bar) sits right at the bottom of the viewport on load. It stays static until the user scrolls. Points 1–3 have not been confirmed either way.

## Stack

- Webflow site with custom JS bundled by Vite (`src/main.js`). Vite builds a single `dist/main.js` (IIFE). The dev server runs on `localhost:5173`.
- GSAP 3.15 + ScrollTrigger, with Lenis smooth scroll on `(pointer: fine)` devices. Lenis is driven from `gsap.ticker`, and `lenis.on('scroll', ScrollTrigger.update)`.
- `initNumberOdometer()` runs on `DOMContentLoaded`. Text split and load/scroll animations run later on `document.fonts.ready`, which calls `ScrollTrigger.refresh()`.

## Markup

- Group: `[data-odometer-group]`. The script sets `data-odometer-initialized` on it once processed.
- Numbers inside it: `[data-odometer-element]`. The script replaces each digit with `[data-odometer-part="mask"]` > `[data-odometer-part="roller"]` (a vertical strip of digits, animated with `y` in `em`).
- Optional group attributes: `data-odometer-trigger-start`, `data-odometer-stagger`, `data-odometer-stagger-order`.
- Users with `prefers-reduced-motion: reduce` get no animation (the group is skipped).

## Current logic (per group)

```js
const tl = gsap.timeline({ paused: true })   // roller/reveal tweens added after this

ScrollTrigger.create({
  trigger: group,
  start: triggerStart,                       // default currently 'top bottom'
  onEnter: () => tl.play()
})
if (ScrollTrigger.isInViewport(group)) tl.play()   // meant to cover "visible on load"

ScrollTrigger.create({
  trigger: group,
  start: 'top bottom',
  onLeaveBack: () => tl.pause(0)                // reset when fully below viewport
})
```

Already tried with no success: `start: 'clamp(top 80%)'`, and changing the default start to `'top bottom'`.

## Please check in the browser, in this order

1. **Is the latest code actually loaded?** Find which script the page loads (a `localhost:5173` dev server, a CDN, or a Webflow-hosted file). Search its source for `isInViewport(` and `data-odometer-initialized`. The local `dist/main.js` was last built at 09:24 and contains neither, so a stale build is a strong suspect.
2. Does `document.querySelector('[data-odometer-group]')` exist, and does it have `data-odometer-initialized`? Do the `[data-odometer-part="roller"]` elements exist?
3. Run `matchMedia('(prefers-reduced-motion: reduce)').matches`. If it's `true`, nothing will ever animate.
4. Run `ScrollTrigger.getAll().filter(st => st.trigger?.matches?.('[data-odometer-group]')).map(st => ({start: st.start, end: st.end, progress: st.progress, isActive: st.isActive}))` along with `ScrollTrigger.isInViewport(document.querySelector('[data-odometer-group]'))` and `window.scrollY`.
5. Read `group.getBoundingClientRect()` and compare it with `innerHeight` right at load. Is the group's top really above the viewport bottom, or just below it? Does the layout shift after load (fonts, images, card-split hero, Webflow interactions)?
6. Are the rollers moving but hidden? Check for `opacity: 0`, `visibility: hidden` (FOUC CSS on a parent such as `[data-anim-load]` / `[data-anim-scroll]`), or a parent animation that hides the group until scroll.
7. Check the console for errors thrown in `DOMContentLoaded` before `initNumberOdometer()` runs. It's called after `initSwipers`, `initCalculators`, `initCardSplit` and others, so an earlier throw would stop it.

## Report back

- Which of the above was the cause, with the values you saw.
- The smallest change to `src/main.js` (or to Webflow markup/CSS) that fixes it.
