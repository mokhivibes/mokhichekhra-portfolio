/* Mokhichekhra — case-study charts.
   Plain JavaScript and inline SVG, no charting library. Every value comes from
   the JSON files exported by the house-price-prediction project
   (case_study_eda.py and case_study_model.py) and copied into DATA_DIR.

   Each <figure data-chart="..."> already holds its title, description and a
   short fallback, so the page reads fine when this script cannot run or the
   data cannot be fetched. When the data loads, the fallback is replaced by:
     - an SVG chart that follows the theme through CSS variables,
     - hover and keyboard tooltips (focus the chart, then use the arrow keys),
     - a data table inside a <details> element.
   Bars and points grow in the first time a chart scrolls into view, unless the
   visitor prefers reduced motion; then charts are drawn in their final state. */
(function () {
  "use strict";

  var DATA_DIR = "assets/case-studies/house-price/";
  var FILES = {
    price: "eda_price_distribution.json",
    missing: "eda_missing_values.json",
    correlations: "eda_correlations.json",
    livingArea: "eda_living_area.json",
    lotArea: "eda_lot_area.json",
    metrics: "model_metrics.json",
    importance: "model_importance.json",
    predictions: "model_test_predictions.json"
  };
  var SVG_NS = "http://www.w3.org/2000/svg";

  var reduceMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var canAnimate = !reduceMotion && "IntersectionObserver" in window;

  /* ---------- Formatting ---------- */
  var whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  function money(v) {
    return (v < 0 ? "−$" : "$") + whole.format(Math.abs(Math.round(v)));
  }

  function signedMoney(v) {
    return (v > 0 ? "+" : "") + money(v);
  }

  function shortMoney(v) {
    var a = Math.abs(v);
    var s = a >= 1000 ? whole.format(a / 1000) + "k" : whole.format(a);
    return (v < 0 ? "−$" : "$") + s;
  }

  function percent(share, digits) {
    return (share * 100).toFixed(digits === undefined ? 1 : digits) + "%";
  }

  /* ---------- Scales ---------- */
  function linear(d0, d1, r0, r1) {
    return function (v) { return r0 + (v - d0) * (r1 - r0) / (d1 - d0); };
  }

  // Round tick values ("nice" steps of 1, 2 or 5 × 10^n) covering min..max
  function niceTicks(min, max, count) {
    var raw = (max - min || 1) / count;
    var step = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var err = raw / step;
    if (err >= 7.5) step *= 10;
    else if (err >= 3.5) step *= 5;
    else if (err >= 1.5) step *= 2;
    var lo = Math.floor(min / step) * step;
    var hi = Math.ceil(max / step) * step;
    var ticks = [];
    for (var i = 0; lo + i * step <= hi + step / 2; i++) {
      ticks.push(parseFloat((lo + i * step).toPrecision(12)));
    }
    return { ticks: ticks, lo: lo, hi: ticks[ticks.length - 1], step: step };
  }

  /* ---------- SVG helpers ---------- */
  function svgEl(name, attrs, parent) {
    var node = document.createElementNS(SVG_NS, name);
    for (var key in attrs) {
      if (attrs[key] !== undefined) node.setAttribute(key, attrs[key]);
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function svgText(parent, x, y, str, cls, anchor) {
    var t = svgEl("text", { x: x, y: y, "class": cls || "chart-tick", "text-anchor": anchor }, parent);
    t.textContent = str;
    return t;
  }

  function newSvg(width, height) {
    // The viewBox matches the drawn size, so text keeps its real pixel size on every screen
    return svgEl("svg", {
      viewBox: "0 0 " + width + " " + height,
      width: width,
      height: height,
      "aria-hidden": "true",
      focusable: "false"
    });
  }

  function delay(el, ms) {
    el.style.setProperty("--d", Math.round(ms) + "ms");
  }

  /* ---------- Shared chart pieces ---------- */

  // Vertical columns: histograms
  function drawColumns(width, cfg) {
    var height = Math.round(Math.max(220, Math.min(340, width * 0.48)));
    var m = { top: cfg.markerRows ? 14 + cfg.markerRows * 14 : 12, right: 14, bottom: 30, left: 40 };
    var svg = newSvg(width, height);
    var maxCount = Math.max.apply(null, cfg.bins.map(function (b) { return b.count; }));
    var yt = niceTicks(0, maxCount, 4);
    var x = linear(cfg.domain[0], cfg.domain[1], m.left, width - m.right);
    var y = linear(0, yt.hi, height - m.bottom, m.top);

    var grid = svgEl("g", { "class": "chart-gridlines" }, svg);
    yt.ticks.forEach(function (t) {
      svgEl("line", { x1: m.left, x2: width - m.right, y1: y(t), y2: y(t) }, grid);
      svgText(svg, m.left - 8, y(t) + 4, whole.format(t), "chart-tick", "end");
    });

    cfg.ticks.forEach(function (t) {
      var px = x(t.value);
      if (px < m.left - 1 || px > width - m.right + 1) return;
      svgEl("line", { x1: px, x2: px, y1: height - m.bottom, y2: height - m.bottom + 5, "class": "chart-axis" }, svg);
      svgText(svg, px, height - m.bottom + 18, t.label, "chart-tick", "middle");
    });

    var barsG = svgEl("g", { "class": "chart-bars" }, svg);
    var items = cfg.bins.map(function (b, i) {
      var x0 = x(b.x0), x1 = x(b.x1);
      var mark = null;
      if (b.count > 0) {
        mark = svgEl("rect", {
          x: x0 + 1,
          y: y(b.count),
          width: Math.max(1, x1 - x0 - 2),       // 2px surface gap between bars
          height: Math.max(1, y(0) - y(b.count)),
          "class": "chart-bar chart-bar--v" + (b.cls ? " " + b.cls : "")
        }, barsG);
        delay(mark, i / cfg.bins.length * 420);
      }
      return { cx: (x0 + x1) / 2, cy: y(b.count), x0: x0, x1: x1, mark: mark, lines: b.lines, bin: b };
    });

    svgEl("line", { x1: m.left, x2: width - m.right, y1: y(0), y2: y(0), "class": "chart-axis" }, svg);

    return {
      svg: svg, items: items, x: x, y: y, m: m, height: height,
      pick: function (px) {
        for (var i = 0; i < items.length; i++) {
          if (px >= items[i].x0 && px < items[i].x1) return i;
        }
        return -1;
      }
    };
  }

  // A labelled vertical marker line (mean, median, tolerance limits)
  function drawMarker(svg, layout, value, label, row, anchor) {
    var px = layout.x(value);
    var g = svgEl("g", { "class": "chart-marker" }, svg);
    svgEl("line", { x1: px, x2: px, y1: 6 + row * 14, y2: layout.height - layout.m.bottom }, g);
    if (label) {
      svgText(g, px + (anchor === "end" ? -5 : 5), 14 + row * 14, label, "chart-marker__label", anchor || "start");
    }
    return g;
  }

  // Horizontal bars with labels on the left: rankings
  function drawRows(width, cfg) {
    var narrow = width < 480;
    var rowH = cfg.rowHeight || 28;
    var barH = cfg.barHeight || 12;
    var labelW = narrow ? (cfg.labelWidthNarrow || 96) : (cfg.labelWidth || 128);
    var valueW = cfg.valueFormat ? (narrow ? 58 : 70) : 16;
    var m = { top: 6, right: valueW, bottom: 26, left: labelW };
    var height = m.top + cfg.rows.length * rowH + m.bottom;
    var svg = newSvg(width, height);
    var xt = niceTicks(0, cfg.max, narrow ? 3 : 5);
    var x = linear(0, xt.hi, m.left, width - m.right);

    var grid = svgEl("g", { "class": "chart-gridlines" }, svg);
    xt.ticks.forEach(function (t) {
      svgEl("line", { x1: x(t), x2: x(t), y1: m.top, y2: height - m.bottom }, grid);
      svgText(svg, x(t), height - m.bottom + 17, cfg.tickFormat(t), "chart-tick", "middle");
    });

    var barsG = svgEl("g", { "class": "chart-bars" }, svg);
    var items = cfg.rows.map(function (r, i) {
      var top = m.top + i * rowH;
      var cy = top + rowH / 2;
      svgText(svg, m.left - 10, cy + 4, r.label, "chart-row-label", "end");
      var mark = svgEl("rect", {
        x: m.left,
        y: cy - barH / 2,
        width: Math.max(1, x(r.value) - m.left),
        height: barH,
        "class": "chart-bar chart-bar--h" + (r.cls ? " " + r.cls : "")
      }, barsG);
      delay(mark, i * 45);
      var end = x(r.value);
      if (r.lo !== undefined) {
        var w = svgEl("g", { "class": "chart-whisker" }, barsG);
        svgEl("line", { x1: x(r.lo), x2: x(r.hi), y1: cy, y2: cy }, w);
        svgEl("line", { x1: x(r.lo), x2: x(r.lo), y1: cy - 4, y2: cy + 4 }, w);
        svgEl("line", { x1: x(r.hi), x2: x(r.hi), y1: cy - 4, y2: cy + 4 }, w);
        delay(w, i * 45 + 300);
        end = Math.max(end, x(r.hi));
      }
      if (cfg.valueFormat) {
        svgText(svg, end + 6, cy + 4, cfg.valueFormat(r.value), "chart-value", "start");
      }
      return { cx: x(r.value), cy: cy, y0: top, y1: top + rowH, mark: mark, lines: r.lines };
    });

    svgEl("line", { x1: m.left, x2: m.left, y1: m.top, y2: height - m.bottom, "class": "chart-axis" }, svg);

    return {
      svg: svg, items: items,
      pick: function (px, py) {
        for (var i = 0; i < items.length; i++) {
          if (py >= items[i].y0 && py < items[i].y1) return i;
        }
        return -1;
      }
    };
  }

  // Nearest point within reach, so small dots do not need pinpoint aim
  function nearest(items, px, py, reach) {
    var best = -1, bestD = reach * reach;
    for (var i = 0; i < items.length; i++) {
      var dx = items[i].cx - px, dy = items[i].cy - py;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /* ---------- Mounting: tooltip, keyboard, resize, reveal animation ---------- */
  function mount(fig, draw) {
    var plot = fig.querySelector(".chart__plot");
    var live = fig.querySelector(".chart__live");
    var title = fig.querySelector(".chart__title");
    var tip = document.createElement("div");
    tip.className = "chart__tip";
    tip.setAttribute("aria-hidden", "true");

    var state = { items: [], active: -1, pick: null, update: null, width: 0, drawn: !canAnimate };
    var current = null;

    plot.tabIndex = 0;
    plot.setAttribute("role", "group");
    plot.setAttribute("aria-roledescription", "interactive chart");
    plot.setAttribute("aria-label", (title ? title.textContent + ". " : "") +
      "Use the arrow keys to move between data points.");
    var desc = fig.querySelector(".chart__desc");
    if (desc && desc.id) plot.setAttribute("aria-describedby", desc.id);
    if (canAnimate) fig.classList.add("chart--motion");

    function play(svg) {
      svg.classList.add("is-pending");
      // Two frames, so the start state is painted before the transition begins
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { svg.classList.remove("is-pending"); });
      });
    }

    function paint(animate) {
      var width = Math.floor(plot.clientWidth);
      if (!width) return;
      state.width = width;
      hide();
      plot.textContent = "";
      current = draw(width);
      state.items = current.items;
      state.pick = current.pick || null;
      state.update = current.update || null;
      state.active = -1;
      plot.appendChild(current.svg);
      plot.appendChild(tip);
      if (!state.drawn) current.svg.classList.add("is-pending");
      else if (animate && canAnimate) play(current.svg);
    }

    function setActive(i, announce) {
      var prev = state.items[state.active];
      if (prev && prev.mark) prev.mark.classList.remove("is-active");
      state.active = i;
      var item = state.items[i];
      if (!item) return hide();
      if (item.mark) item.mark.classList.add("is-active");
      tip.textContent = "";
      item.lines.forEach(function (line, n) {
        var p = document.createElement(n === 0 ? "strong" : "span");
        p.textContent = line;
        tip.appendChild(p);
      });
      tip.classList.add("is-visible");
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var left = Math.min(Math.max(item.cx - tw / 2, 0), state.width - tw);
      var top = item.cy - th - 12;
      if (top < 0) top = item.cy + 14;
      tip.style.left = left + "px";
      tip.style.top = top + "px";
      if (announce && live) live.textContent = item.lines.join(", ");
    }

    function hide() {
      var prev = state.items[state.active];
      if (prev && prev.mark) prev.mark.classList.remove("is-active");
      state.active = -1;
      tip.classList.remove("is-visible");
    }

    function locate(event) {
      var box = current.svg.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    }

    function onPointer(event) {
      if (!current) return;
      var p = locate(event);
      var i = state.pick ? state.pick(p.x, p.y) : nearest(state.items, p.x, p.y, 28);
      if (i !== state.active) {
        if (i < 0) hide();
        else setActive(i, false);
      }
    }

    plot.addEventListener("pointermove", onPointer);
    plot.addEventListener("pointerdown", onPointer);
    plot.addEventListener("pointerleave", function () {
      if (document.activeElement !== plot) hide();
    });
    plot.addEventListener("blur", hide);
    plot.addEventListener("keydown", function (event) {
      var n = state.items.length;
      if (!n) return;
      var i = state.active;
      var page = Math.max(1, Math.round(n / 10));
      switch (event.key) {
        case "ArrowRight": case "ArrowDown": i = i < 0 ? 0 : Math.min(n - 1, i + 1); break;
        case "ArrowLeft": case "ArrowUp": i = i < 0 ? 0 : Math.max(0, i - 1); break;
        case "PageDown": i = Math.min(n - 1, Math.max(0, i) + page); break;
        case "PageUp": i = Math.max(0, i - page); break;
        case "Home": i = 0; break;
        case "End": i = n - 1; break;
        case "Escape": hide(); return;
        default: return;
      }
      event.preventDefault();
      setActive(i, true);
    });

    // Redraw when the available width changes (rotation, window resize)
    var pending = false;
    function onResize() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        if (Math.abs(Math.floor(plot.clientWidth) - state.width) > 1) paint(false);
      });
    }
    if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(plot);
    else window.addEventListener("resize", onResize);

    // Grow the marks the first time the chart scrolls into view
    if (!state.drawn) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          io.disconnect();
          state.drawn = true;
          if (current) play(current.svg);
        }
      }, { threshold: 0.25 });
      io.observe(plot);
    }

    paint(false);

    return {
      repaint: function (animate) { paint(animate); },
      update: function () { if (state.update) state.update(); }
    };
  }

  /* ---------- Data tables (the text alternative for every chart) ---------- */
  function fillTable(fig, caption, head, rows, numeric) {
    var details = fig.querySelector(".chart__data");
    if (!details) return;
    var box = details.querySelector(".chart__table");
    box.textContent = "";
    var wrap = document.createElement("div");
    wrap.className = "table-scroll";
    if (rows.length > 12) {
      wrap.classList.add("table-scroll--tall");
      wrap.tabIndex = 0;
      wrap.setAttribute("role", "region");
      wrap.setAttribute("aria-label", caption);
    }
    var table = document.createElement("table");
    table.className = "data-table data-table--compact";
    var cap = document.createElement("caption");
    cap.textContent = caption;
    table.appendChild(cap);
    var thead = table.createTHead().insertRow();
    head.forEach(function (h, i) {
      var th = document.createElement("th");
      th.scope = "col";
      th.textContent = h;
      if (numeric[i]) th.className = "num";
      thead.appendChild(th);
    });
    var tbody = table.createTBody();
    rows.forEach(function (r) {
      var tr = tbody.insertRow();
      r.forEach(function (cell, i) {
        var c = document.createElement(i === 0 ? "th" : "td");
        if (i === 0) c.scope = "row";
        c.textContent = cell;
        if (numeric[i]) c.className = "num";
        tr.appendChild(c);
      });
    });
    wrap.appendChild(table);
    box.appendChild(wrap);
    details.hidden = false;
  }

  function setSource(fig, text) {
    var el = fig.querySelector(".chart__source");
    if (el && text) el.textContent = "Source: " + text + ".";
  }

  /* ---------- Schema checks: a chart is only drawn from the fields it expects ---------- */
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isArr(v, min) { return Array.isArray(v) && v.length >= (min || 1); }
  function every(list, keys) {
    return list.every(function (row) {
      return keys.every(function (k) {
        var type = k.split(":");
        var v = row[type[0]];
        if (type[1] === "n") return isNum(v);
        if (type[1] === "s") return typeof v === "string";
        if (type[1] === "b") return typeof v === "boolean";
        if (type[1] === "nb") return v === null || typeof v === "boolean";
        return v !== undefined;
      });
    });
  }

  /* ---------- Charts ---------- */
  var CHARTS = {};

  // 1. Sale price distribution, raw or log1p (exploratory)
  CHARTS.price = {
    needs: ["price"],
    valid: function (d) {
      var p = d.price;
      return p && isNum(p.mean) && isNum(p.median) && isNum(p.n_houses) &&
        isNum(p.min) && isNum(p.max) &&
        ["raw", "log1p"].every(function (k) {
          return p[k] && isArr(p[k].edges, 2) && isArr(p[k].counts) &&
            p[k].edges.length === p[k].counts.length + 1;
        });
    },
    setup: function (fig, d) {
      var p = d.price;
      var view = "raw";

      // The log bins are np.histogram's 50 equal steps from log1p(min) to log1p(max).
      // The stored edges are rounded to 4 decimals, which shifts the dollar
      // boundaries (the lowest one read $34,901), so the edges are rebuilt from the
      // exported min and max. If they ever disagree with the stored edges beyond
      // that rounding, the stored edges are used as they are.
      var logEdges = (function () {
        var stored = p.log1p.edges;
        var n = stored.length - 1;
        var lo = Math.log1p(p.min), hi = Math.log1p(p.max);
        var rebuilt = stored.map(function (_, i) { return i === n ? hi : lo + (hi - lo) * i / n; });
        var agrees = rebuilt.every(function (v, i) { return Math.abs(v - stored[i]) <= 0.00005 + 1e-9; });
        return agrees ? rebuilt : stored;
      })();

      function edgesFor(key) {
        return key === "log1p" ? logEdges : p.raw.edges;
      }

      function bins(key) {
        var e = edgesFor(key);
        return p[key].counts.map(function (c, i) {
          var lo = key === "raw" ? e[i] : Math.expm1(e[i]);
          var hi = key === "raw" ? e[i + 1] : Math.expm1(e[i + 1]);
          var lines = [money(lo) + " – " + money(hi), c + (c === 1 ? " house" : " houses")];
          if (key === "log1p") lines.push("log(1 + price) " + e[i].toFixed(2) + " – " + e[i + 1].toFixed(2));
          return { x0: e[i], x1: e[i + 1], count: c, lines: lines };
        });
      }

      var chart = mount(fig, function (width) {
        var key = view;
        var e = edgesFor(key);
        var ticks;
        if (key === "raw") {
          ticks = niceTicks(e[0], e[e.length - 1], width < 480 ? 4 : 7).ticks.map(function (v) {
            return { value: v, label: shortMoney(v) };
          });
        } else {
          // Ticks sit at round dollar prices, placed on the log1p axis
          ticks = [50000, 100000, 200000, 400000].map(function (v) {
            return { value: Math.log1p(v), label: shortMoney(v) };
          });
        }
        var layout = drawColumns(width, { bins: bins(key), domain: [e[0], e[e.length - 1]], ticks: ticks, markerRows: 2 });
        var narrow = width < 480;
        if (key === "raw") {
          drawMarker(layout.svg, layout, p.median, (narrow ? "Median " : "Median ") + shortMoney(p.median), 0, "end");
          drawMarker(layout.svg, layout, p.mean, "Mean " + shortMoney(p.mean), 1, "start");
        } else {
          drawMarker(layout.svg, layout, Math.log1p(p.median), "Median " + shortMoney(p.median), 0, "start");
        }
        return layout;
      });

      function table() {
        fillTable(fig,
          (view === "raw" ? "Sale price" : "log(1 + sale price)") + ": houses per bin, " + whole.format(p.n_houses) + " training houses",
          ["Price range", "Houses"],
          bins(view).map(function (b) { return [b.lines[0], String(b.count)]; }),
          [false, true]);
      }

      var buttons = fig.querySelectorAll("[data-scale]");
      buttons.forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (btn.dataset.scale === view) return;
          view = btn.dataset.scale;
          buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
          fig.classList.toggle("is-log", view === "log1p");
          chart.repaint(true);
          table();
        });
      });
      fig.querySelector(".chart__controls").hidden = false;
      table();
      setSource(fig, p.source);
    }
  };

  // 2. Missing values, split by what a blank was shown to mean
  CHARTS.missing = {
    needs: ["missing"],
    valid: function (d) {
      var m = d.missing;
      return m && isNum(m.n_houses) && isArr(m.columns) &&
        every(m.columns, ["column:s", "missing_count:n", "missing_pct:n", "blank_means_none:nb"]);
    },
    setup: function (fig, d) {
      var m = d.missing;

      function meaning(c) {
        if (c.blank_means_none === true) {
          return ["Blank means the feature is absent: " + c.partner_column + " is 0 in all " + c.missing_count + " blank rows"];
        }
        if (c.blank_means_none === false) {
          return ["Not confirmed: " + c.partner_column + " is 0 in " + c.blank_rows_where_partner_is_0 + " of " + c.missing_count + " blank rows"];
        }
        return ["Not checkable: no related column to test against"];
      }

      mount(fig, function (width) {
        return drawRows(width, {
          rows: m.columns.map(function (c) {
            return {
              label: c.column,
              value: c.missing_pct,
              cls: c.blank_means_none === true ? "" : "is-outline",
              lines: [c.column, c.missing_pct.toFixed(1) + "% blank (" + c.missing_count + " of " + m.n_houses + " houses)"].concat(meaning(c))
            };
          }),
          max: 100,
          rowHeight: 24,
          barHeight: 12,
          tickFormat: function (t) { return t + "%"; }
        });
      });

      fillTable(fig, "Blank values per column, all " + m.n_houses + " houses",
        ["Column", "Blank", "Share", "Interpretation"],
        m.columns.map(function (c) {
          var label = c.blank_means_none === true ? "Absent (verified)" :
            c.blank_means_none === false ? "Not confirmed" : "Not checkable";
          return [c.column, String(c.missing_count), c.missing_pct.toFixed(1) + "%", label];
        }),
        [false, true, true, false]);
      setSource(fig, m.source);
    }
  };

  // 3. Top correlations with sale price
  CHARTS.correlations = {
    needs: ["correlations"],
    valid: function (d) {
      return d.correlations && isArr(d.correlations.top) && every(d.correlations.top, ["column:s", "r:n"]);
    },
    setup: function (fig, d) {
      var top = d.correlations.top;
      mount(fig, function (width) {
        return drawRows(width, {
          rows: top.map(function (c) {
            return { label: c.column, value: c.r, lines: [c.column, "r = " + c.r.toFixed(3)] };
          }),
          max: 1,
          tickFormat: function (t) { return t.toFixed(1); },
          valueFormat: function (v) { return v.toFixed(2); }
        });
      });
      fillTable(fig, "Pearson correlation with sale price", ["Column", "r"],
        top.map(function (c) { return [c.column, c.r.toFixed(3)]; }), [false, true]);
      setSource(fig, d.correlations.source);
    }
  };

  // Shared scatter layout
  function drawScatter(width, cfg) {
    var narrow = width < 480;
    var m = { top: 14, right: 16, bottom: 32, left: 50 };
    var plotW = width - m.left - m.right;
    var height = Math.round(cfg.square ?
      Math.min(plotW, 480) + m.top + m.bottom :
      Math.max(280, Math.min(440, width * 0.6)));
    var svg = newSvg(width, height);
    var xt = niceTicks(cfg.x[0], cfg.x[1], narrow ? 4 : 6);
    var yt = niceTicks(cfg.y[0], cfg.y[1], 5);
    var x = linear(xt.lo, xt.hi, m.left, width - m.right);
    var y = linear(yt.lo, yt.hi, height - m.bottom, m.top);

    var grid = svgEl("g", { "class": "chart-gridlines" }, svg);
    yt.ticks.forEach(function (t) {
      svgEl("line", { x1: m.left, x2: width - m.right, y1: y(t), y2: y(t) }, grid);
      svgText(svg, m.left - 8, y(t) + 4, cfg.yFormat(t), "chart-tick", "end");
    });
    xt.ticks.forEach(function (t) {
      svgEl("line", { x1: x(t), x2: x(t), y1: m.top, y2: height - m.bottom }, grid);
      svgText(svg, x(t), height - m.bottom + 18, cfg.xFormat(t), "chart-tick", "middle");
    });
    svgEl("line", { x1: m.left, x2: width - m.right, y1: height - m.bottom, y2: height - m.bottom, "class": "chart-axis" }, svg);
    svgEl("line", { x1: m.left, x2: m.left, y1: m.top, y2: height - m.bottom, "class": "chart-axis" }, svg);

    return { svg: svg, x: x, y: y, m: m, width: width, height: height, xt: xt, yt: yt };
  }

  function drawPoints(layout, points, parent) {
    var x0 = layout.m.left, span = layout.width - layout.m.left - layout.m.right;
    return points.map(function (pt) {
      var cx = layout.x(pt.x), cy = layout.y(pt.y);
      var mark = svgEl("circle", { cx: cx, cy: cy, r: pt.r || 3, "class": "chart-point" + (pt.cls ? " " + pt.cls : "") }, parent);
      delay(mark, (cx - x0) / span * 520);
      return { cx: cx, cy: cy, mark: mark, lines: pt.lines, data: pt.data };
    });
  }

  // 4. Living area vs sale price, with the two houses removed from training
  CHARTS.livingArea = {
    needs: ["livingArea"],
    valid: function (d) {
      var a = d.livingArea;
      return a && isArr(a.points) && isArr(a.removed_ids, 2) &&
        every(a.points, ["id:n", "area:n", "price:n", "quality:n", "condition:s", "removed:b"]);
    },
    setup: function (fig, d) {
      var a = d.livingArea;
      var sorted = a.points.slice().sort(function (p, q) { return p.area - q.area || p.price - q.price; });
      var maxArea = Math.max.apply(null, sorted.map(function (p) { return p.area; }));
      var maxPrice = Math.max.apply(null, sorted.map(function (p) { return p.price; }));

      mount(fig, function (width) {
        var layout = drawScatter(width, {
          x: [0, maxArea], y: [0, maxPrice],
          xFormat: function (t) { return whole.format(t); },
          yFormat: shortMoney
        });
        var g = svgEl("g", { "class": "chart-points" }, layout.svg);
        // Excluded houses are drawn last so they sit on top
        var ordered = sorted.filter(function (p) { return !p.removed; }).concat(sorted.filter(function (p) { return p.removed; }));
        var items = drawPoints(layout, ordered.map(function (p) {
          return {
            x: p.area, y: p.price, r: p.removed ? 6 : 3,
            cls: p.removed ? "is-flagged" : "",
            lines: ["House " + p.id + (p.removed ? " · removed from training" : ""),
              whole.format(p.area) + " sq ft · " + money(p.price),
              "Overall quality " + p.quality + " · " + p.condition + " sale"],
            data: p
          };
        }), g);
        items.forEach(function (it) {
          if (it.data.removed) {
            svgText(layout.svg, it.cx - 10, it.cy - 10, "House " + it.data.id, "chart-annotation", "end");
          }
        });
        // Keyboard order: left to right by living area
        items.sort(function (p, q) { return p.data.area - q.data.area || p.data.price - q.data.price; });
        return { svg: layout.svg, items: items };
      });

      var big = sorted.filter(function (p) { return p.area > 4000; });
      fillTable(fig, "Houses over 4,000 sq ft in the training set (all " + a.points.length + " points are in the JSON file)",
        ["House", "Living area", "Sale price", "Sale condition", "In training"],
        big.map(function (p) {
          return [String(p.id), whole.format(p.area) + " sq ft", money(p.price), p.condition, p.removed ? "Removed" : "Kept"];
        }),
        [false, true, true, false, false]);
      setSource(fig, a.source);
    }
  };

  // 5. Lot area: quartiles and the 1.5 × IQR limits on a log scale
  CHARTS.lotArea = {
    needs: ["lotArea"],
    valid: function (d) {
      var l = d.lotArea;
      return l && l.summary && isNum(l.q1) && isNum(l.q3) && isNum(l.upper_whisker_limit) &&
        isNum(l.n_above_whisker) && isNum(l.summary.min) && isNum(l.summary["50%"]) &&
        isNum(l.summary.max) && isNum(l.summary.count) && isArr(l.largest) &&
        every(l.largest, ["id:n", "lot_area:n", "price:n", "neighborhood:s"]);
    },
    setup: function (fig, d) {
      var l = d.lotArea;
      var iqr = l.q3 - l.q1;
      var lower = l.q1 - 1.5 * iqr;        // computed the same way as the exported upper limit
      var sqft = function (v) { return whole.format(v) + " sq ft"; };

      mount(fig, function (width) {
        var narrow = width < 480;
        var m = { top: 30, right: 18, bottom: 32, left: 18 };
        var height = 150;
        var svg = newSvg(width, height);
        var lx = function (v) { return Math.log(v) / Math.LN10; };
        var x = linear(lx(1000), lx(300000), m.left, width - m.right);
        var X = function (v) { return x(lx(v)); };
        var cy = 78;

        var grid = svgEl("g", { "class": "chart-gridlines" }, svg);
        [1000, 3000, 10000, 30000, 100000, 300000].forEach(function (t) {
          svgEl("line", { x1: X(t), x2: X(t), y1: m.top - 8, y2: height - m.bottom }, grid);
          svgText(svg, X(t), height - m.bottom + 18, whole.format(t / 1000) + "k", "chart-tick", "middle");
        });
        svgEl("line", { x1: m.left, x2: width - m.right, y1: height - m.bottom, y2: height - m.bottom, "class": "chart-axis" }, svg);

        var g = svgEl("g", { "class": "chart-bars" }, svg);
        // Reach lines from the box out to each limit
        svgEl("line", { x1: X(lower), x2: X(l.q1), y1: cy, y2: cy, "class": "chart-reach" }, g);
        svgEl("line", { x1: X(l.q3), x2: X(l.upper_whisker_limit), y1: cy, y2: cy, "class": "chart-reach" }, g);
        var box = svgEl("rect", { x: X(l.q1), y: cy - 14, width: X(l.q3) - X(l.q1), height: 28, "class": "chart-box" }, g);
        var med = svgEl("line", { x1: X(l.summary["50%"]), x2: X(l.summary["50%"]), y1: cy - 14, y2: cy + 14, "class": "chart-median" }, g);
        var lowMark = svgEl("line", { x1: X(lower), x2: X(lower), y1: cy - 10, y2: cy + 10, "class": "chart-limit" }, g);
        var upMark = svgEl("line", { x1: X(l.upper_whisker_limit), x2: X(l.upper_whisker_limit), y1: cy - 10, y2: cy + 10, "class": "chart-limit" }, g);
        svgText(svg, X(l.upper_whisker_limit) + 4, m.top - 12, narrow ? "Upper limit" : "Upper limit (Q3 + 1.5 × IQR)", "chart-marker__label", "start");
        svgText(svg, (X(l.q1) + X(l.q3)) / 2, m.top - 12, "Middle 50%", "chart-marker__label", "middle");

        var minDot = svgEl("circle", { cx: X(l.summary.min), cy: cy, r: 4, "class": "chart-point is-outlier" }, g);
        var largest = l.largest.slice().sort(function (p, q) { return p.lot_area - q.lot_area; });
        var dots = largest.map(function (p, i) {
          var c = svgEl("circle", { cx: X(p.lot_area), cy: cy, r: 5, "class": "chart-point is-outlier" }, g);
          delay(c, 300 + i * 60);
          return c;
        });
        [box, med, lowMark, upMark].forEach(function (el) { delay(el, 0); });

        var items = [
          { cx: X(l.summary.min), cy: cy, mark: minDot, lines: ["Smallest lot", sqft(l.summary.min), "Below the lower limit"] },
          { cx: X(lower), cy: cy - 10, mark: lowMark, lines: ["Lower limit", sqft(Math.round(lower)), "Q1 − 1.5 × IQR"] },
          { cx: X(l.q1), cy: cy - 14, mark: box, lines: ["First quartile (Q1)", sqft(l.q1), "A quarter of lots are smaller"] },
          { cx: X(l.summary["50%"]), cy: cy - 14, mark: med, lines: ["Median", sqft(l.summary["50%"])] },
          { cx: X(l.q3), cy: cy - 14, mark: box, lines: ["Third quartile (Q3)", sqft(l.q3), "A quarter of lots are larger"] },
          { cx: X(l.upper_whisker_limit), cy: cy - 10, mark: upMark, lines: ["Upper limit", sqft(Math.round(l.upper_whisker_limit)), l.n_above_whisker + " lots are larger"] }
        ].concat(largest.map(function (p, i) {
          return { cx: X(p.lot_area), cy: cy, mark: dots[i], lines: ["House " + p.id, sqft(p.lot_area) + " · " + money(p.price), p.neighborhood] };
        }));
        return { svg: svg, items: items };
      });

      var rows = [
        ["Smallest lot", sqft(l.summary.min)],
        ["Lower limit (Q1 − 1.5 × IQR)", sqft(Math.round(lower))],
        ["First quartile (Q1)", sqft(l.q1)],
        ["Median", sqft(l.summary["50%"])],
        ["Third quartile (Q3)", sqft(l.q3)],
        ["Upper limit (Q3 + 1.5 × IQR)", sqft(Math.round(l.upper_whisker_limit))],
        ["Lots above the upper limit", String(l.n_above_whisker)],
        ["Largest lot", sqft(l.summary.max)]
      ].concat(l.largest.map(function (p) {
        return ["House " + p.id + " (" + p.neighborhood + ")", sqft(p.lot_area)];
      }));
      fillTable(fig, "Lot area, " + whole.format(l.summary.count) + " training houses", ["Statistic", "Value"], rows, [false, true]);
      fig.querySelectorAll("[data-lot]").forEach(function (el) {
        var key = el.dataset.lot;
        if (key === "above") el.textContent = String(l.n_above_whisker);
        if (key === "upper") el.textContent = sqft(Math.round(l.upper_whisker_limit));
        if (key === "lower") el.textContent = sqft(Math.round(lower));
      });
      setSource(fig, l.source);
    }
  };

  /* ---------- Evaluation charts share one tolerance setting ---------- */
  var tolerance = { value: 10000, charts: [] };

  function setupTolerance(predictions) {
    var box = document.querySelector("[data-tolerance]");
    if (!box) return;
    var input = box.querySelector("input[type=range]");
    var output = box.querySelector("output");
    var abs = predictions.map(function (p) { return Math.abs(p.predicted - p.actual); });

    function render() {
      tolerance.value = Number(input.value);
      var n = abs.filter(function (e) { return e <= tolerance.value; }).length;
      input.setAttribute("aria-valuetext", "plus or minus " + money(tolerance.value));
      output.textContent = percent(n / abs.length) + " of the " + abs.length +
        " test houses (" + n + ") were predicted within ±" + money(tolerance.value) + ".";
      tolerance.charts.forEach(function (c) { c.update(); });
    }

    input.addEventListener("input", render);
    box.hidden = false;
    render();
  }

  // 6. Actual vs predicted, with the y = x line and the tolerance band
  CHARTS.actualPredicted = {
    needs: ["predictions"],
    valid: function (d) {
      return d.predictions && isArr(d.predictions.predictions) &&
        every(d.predictions.predictions, ["id:n", "actual:n", "predicted:n", "error:n", "quality:n", "area:n", "neighborhood:s"]);
    },
    setup: function (fig, d) {
      var preds = d.predictions.predictions;
      var top = Math.max.apply(null, preds.map(function (p) { return Math.max(p.actual, p.predicted); }));

      var chart = mount(fig, function (width) {
        var layout = drawScatter(width, { x: [0, top], y: [0, top], square: true, xFormat: shortMoney, yFormat: shortMoney });
        var svg = layout.svg, x = layout.x, y = layout.y, m = layout.m;
        var lo = layout.xt.lo, hi = Math.min(layout.xt.hi, layout.yt.hi);
        var clipId = "clip-ap-" + Math.random().toString(36).slice(2, 8);
        var clip = svgEl("clipPath", { id: clipId }, svgEl("defs", {}, svg));
        svgEl("rect", { x: m.left, y: m.top, width: width - m.left - m.right, height: layout.height - m.top - m.bottom }, clip);
        var band = svgEl("polygon", { "class": "chart-band", "clip-path": "url(#" + clipId + ")" }, svg);
        var diag = svgEl("line", { x1: x(lo), y1: y(lo), x2: x(hi), y2: y(hi), "class": "chart-diagonal" }, svg);
        svgText(svg, x(hi) - 4, y(hi) + 14, "y = x", "chart-annotation", "end");
        delay(diag, 0);

        var g = svgEl("g", { "class": "chart-points" }, svg);
        var items = drawPoints(layout, preds.map(function (p) {
          return {
            x: p.actual, y: p.predicted, r: 3.5,
            lines: ["House " + p.id + " · " + p.neighborhood,
              "Actual " + money(p.actual) + " · predicted " + money(p.predicted),
              "Error " + signedMoney(p.error) + (p.error > 0 ? " (over)" : p.error < 0 ? " (under)" : "")],
            data: p
          };
        }), g);
        items.sort(function (p, q) { return p.data.actual - q.data.actual; });

        function update() {
          var t = tolerance.value;
          band.setAttribute("points", [
            [x(lo), y(lo + t)], [x(hi), y(hi + t)], [x(hi), y(hi - t)], [x(lo), y(lo - t)]
          ].map(function (pt) { return pt.join(","); }).join(" "));
          items.forEach(function (it) {
            it.mark.classList.toggle("is-muted", Math.abs(it.data.predicted - it.data.actual) > t);
          });
        }
        update();
        return { svg: svg, items: items, update: update };
      });
      tolerance.charts.push(chart);

      fillTable(fig, "Test-set predictions, " + preds.length + " houses (error = predicted − actual)",
        ["House", "Actual", "Predicted", "Error"],
        preds.slice().sort(function (p, q) { return p.id - q.id; }).map(function (p) {
          return [String(p.id), money(p.actual), money(p.predicted), signedMoney(p.error)];
        }),
        [false, true, true, true]);
      setSource(fig, d.predictions.source);
    }
  };

  // 7. Prediction errors, binned in $10,000 steps
  CHARTS.errors = {
    needs: ["predictions"],
    valid: CHARTS.actualPredicted.valid,
    setup: function (fig, d) {
      var preds = d.predictions.predictions;
      var STEP = 10000;
      var errors = preds.map(function (p) { return p.predicted - p.actual; });
      var start = Math.floor(Math.min.apply(null, errors) / STEP) * STEP;
      var end = Math.ceil(Math.max.apply(null, errors) / STEP) * STEP;
      var bins = [];
      for (var lo = start; lo < end; lo += STEP) {
        bins.push({ x0: lo, x1: lo + STEP, count: 0 });
      }
      errors.forEach(function (e) {
        var i = Math.min(bins.length - 1, Math.floor((e - start) / STEP));
        bins[i].count++;
      });
      bins.forEach(function (b) {
        var side = b.x1 <= 0 ? "predicted below the sale price" : b.x0 >= 0 ? "predicted above the sale price" : "";
        b.lines = [signedMoney(b.x0) + " to " + signedMoney(b.x1), b.count + (b.count === 1 ? " house" : " houses")];
        if (side) b.lines.push(side);
      });

      var chart = mount(fig, function (width) {
        var ticks = niceTicks(start, end, width < 480 ? 4 : 7).ticks.map(function (v) {
          return { value: v, label: v === 0 ? "$0" : (v > 0 ? "+" : "") + shortMoney(v) };
        });
        var layout = drawColumns(width, { bins: bins, domain: [start, end], ticks: ticks, markerRows: 1 });
        var zero = layout.x(0);
        svgEl("line", { x1: zero, x2: zero, y1: layout.m.top, y2: layout.height - layout.m.bottom, "class": "chart-zero" }, layout.svg);
        var left = drawMarker(layout.svg, layout, 0, "", 0);
        var right = drawMarker(layout.svg, layout, 0, "", 0);
        var label = svgText(left, 0, 14, "", "chart-marker__label", "middle");

        function update() {
          var t = tolerance.value;
          [[left, -t], [right, t]].forEach(function (pair) {
            var px = layout.x(Math.max(start, Math.min(end, pair[1])));
            var line = pair[0].querySelector("line");
            line.setAttribute("x1", px);
            line.setAttribute("x2", px);
            line.setAttribute("y1", 20);
          });
          label.setAttribute("x", zero);
          label.textContent = "±" + shortMoney(t);
          layout.items.forEach(function (it) {
            if (it.mark) it.mark.classList.toggle("is-muted", it.bin.x0 < -t || it.bin.x1 > t);
          });
        }
        update();
        layout.update = update;
        return layout;
      });
      tolerance.charts.push(chart);

      fillTable(fig, "Prediction errors in $10,000 bins, " + preds.length + " test houses",
        ["Error (predicted − actual)", "Houses"],
        bins.map(function (b) { return [b.lines[0], String(b.count)]; }),
        [false, true]);
      setSource(fig, d.predictions.source);
    }
  };

  // 8. CatBoost vs the Linear Regression baseline on the test set
  CHARTS.comparison = {
    needs: ["metrics"],
    valid: function (d) {
      var m = d.metrics;
      return m && m.test && m.test.catboost && m.test_baseline &&
        ["mae", "rmse", "r2"].every(function (k) { return isNum(m.test.catboost[k]) && isNum(m.test_baseline[k]); });
    },
    setup: function (fig, d) {
      var cat = d.metrics.test.catboost, base = d.metrics.test_baseline;
      var groups = [
        { key: "mae", name: "Mean absolute error", hint: "lower is better", fmt: money, max: Math.max(cat.mae, base.mae), tick: shortMoney },
        { key: "rmse", name: "Root mean squared error", hint: "lower is better", fmt: money, max: Math.max(cat.rmse, base.rmse), tick: shortMoney },
        { key: "r2", name: "R²", hint: "higher is better", fmt: function (v) { return v.toFixed(3); }, max: 1, tick: function (t) { return t.toFixed(1); } }
      ];

      mount(fig, function (width) {
        var narrow = width < 480;
        var labelW = narrow ? 124 : 136;       // room for "Linear Regression" in the mono label face
        var valueW = narrow ? 62 : 74;
        var blockH = 92;
        var height = groups.length * blockH + 4;
        var svg = newSvg(width, height);
        var items = [];
        var barsG = svgEl("g", { "class": "chart-bars" }, svg);
        groups.forEach(function (gr, gi) {
          var top = gi * blockH;
          svgText(svg, 0, top + 14, gr.name + " · " + gr.hint, "chart-group-title", "start");
          var xt = niceTicks(0, gr.max, narrow ? 2 : 4);
          var x = linear(0, xt.hi, labelW, width - valueW);
          [["CatBoost", cat[gr.key], ""], ["Linear Regression", base[gr.key], "is-muted"]].forEach(function (row, ri) {
            var cy = top + 34 + ri * 24;
            svgText(svg, labelW - 10, cy + 4, row[0], "chart-row-label", "end");
            var mark = svgEl("rect", { x: labelW, y: cy - 7, width: Math.max(1, x(row[1]) - labelW), height: 14, "class": "chart-bar chart-bar--h" + (row[2] ? " " + row[2] : "") }, barsG);
            delay(mark, gi * 120 + ri * 60);
            svgText(svg, x(row[1]) + 6, cy + 4, gr.fmt(row[1]), "chart-value", "start");
            items.push({ cx: x(row[1]), cy: cy - 7, mark: mark, lines: [row[0], gr.name + ": " + gr.fmt(row[1])], y0: cy - 12, y1: cy + 12 });
          });
          svgEl("line", { x1: labelW, x2: labelW, y1: top + 22, y2: top + 70, "class": "chart-axis" }, svg);
          svgText(svg, x(xt.hi), top + 84, gr.tick(xt.hi), "chart-tick", "middle");
          svgText(svg, labelW, top + 84, gr.tick(0), "chart-tick", "middle");
        });
        return {
          svg: svg, items: items,
          pick: function (px, py) {
            for (var i = 0; i < items.length; i++) if (py >= items[i].y0 && py < items[i].y1) return i;
            return -1;
          }
        };
      });

      fillTable(fig, "Test set, " + d.metrics.test.n_houses + " houses, scored once",
        ["Metric", "CatBoost", "Linear Regression"],
        groups.map(function (gr) { return [gr.name, gr.fmt(cat[gr.key]), gr.fmt(base[gr.key])]; }),
        [false, true, true]);
      setSource(fig, d.metrics.test.source + "; baseline: " + d.metrics.test_baseline.source);
    }
  };

  // 9. Permutation importance with its spread across shuffles
  CHARTS.importance = {
    needs: ["importance"],
    valid: function (d) {
      return d.importance && isArr(d.importance.top) && every(d.importance.top, ["column:s", "mae_increase:n", "std:n"]);
    },
    setup: function (fig, d) {
      var top = d.importance.top;
      var max = Math.max.apply(null, top.map(function (r) { return r.mae_increase + r.std; }));
      mount(fig, function (width) {
        return drawRows(width, {
          rows: top.map(function (r) {
            return {
              label: r.column, value: r.mae_increase,
              lo: Math.max(0, r.mae_increase - r.std), hi: r.mae_increase + r.std,
              lines: [r.column, "MAE rises by " + money(r.mae_increase), "Spread across 10 shuffles ± " + money(r.std)]
            };
          }),
          max: max,
          tickFormat: shortMoney,
          valueFormat: money
        });
      });
      fillTable(fig, "Increase in test MAE when a column is shuffled (10 repeats)",
        ["Column", "MAE increase", "Spread (± std)"],
        top.map(function (r) { return [r.column, money(r.mae_increase), "± " + money(r.std)]; }),
        [false, true, true]);
      setSource(fig, d.importance.source);
    }
  };

  /* ---------- Loading ---------- */
  var cache = {};
  function load(name) {
    if (!cache[name]) {
      cache[name] = fetch(DATA_DIR + FILES[name]).then(function (res) {
        if (!res.ok) throw new Error(FILES[name] + ": HTTP " + res.status);
        return res.json();
      });
    }
    return cache[name];
  }

  function status(fig, message) {
    var plot = fig.querySelector(".chart__plot");
    var p = plot.querySelector(".chart__status") || plot.appendChild(document.createElement("p"));
    p.className = "chart__status";
    p.textContent = message;
  }

  function init() {
    var figures = document.querySelectorAll("[data-chart]");
    if (!figures.length || !window.fetch || !window.Promise) return;

    figures.forEach(function (fig) {
      var spec = CHARTS[fig.dataset.chart];
      if (!spec) return;
      Promise.all(spec.needs.map(load)).then(function (results) {
        var data = {};
        spec.needs.forEach(function (name, i) { data[name] = results[i]; });
        if (!spec.valid(data)) {
          status(fig, "The chart data is not in the expected format, so this chart is not shown.");
          return;
        }
        spec.setup(fig, data);
        fig.classList.add("is-ready");
        if (fig.dataset.chart === "actualPredicted") setupTolerance(data.predictions.predictions);
      }).catch(function () {
        status(fig, "The chart data could not be loaded. The summary above still describes it.");
      });
    });
  }

  init();
})();
