/* Mokhichekhra — scroll reveals.
   Elements marked data-reveal fade and rise into place the first time they
   scroll into view. Children of a data-reveal-group follow each other with a
   short delay. Everything stays visible when this script cannot run, when
   IntersectionObserver is missing, or when the visitor prefers reduced motion. */
(function () {
  "use strict";

  var STAGGER_MS = 90;   // delay between items in a group
  var MAX_DELAY_MS = 360;

  var items = document.querySelectorAll("[data-reveal]");
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!items.length || reduceMotion || !("IntersectionObserver" in window)) {
    return;
  }

  // Stagger the items inside each group
  document.querySelectorAll("[data-reveal-group]").forEach(function (group) {
    group.querySelectorAll("[data-reveal]").forEach(function (item, i) {
      item.style.setProperty("--reveal-delay", Math.min(i * STAGGER_MS, MAX_DELAY_MS) + "ms");
    });
  });

  function show(item) {
    item.classList.add("is-visible");
  }

  // Anything already on screen is shown straight away, so nothing above the fold blinks
  var viewHeight = window.innerHeight || document.documentElement.clientHeight;
  items.forEach(function (item) {
    var box = item.getBoundingClientRect();
    if (box.top < viewHeight && box.bottom > 0) {
      show(item);
    }
  });

  document.documentElement.classList.add("js-reveal");

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        show(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

  items.forEach(function (item) {
    if (!item.classList.contains("is-visible")) {
      observer.observe(item);
    }
  });

  // Keyboard users: reveal a block as soon as focus moves into it
  document.addEventListener("focusin", function (event) {
    var item = event.target.closest && event.target.closest("[data-reveal]");
    if (item && !item.classList.contains("is-visible")) {
      show(item);
      observer.unobserve(item);
    }
  });

  // If the reduced-motion setting is switched on later, show everything at once
  if (window.matchMedia) {
    var query = window.matchMedia("(prefers-reduced-motion: reduce)");
    var showAll = function (e) {
      if (e.matches) {
        items.forEach(show);
        observer.disconnect();
      }
    };
    if (query.addEventListener) {
      query.addEventListener("change", showAll);
    }
  }
})();
