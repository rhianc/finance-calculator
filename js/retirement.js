import { DEFAULTS, normalize, project, spendTax, contributionSplit, takeHome, retireNeed, lifeNeed, planSpend, planCheck, adaptivePlan } from "./retirement-model.js?v=23";

// Nothing is remembered between visits: every visit starts from the defaults (or a shared link's values).
// Earlier versions saved the plan in the browser; that copy is cleared on load.
const OLD_STORAGE = ["retire-plan-v2", "retire-plan-v1", "retire-plan"];

const SCENES = [
  { key: "bad", color: "--good" },
  { key: "below", color: "--house" },
];

export function boot(root) {
  const $ = (id) => root.querySelector("#" + id);
  const chart = $("pathChart");
  const startChart = $("startChart");
  const fold = $("balance-fold");
  let frame = 0;
  let lastPaths = null;
  let lastStart = null;
  let hoverAge = null;
  let conf = 0;
  let unit = "$";
  const sweep = makeSweeper((res) => {
    lastStart = res;
    drawStartNow();
  });

  function readRaw() {
    return {
      age: fieldNum("age"),
      retireAge: sliderNum("retire"),
      endAge: fieldNum("end"),
      balance: fieldNum("balance-amt"),
      salary: fieldNum("salary"),
      savePct: sliderNum("savepct"),
      raisePct: fieldNum("raise"),
      mega: pressed("mega"),
      ssAnnual: fieldNum("ss"),
      ssAge: fieldNum("ss-age"),
      inflationPct: fieldNum("inflation"),
      avgPct: fieldNum("ret-avg"),
      account: pressed("account"),
      filing: pressed("filing"),
      housingMonth: fieldNum("housing"),
      otherSaveMonth: fieldNum("other-save"),
      home: pressed("home"),
      ownCarry: fieldNum("own-carry"),
      spendAdjust: signedNum($("spend-adj").value),
    };
  }

  function pressed(name) {
    const el = root.querySelector("[data-" + name + '][aria-pressed="true"]');
    return el ? el.getAttribute("data-" + name) : DEFAULTS[name];
  }

  function setChoice(name, value) {
    root.querySelectorAll("[data-" + name + "]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-" + name) === value ? "true" : "false");
    });
  }

  function sliderNum(id) {
    return parseFloat($(id).value);
  }

  function fieldNum(id) {
    return parseMoney($(id).value);
  }

  function applyNormalized(input, fromSlider) {
    const set = (id, value) => {
      const el = $(id);
      if (!el || document.activeElement === el) return;
      el.value = value;
    };
    set("age", String(input.age));
    const retire = $("retire");
    retire.min = String(input.age + 1);
    retire.max = "80";
    if (document.activeElement !== retire) retire.value = String(input.retireAge);
    set("end", String(input.endAge));
    setMoney("balance-amt", input.balance);
    setMoney("salary", input.salary);
    set("raise", trimNum(input.raise * 100));
    setChoice("mega", input.mega ? "1" : "0");
    setMoney("ss", input.ssAnnual);
    set("ss-age", String(input.ssAge));
    set("inflation", trimNum(input.inflation * 100));
    set("ret-avg", trimNum(input.avg * 100));
    setChoice("account", input.account);
    setChoice("filing", input.filing);
    setMoney("housing", input.housingMonth);
    setMoney("other-save", input.otherSaveMonth);
    setChoice("home", input.home);
    setMoney("own-carry", input.ownCarry);
    $("own-carry-field").hidden = input.home !== "own";
    const adj = $("spend-adj");
    if (document.activeElement !== adj) adj.value = signedText(input.spendAdjust);
    fitSlider("savepct", Math.round(input.savePct * 100), [40, 60, 100]);
    if (fromSlider === "savepct") $("savepct").value = String(Math.round(input.savePct * 100));
    paintSlider($("retire"));
    paintSlider($("savepct"));
  }

  function commitKnob(id, n) {
    const el = $(id);
    if (!el) return;
    if (id === "savepct") {
      const ceilings = [40, 60, 100];
      let cap = ceilings[ceilings.length - 1];
      for (const c of ceilings) {
        if (n <= c) {
          cap = c;
          break;
        }
      }
      el.max = String(cap);
    }
    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    const step = parseFloat(el.step) || 1;
    let v = Math.min(max, Math.max(min, n));
    v = min + Math.round((v - min) / step) * step;
    v = Math.min(max, Math.max(min, v));
    el.value = String(Math.round(v * 1000) / 1000);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fitSlider(id, value, ceilings) {
    const el = $(id);
    let max = ceilings[ceilings.length - 1];
    for (const c of ceilings) {
      if (value <= c) {
        max = c;
        break;
      }
    }
    el.max = String(max);
    el.value = String(Math.min(value, max));
  }

  function sliderLabel(el) {
    const val = parseFloat(el.value);
    if (el.id === "savepct") return trimNum(val) + "%";
    return String(Math.round(val));
  }

  function paintSlider(el) {
    if (!el) return;
    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    const val = parseFloat(el.value);
    const pct = max > min ? (val - min) / (max - min) : 0;
    const box = el.closest(".vrange");
    if (box) box.style.setProperty("--fill", String(pct));
    const out = $(el.id + "-out");
    if (!out || document.activeElement === out) return;
    out.value = sliderLabel(el);
  }

  let queued = false;
  let chartBusy = false;
  let chartAgain = false;
  let liveTimer = 0;
  function schedule() {
    clearTimeout(liveTimer);
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      render();
    });
  }

  function scheduleLive() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(schedule, 100);
  }

  function render() {
    let input;
    try {
      const raw = readRaw();
      if (document.activeElement && document.activeElement.id === "savepct") {
        raw.savePct = parseFloat($("savepct").value);
      }
      input = normalize(raw);
      // Spending is the life you have now, plus whatever change you typed.
      input = { ...input, annualSpend: planSpend(input) };
      const editing = document.activeElement;
      const skipFormat = editing && editing.classList && editing.classList.contains("money");
      applyNormalized(input, null);
    } catch (err) {
      $("path-note").textContent = "Could not read the inputs. " + (err && err.message ? err.message : "");
      return;
    }
    if (chartBusy) {
      chartAgain = true;
      return;
    }
    chartBusy = true;
    const snap = input;
    $("path-note").textContent = "Counting…";
    requestAnimationFrame(() => {
      try {
        const paths = project(snap);
        lastPaths = { paths, input: snap };
        sweep(snap);
        if (fold.open && !draw(chart, paths, snap)) {
          requestAnimationFrame(() => draw(chart, paths, snap));
        }
        paintReadout(paths, snap);
        const verdict = paths
          .map((p) => (p.depletedAge == null ? p.name + " lasts" : p.name + " runs out at " + ageLabel(p.depletedAge)))
          .join(". ");
        chart.setAttribute("aria-label", "Balance from " + snap.age + " to " + snap.endAge + ". " + verdict + ".");
        scheduleSave(snap);
      } catch (err) {
        $("path-note").textContent = "The chart failed. " + (err && err.message ? err.message : "");
      }
      chartBusy = false;
      if (chartAgain) {
        chartAgain = false;
        render();
      }
    });
  }

  function paintReadout(paths, input) {
    const cautious = paths.find((p) => p.key === "bad");
    const median = cautious;
    $("burn-avg").textContent = money(cautious.burn);
    $("burn-mo").textContent = money(cautious.burn / 12) + " a month";
    const plan = input.annualSpend;
    const now = takeHome(input, 0, input.age + 1);
    const need = retireNeed(input, now.live);
    const lastYear = Math.max(0, input.retireAge - input.age - 1);
    const later = retireNeed(input, takeHome(input, lastYear, input.retireAge).live);
    $("burn-avg").textContent = money(plan);
    $("burn-mo").textContent = money(plan / 12) + " a month after tax, in today's dollars";
    const rows = [
      ["Salary", now.salary],
      ["Federal and California income tax", -(now.federal + now.state)],
      ["Payroll tax", -now.payroll],
      ["Into the 401(k)", -now.saved],
    ];
    if (now.other > 0) rows.push(["Saved outside the 401(k)", -now.other]);
    rows.push(["You live on now", now.live, "total"]);
    if (input.home === "own") {
      rows.push(["Less today's housing", -need.housingNow]);
      rows.push(["Plus the paid-off home", need.housingThen]);
    }
    const base = Math.round(need.need / 1000) * 1000;
    if (input.spendAdjust) {
      rows.push(["Same life in retirement", base, "total"]);
      rows.push(["Your change", input.spendAdjust]);
    }
    rows.push(["What you'll spend", plan, "total"]);
    const box = $("live-steps");
    box.innerHTML = "";
    rows.forEach(([label, v, total]) => {
      const row = document.createElement("div");
      row.className = "step" + (total ? " total" : "");
      const e = document.createElement("span");
      e.className = "expr";
      e.textContent = label;
      const val = document.createElement("span");
      val.className = "val";
      val.textContent = (v < 0 ? "− " : !total && label !== "Salary" ? "+ " : "") + money(Math.abs(v));
      row.append(e, val);
      box.appendChild(row);
    });
    if (lastYear > 0 && later.need - need.need > 2000) {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = "If your spending grows with your raises, the life you have at " + (input.retireAge - 1) +
        " would take about " + money(Math.round(later.need / 1000) * 1000) + ".";
      box.appendChild(note);
    }

    const check = planCheck(input);
    const pct = Math.round(check.success * 100);
    const ok = check.success >= 0.9;
    $("burn-avg").classList.toggle("pos", ok);
    $("burn-avg").classList.toggle("neg", !ok);
    const ways = [];
    if (!ok) {
      if (check.retireAt !== Infinity && check.retireAt != null) ways.push("retire at " + check.retireAt);
      if (check.saveAt != null && !check.saveCapped) ways.push("save " + Math.round(check.saveAt * 100) + "% of pay");
      ways.push("spend " + money(cautious.burn));
    }
    const quick = $("quick");
    quick.className = "quick " + (ok ? "pos" : "neg");
    quick.textContent = (ok ? "Lasts: " : "Falls short: ") + money(plan) + " a year lasts to " + input.endAge +
      " in " + pct + " of 100 markets. The plan is 90. " + (ok ? "Up to " + money(cautious.burn) + " would." : "Fix: " + ways.join(", or ") + "." +
        (check.saveCapped ? " Saving more can't help: the 401(k) is full" + (input.mega ? "." : " unless you use the mega backdoor.") : ""));

    paths.forEach((p) => {
      $(p.key + "-burn").textContent = money(p.burn);
      $(p.key + "-nest").textContent = money(p.nest);
    });

    $("path-note").textContent = "Dotted line is retirement.";

    const year = median.points.find((pt) => Math.abs(pt.age - (input.age + 1)) < 0.02) || median.points[1];
    const savedNow = contributionSplit(input, 0, input.age + 1);
    $("year-now").textContent = money(input.balance);
    $("year-add").textContent = money(savedNow.total);
    $("year-next").textContent = year ? money(year.balance) : "—";
    $("year-real").textContent = (median.real * 100).toFixed(1) + "%";
    $("year-compound").textContent = (median.compound * 100).toFixed(1) + "%";
    $("save-note").textContent = saveSentence(input, savedNow);
    $("tax-note").textContent = taxSentence(input, spendTax(input, median.taxShare));
  }

  function draw(canvas, paths, input) {
    const parent = canvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w < 10 || h < 10) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const style = getComputedStyle(document.documentElement);
    const ink = style.getPropertyValue("--muted").trim() || "#6b625b";
    const line = style.getPropertyValue("--line").trim() || "#e4dcd0";
    const colors = {
      bad: style.getPropertyValue("--good").trim(),
      below: style.getPropertyValue("--house").trim(),
    };

    // Only the lines you plan on are drawn. The median is a note in the cards, not a line.
    let maxV = 1;
    paths.filter((p) => p.key !== "mid").forEach((p) => {
      p.points.forEach((pt) => {
        if (pt.balance > maxV) maxV = pt.balance;
      });
    });
    const million = 1000000;
    maxV = Math.max(million, Math.ceil(maxV / million) * million);

    const padL = w < 420 ? 42 : 48;
    const padR = 22;
    const padT = 12;
    const padB = 22;
    const xOf = (age) => padL + ((age - input.age) / (input.endAge - input.age)) * (w - padL - padR);
    const yOf = (v) => padT + (1 - v / maxV) * (h - padT - padB);

    ctx.font = "11px system-ui, sans-serif";
    ctx.lineWidth = 1;
    ctx.strokeStyle = line;
    ctx.fillStyle = ink;
    const plotH = h - padT - padB;
    const millionGap = plotH / (maxV / million);
    let labelEvery = 1;
    while (millionGap * labelEvery < 11 && labelEvery < 20) labelEvery += 1;
    for (let v = 0; v <= maxV + 1; v += million) {
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      if ((v / million) % labelEvery === 0) {
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(v === 0 ? "$0" : moneyShort(v), padL - 6, y);
      }
    }

    const xr = xOf(input.retireAge);
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(xr, padT);
    ctx.lineTo(xr, h - padB);
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const fiveYears = [];
    const firstTick = Math.ceil(input.age / 10) * 10;
    const lastTick = Math.floor(input.endAge / 10) * 10;
    for (let age = firstTick; age <= lastTick; age += 10) fiveYears.push(age);
    const placed = [];
    const paintAge = (age) => {
      const x = xOf(age);
      if (placed.some((px) => Math.abs(px - x) < 16)) return;
      placed.push(x);
      ctx.fillText(String(age), x, h - padB + 6);
    };
    fiveYears.forEach(paintAge);
    [input.age, input.endAge].forEach(paintAge);

    ["below", "bad"].forEach((key) => {
      const path = paths.find((p) => p.key === key);
      ctx.beginPath();
      ctx.strokeStyle = colors[key];
      ctx.lineWidth = 2.25;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      path.points.forEach((pt, i) => {
        const x = xOf(pt.age);
        const y = yOf(pt.balance);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    const legend = $("legend");
    legend.innerHTML = "";
    paths.filter((p) => p.key !== "mid").forEach((p) => {
      const item = document.createElement("span");
      const sw = document.createElement("i");
      sw.style.background = colors[p.key];
      item.appendChild(sw);
      item.appendChild(document.createTextNode(p.name + ", " + p.note));
      legend.appendChild(item);
    });
    return true;
  }

  function scheduleSave(input) {
    clearTimeout(frame);
    frame = setTimeout(() => {
      writeQuery(input);
    }, 200);
  }

  function writeQuery(input) {
    const params = new URLSearchParams();
    const map = [
      ["age", input.age, DEFAULTS.age],
      ["retire", input.retireAge, DEFAULTS.retireAge],
      ["end", input.endAge, DEFAULTS.endAge],
      ["bal", Math.round(input.balance), DEFAULTS.balance],
      ["sal", Math.round(input.salary), DEFAULTS.salary],
      ["pct", Math.round(input.savePct * 100), DEFAULTS.savePct],
      ["raise", trimNum(input.raise * 100), String(DEFAULTS.raisePct)],
      ["mega", input.mega ? "1" : "0", "0"],
      ["adj", Math.round(input.spendAdjust), DEFAULTS.spendAdjust],
      ["house", Math.round(input.housingMonth), DEFAULTS.housingMonth],
      ["osave", Math.round(input.otherSaveMonth), DEFAULTS.otherSaveMonth],
      ["home", input.home, DEFAULTS.home],
      ["carry", Math.round(input.ownCarry), DEFAULTS.ownCarry],
      ["ss", Math.round(input.ssAnnual), DEFAULTS.ssAnnual],
      ["ssage", input.ssAge, DEFAULTS.ssAge],
      ["infl", trimNum(input.inflation * 100), String(DEFAULTS.inflationPct)],
      ["r1", trimNum(input.avg * 100), String(DEFAULTS.avgPct)],
      ["acct", input.account, DEFAULTS.account],
      ["file", input.filing, DEFAULTS.filing],
    ];
    map.forEach(([k, v, def]) => {
      if (String(v) !== String(def)) params.set(k, String(v));
    });
    const next = params.toString();
    const url = location.pathname + (next ? "?" + next : "") + location.hash;
    if (url !== location.pathname + location.search + location.hash) {
      history.replaceState(null, "", url);
    }
  }

  function onEdit(event) {
    const t = event.target;
    if (!(t instanceof HTMLElement) || !root.contains(t)) return;
    if (t.classList.contains("money") && event.type === "input") {
      formatMoneyLive(t);
    }
    if (t.type === "range") paintSlider(t);
    if (t.type === "range" && event.type === "input") {
      scheduleLive();
      return;
    }
    if (t.type === "range" && event.type === "change") {
      schedule();
      return;
    }
    if (t.classList.contains("money") && event.type === "input") {
      scheduleLive();
      return;
    }
    schedule();
  }

  function onBlur(event) {
    const t = event.target;
    if (t && t.id === "spend-adj") {
      t.value = signedText(signedNum(t.value));
      schedule();
      return;
    }
    if (!(t instanceof HTMLElement) || !t.classList.contains("money")) return;
    if (!t.value.trim()) return;
    setMoney(t.id, parseMoney(t.value));
    schedule();
  }

  root.addEventListener("input", onEdit);
  root.addEventListener("change", onEdit);
  root.addEventListener("blur", onBlur, true);
  const onPick = (event) => {
    const btn = event.target.closest("[data-account], [data-filing], [data-mega], [data-home]");
    if (!btn || !root.contains(btn)) return;
    const name = ["account", "filing", "mega", "home"].find((n) => btn.hasAttribute("data-" + n));
    setChoice(name, btn.getAttribute("data-" + name));
    schedule();
  };
  root.addEventListener("click", onPick);

  bindKnobs(root);
  if (window.KnobNums) {
    window.KnobNums.bind({
      commit: commitKnob,
      paint: (id) => paintSlider($(id)),
    });
  }

  const copy = $("copy-link");
  const onCopy = async () => {
    writeQuery(normalize(readRaw()));
    const label = copy.textContent;
    try {
      await navigator.clipboard.writeText(location.href);
      copy.textContent = "Copied";
    } catch (err) {
      copy.textContent = "Copy failed";
    }
    setTimeout(() => {
      copy.textContent = label;
    }, 1400);
  };
  copy.addEventListener("click", onCopy);

  const observer = new ResizeObserver(() => redraw());
  observer.observe(chart.parentElement);
  observer.observe(startChart.parentElement);
  const onToggle = () => {
    if (fold.open) requestAnimationFrame(redraw);
  };
  fold.addEventListener("toggle", onToggle);

  function redraw() {
    if (!lastPaths) {
      schedule();
      return;
    }
    if (fold.open) draw(chart, lastPaths.paths, lastPaths.input);
    drawStartNow();
  }

  function drawStartNow() {
    if (!lastStart) return;
    if (lastStart.error) {
      $("start-note").textContent = "The chart failed. " + lastStart.error;
      return;
    }
    drawStart(startChart, lastStart, hoverAge, conf, unit, $);
  }

  const ageFromPointer = (event) => {
    if (!lastStart || !lastStart.ages || !lastStart.ages.length) return null;
    const rect = startChart.getBoundingClientRect();
    const g = startGeometry(rect.width, lastStart.input);
    return Math.min(g.last, Math.max(g.first, g.ageOf(event.clientX - rect.left)));
  };
  const onHover = (event) => {
    // A mouse reads an age by hovering; a finger by tapping. Nothing on the chart moves.
    if (event.type === "pointermove" && event.pointerType !== "mouse") return;
    const age = ageFromPointer(event);
    if (age === hoverAge) return;
    hoverAge = age;
    drawStartNow();
  };
  const onLeave = (event) => {
    if (event.pointerType !== "mouse") return;
    hoverAge = null;
    drawStartNow();
  };
  const onConf = (event) => {
    const pick = event.target.closest("[data-conf], [data-unit], [data-turn-mega]");
    if (!pick || !root.contains(pick)) return;
    if (pick.hasAttribute("data-conf")) {
      conf = Number(pick.getAttribute("data-conf")) || 0;
      root.querySelectorAll("[data-conf]").forEach((b) => b.setAttribute("aria-pressed", b === pick ? "true" : "false"));
      drawStartNow();
    } else if (pick.hasAttribute("data-unit")) {
      unit = pick.getAttribute("data-unit") === "%" ? "%" : "$";
      root.querySelectorAll("[data-unit]").forEach((b) => b.setAttribute("aria-pressed", b === pick ? "true" : "false"));
      drawStartNow();
    } else {
      setChoice("mega", "1");
      schedule();
    }
  };
  root.addEventListener("click", onConf);
  startChart.addEventListener("pointermove", onHover);
  startChart.addEventListener("pointerdown", onHover);
  startChart.addEventListener("pointerleave", onLeave);

  loadInitial();
  render();

  return () => {
    root.removeEventListener("input", onEdit);
    root.removeEventListener("change", onEdit);
    root.removeEventListener("blur", onBlur, true);
    root.removeEventListener("click", onPick);
    copy.removeEventListener("click", onCopy);
    observer.disconnect();
    fold.removeEventListener("toggle", onToggle);
    root.removeEventListener("click", onConf);
    startChart.removeEventListener("pointermove", onHover);
    startChart.removeEventListener("pointerdown", onHover);
    startChart.removeEventListener("pointerleave", onLeave);
    clearTimeout(liveTimer);
    clearTimeout(frame);
  };

  function loadInitial() {
    const q = new URLSearchParams(location.search);
    const fromUrl = q.has("age") || q.has("bal") || q.has("adj") || q.has("retire");
    try {
      OLD_STORAGE.forEach((k) => localStorage.removeItem(k));
    } catch (err) {
      /* private mode */
    }
    const src = fromUrl
      ? {
          age: q.get("age"),
          retireAge: q.get("retire"),
          endAge: q.get("end"),
          balance: q.get("bal"),
          salary: q.get("sal"),
          savePct: q.get("pct"),
          raisePct: q.get("raise"),
          mega: q.get("mega"),
          spendAdjust: q.get("adj"),
          ssAnnual: q.get("ss"),
          ssAge: q.get("ssage"),
          inflationPct: q.get("infl"),
          avgPct: q.get("r1"),
          belowPct: q.get("r2"),
          badPct: q.get("r3"),
          account: q.get("acct"),
          filing: q.get("file"),
          housingMonth: q.get("house"),
          otherSaveMonth: q.get("osave"),
          home: q.get("home"),
          ownCarry: q.get("carry"),
        }
      : {};
    const input = normalize({ ...DEFAULTS, ...dropEmpty(src) });
    applyNormalized(input, null);
    setMoney("balance-amt", input.balance);
  }
}

// The yearly-reset plan runs in a worker. A newer input waits for the running one, and stale answers are dropped.
function makeSweeper(onDone) {
  let worker = null;
  let busy = false;
  let pending = null;
  const local = (input) => {
    setTimeout(() => {
      try {
        onDone({ input, ...adaptivePlan(input) });
      } catch (err) {
        onDone({ input, error: String(err && err.message ? err.message : err) });
      }
    }, 0);
  };
  try {
    worker = new Worker(new URL("./start-worker.js?v=5", import.meta.url), { type: "module" });
  } catch (err) {
    worker = null;
  }
  const send = (input) => {
    busy = true;
    worker.postMessage(input);
  };
  if (worker) {
    worker.onmessage = (event) => {
      busy = false;
      if (pending) {
        const next = pending;
        pending = null;
        send(next);
        return;
      }
      onDone(event.data);
    };
    worker.onerror = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      worker = null;
      busy = false;
      const next = pending;
      pending = null;
      if (next) local(next);
    };
  }
  return (input) => {
    if (!worker) {
      local(input);
      return;
    }
    if (busy) {
      pending = input;
      return;
    }
    send(input);
  };
}

const PLAN_FOR = [
  { name: "9 of 10 markets", short: "9 of 10" },
  { name: "3 of 4 markets", short: "3 of 4" },
  { name: "half of markets", short: "half" },
];

// One slot per working age; bars sit in the middle of their slot.
function startGeometry(w, input) {
  const padL = w < 420 ? 40 : 50;
  const padR = w < 420 ? 8 : 14;
  const first = input.age;
  const last = Math.max(input.age, input.retireAge - 1);
  const slots = last - first + 1;
  const slot = Math.max(1, w - padL - padR) / slots;
  return {
    padL,
    padR,
    first,
    last,
    slot,
    xOf: (age) => padL + (age - first + 0.5) * slot,
    ageOf: (x) => first + Math.floor((x - padL) / slot),
  };
}

function pctText(v) {
  const p = v * 100;
  return (p >= 10 || Math.abs(p - Math.round(p)) < 0.05 ? String(Math.round(p)) : p.toFixed(1)) + "%";
}

function payPct(v) {
  const p = Math.round(v * 1000) / 10;
  return (Number.isInteger(p) ? String(p) : p.toFixed(1)) + "%";
}

// First age from which a plan needs nothing more, or null.
function stopAge(rows) {
  const i = rows.findIndex((r, j) => rows.slice(j).every((x) => !x.over && x.payShare === 0));
  return i < 0 ? null : rows[i].age;
}

/**
 * Each year's amount is read from 2,000 futures, so it wobbles a point or two from year to year. The chart and
 * schedule use a 5-year average, narrowing at the ends so this year's amount is exactly this year's. Once a plan
 * can stop, it stays at zero.
 */
function smoothRows(rows) {
  const n = rows.length;
  const stop = stopAge(rows);
  return rows.map((r, i) => {
    if (r.over || (stop != null && r.age >= stop)) return r;
    const w = Math.min(2, i, n - 1 - i);
    let saved = 0;
    let share = 0;
    let pay = 0;
    let cnt = 0;
    for (let d = -w; d <= w; d++) {
      const x = rows[i + d];
      if (x.over) continue;
      saved += x.saved;
      share += x.share || 0;
      pay += x.payShare;
      cnt += 1;
    }
    return { ...r, saved: saved / cnt, share: share / cnt, payShare: pay / cnt };
  });
}

/**
 * How much to save: this year's amount for the chosen plan, then each later year's amount if markets are typical
 * (bars) or below average (dashed), next to what you save now.
 */
function drawStart(canvas, res, hover, conf, unit, $) {
  const input = res.input;
  const plan = res.plans[conf] || res.plans[0];
  const spec = PLAN_FOR[conf] || PLAN_FOR[0];
  if (!plan || !res.you || !res.you.length) return false;
  const typ = smoothRows(plan.typical);
  const rough = smoothRows(plan.rough);
  const you = res.you;
  const now = plan.typical[0];
  const val = (r) => (unit === "%" ? r.share || 0 : r.saved);
  const fmt = (v) => (unit === "%" ? pctText(v) : moneyShort(v));
  const limit = input.mega ? "401(k) and mega backdoor" : "401(k)";
  const stop = stopAge(plan.typical);
  const stopRough = stopAge(plan.rough);

  $("start-note").textContent = "Today's dollars, to spend " + money(input.annualSpend) + " a year (" + money(input.annualSpend / 12) +
    " a month) from " + input.retireAge + " to " + input.endAge + ". Recheck every year: each year's amount is what lasts in " +
    spec.name + " from the balance you have then.";

  // The answer: this year's amount.
  const big = $("save-big");
  const sub = $("save-sub");
  const pathLine = $("save-path");
  const banner = $("start-empty");
  if (now.over) {
    big.textContent = "More than the " + limit + " takes";
    sub.innerHTML = "No amount inside the limit lasts in " + spec.name + " at " + money(input.annualSpend) +
      " a year. You save " + money(you[0].saved) + " now (" + payPct(you[0].payShare) + " of pay).";
    pathLine.textContent = "";
    banner.hidden = !!input.mega;
    banner.innerHTML = input.mega ? "" : 'The mega backdoor raises the limit to $72,000. <button type="button" data-turn-mega="1">Try it</button>';
  } else {
    banner.hidden = true;
    big.innerHTML = money(now.saved) + '<span class="save-unit"> this year</span>';
    sub.textContent = payPct(now.payShare) + " of pay, " + pctText(now.share) + " of take-home. You save " + money(you[0].saved) +
      " now (" + Math.round(input.savePct * 100) + "% of pay).";
    const at = (rows, age) => rows.find((r) => r.age === age);
    const marks = [input.age + 10, input.age + 20].filter((a) => a < input.retireAge && (stop == null || a < stop));
    let text = "Typical markets: " + marks.map((a) => "about " + money(Math.round(at(typ, a).saved / 500) * 500) + " at " + a).join(", ");
    text += stop != null ? (marks.length ? ", then " : "") + "nothing from " + stop + "." : (marks.length ? ", " : "") + "saving until " + input.retireAge + ".";
    const roughFit = rough.filter((r) => !r.over);
    const roughOver = plan.rough.find((r) => r.over);
    if (roughFit.length) {
      const peak = roughFit.reduce((m, r) => (r.saved > m.saved ? r : m), roughFit[0]);
      text += " Below average: up to " + money(Math.round(peak.saved / 500) * 500) + " a year around " + peak.age +
        (roughOver ? ", and past the limit from " + roughOver.age : stopRough != null ? ", nothing from " + stopRough : "") + ".";
    }
    pathLine.textContent = text;
  }

  const parent = canvas.parentElement;
  const w = parent.clientWidth;
  const h = parent.clientHeight;
  if (w < 10 || h < 10) return false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const style = getComputedStyle(document.documentElement);
  const ink = style.getPropertyValue("--ink").trim() || "#1f1a17";
  const muted = style.getPropertyValue("--muted").trim() || "#6b625b";
  const grid = style.getPropertyValue("--line").trim() || "#e4dcd0";
  const card = style.getPropertyValue("--card").trim() || "#fffdf8";
  const green = style.getPropertyValue("--good").trim() || "#1f6b45";
  const warm = style.getPropertyValue("--rent").trim() || "#a65b2b";
  const g = startGeometry(w, input);
  const padT = 20;
  const padB = 22;

  let top = 0;
  [typ, rough, you].forEach((rows) => rows.forEach((r) => (top = Math.max(top, val(r)))));
  const step = niceCeil(Math.max(unit === "%" ? 0.02 : 1000, top) / 4);
  const rows = Math.max(2, Math.ceil(top / step - 1e-9));
  const yTop = step * rows;
  const plotH = h - padT - padB;
  const yOf = (v) => padT + (1 - Math.min(v, yTop) / yTop) * plotH;

  ctx.font = "11px system-ui, sans-serif";
  ctx.lineWidth = 1;
  for (let i = 0; i <= rows; i++) {
    const y = yOf(i * step);
    ctx.strokeStyle = grid;
    ctx.beginPath();
    ctx.moveTo(g.padL, y);
    ctx.lineTo(w - g.padR, y);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillText(i === 0 ? (unit === "%" ? "0%" : "$0") : fmt(i * step), g.padL - 6, y);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const placedX = [];
  const paintAge = (age) => {
    const x = g.xOf(age);
    if (placedX.some((px) => Math.abs(px - x) < 18)) return;
    placedX.push(x);
    ctx.fillText(String(age), x, h - padB + 6);
  };
  paintAge(g.first);
  paintAge(g.last);
  for (let a = Math.ceil(g.first / 5) * 5; a <= g.last; a += 5) paintAge(a);

  // Bars: what to save each year if markets are typical. This year's bar is the darkest.
  const bw = Math.max(2, Math.min(18, g.slot * 0.72));
  typ.forEach((r, i) => {
    const v = val(r);
    if (v <= 0) return;
    const x = g.xOf(r.age) - bw / 2;
    const y = yOf(v);
    ctx.fillStyle = r.over ? warm : green;
    ctx.globalAlpha = r.over ? 0.45 : i === 0 ? 1 : hover === r.age ? 0.95 : 0.62;
    ctx.fillRect(x, y, bw, yOf(0) - y);
  });
  ctx.globalAlpha = 1;
  if (hover != null) {
    const r = typ.find((x) => x.age === hover);
    if (r && val(r) > 0) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(g.xOf(r.age) - bw / 2, yOf(val(r)), bw, yOf(0) - yOf(val(r)));
    }
  }

  const line = (rowsToDraw, color, width, dash) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.lineJoin = "round";
    ctx.beginPath();
    let pen = false;
    rowsToDraw.forEach((r) => {
      if (r.over) {
        pen = false;
        return;
      }
      const x = g.xOf(r.age);
      const y = yOf(val(r));
      if (!pen) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      pen = true;
    });
    ctx.stroke();
    ctx.restore();
  };
  line(you, ink, 1.4, []);
  line(rough, warm, 2.2, [6, 4]);

  // Direct labels, skipped where they would collide.
  const labels = [];
  if (!now.over) labels.push({ x: g.xOf(input.age) - bw / 2, y: yOf(val(typ[0])) - 4, text: "now " + fmt(val(plan.typical[0])), color: green, strong: true });
  if (stop != null) labels.push({ x: g.xOf(stop) - 4, y: yOf(0) - 4, text: "stop at " + stop, color: green, strong: true });
  const roughOk = rough.filter((r) => !r.over);
  if (roughOk.length) {
    const peak = roughOk.reduce((m, r) => (val(r) > val(m) ? r : m), roughOk[0]);
    labels.push({ x: g.xOf(peak.age) - 30, y: yOf(val(peak)) - 6, text: "below average", color: warm });
  }
  const youEnd = you[you.length - 1];
  labels.push({ x: g.xOf(youEnd.age) - 50, y: yOf(val(youEnd)) - 5, text: "you now", color: ink });
  const boxes = [];
  labels.forEach((lb) => {
    ctx.font = (lb.strong ? "700 " : "600 ") + "11px system-ui, sans-serif";
    const tw = ctx.measureText(lb.text).width;
    const x0 = Math.max(g.padL + 2, Math.min(lb.x, w - g.padR - tw - 2));
    for (const dy of [0, -13, 13, -26]) {
      const y0 = lb.y + dy - 12;
      const box = { x: x0 - 2, y: y0, w: tw + 4, h: 14 };
      if (box.y < 0 || box.y + box.h > h - padB) continue;
      if (boxes.some((b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h)) continue;
      boxes.push(box);
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.strokeStyle = card;
      ctx.lineWidth = 3.5;
      ctx.lineJoin = "round";
      ctx.strokeText(lb.text, x0, y0 + 1);
      ctx.fillStyle = lb.color;
      ctx.fillText(lb.text, x0, y0 + 1);
      ctx.restore();
      break;
    }
  });

  const legend = $("start-legend");
  legend.innerHTML = "";
  const add = (label, color, kind) => {
    const item = document.createElement("span");
    const sw = document.createElement("i");
    if (kind) sw.className = kind;
    if (kind === "dash") sw.style.color = color;
    else sw.style.background = color;
    item.append(sw, document.createTextNode(label));
    legend.appendChild(item);
  };
  if (typ.some((r) => !r.over)) add("Typical markets", green, "bar");
  if (typ.some((r) => r.over)) add("The most the " + limit + " takes, not enough", warm, "bar");
  if (roughOk.length) add("Below average (3 in 4 did better)", warm, "dash");
  add("You now, " + Math.round(input.savePct * 100) + "% of pay", ink);

  paintPlanTable(res, conf, hover, $, typ, rough);
  canvas.setAttribute("aria-label", big.textContent + ". " + pathLine.textContent);
  return true;
}

function paintPlanTable(res, conf, hover, $, typ, rough) {
  const input = res.input;
  const spec = PLAN_FOR[conf] || PLAN_FOR[0];
  const plan = res.plans[conf] || res.plans[0];
  const lead = $("plan-lead");
  const table = $("plan-table");
  lead.textContent = "Save this year's amount, then recheck once a year; each amount lasts in " + spec.name +
    " from the balance you would have then. In typical markets it climbs a little into your 40s, when your balance is big and still has decades of market ahead, then falls fast as retirement nears. If markets run below average, keep saving more for longer. Hover or tap a bar for any age.";

  const ages = [input.age];
  for (let a = Math.ceil((input.age + 1) / 5) * 5; a < input.retireAge; a += 5) ages.push(a);
  if (ages[ages.length - 1] !== input.retireAge - 1 && input.retireAge - 1 > input.age) ages.push(input.retireAge - 1);
  if (hover != null && !ages.includes(hover)) ages.push(hover);
  ages.sort((a, b) => a - b);
  const stop = stopAge(plan.typical);

  const cell = (r) => {
    if (!r) return "—";
    if (r.over) return '<span class="none">over the limit</span>';
    if (r.payShare === 0) return '<span class="zero">$0, stop</span>';
    return money(Math.round(r.saved / 100) * 100);
  };
  const head = "<thead><tr><th>Age</th><th>Save, typical markets</th><th class=\"hide-sm\">Of take-home</th>" +
    '<th class="hide-sm">Balance then</th><th>Save, below average</th></tr></thead>';
  const body = ages.map((a) => {
    const i = a - input.age;
    const t = (a === input.age ? plan.typical : typ)[i];
    const r = (a === input.age ? plan.rough : rough)[i];
    const cls = [a === input.age ? "you" : "", a === hover ? "hover" : ""].join(" ").trim();
    return '<tr class="' + cls + '"><td>' + (a === input.age ? a + ", now" : a) + (stop === a ? '<span class="sub">can stop</span>' : "") +
      '</td><td class="later">' + cell(t) + '</td><td class="hide-sm">' + (t && !t.over && t.share != null ? pctText(t.share) : "—") +
      '</td><td class="hide-sm">' + (t ? moneyShort(t.balance) : "—") + "</td><td>" + cell(r) + "</td></tr>";
  }).join("");
  table.innerHTML = head + "<tbody>" + body + "</tbody>";
}

function dropEmpty(src) {
  const out = {};
  Object.entries(src).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "") out[k] = v;
  });
  return out;
}

function bindKnobs(root) {
  root.querySelectorAll(".vrange").forEach((box) => {
    const el = box.querySelector('input[type="range"]');
    if (!el) return;
    function valueFromX(clientX) {
      const rect = box.getBoundingClientRect();
      const pad = 14;
      const span = Math.max(1, rect.width - pad * 2);
      let t = (clientX - rect.left - pad) / span;
      t = Math.min(1, Math.max(0, t));
      const min = parseFloat(el.min);
      const max = parseFloat(el.max);
      const step = parseFloat(el.step) || 1;
      let v = min + Math.round((min + t * (max - min) - min) / step) * step;
      v = Math.min(max, Math.max(min, v));
      return Math.round(v * 1000) / 1000;
    }
    function setFromEvent(event, commit) {
      const v = valueFromX(event.clientX);
      if (String(v) !== el.value) {
        el.value = String(v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (commit) el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    box.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      box.setPointerCapture(event.pointerId);
      setFromEvent(event, false);
    });
    box.addEventListener("pointermove", (event) => {
      if (!box.hasPointerCapture(event.pointerId)) return;
      setFromEvent(event, false);
    });
    box.addEventListener("pointerup", (event) => {
      if (!box.hasPointerCapture(event.pointerId)) return;
      setFromEvent(event, true);
    });
    box.addEventListener("pointercancel", (event) => {
      if (!box.hasPointerCapture(event.pointerId)) return;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

// A signed dollar amount: "-10k", "−10,000", "+5000".
function signedNum(s) {
  const text = String(s == null ? "" : s).trim().replace(/[−–]/g, "-");
  const neg = /^-/.test(text);
  let n = parseFloat(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  if (/k\s*$/i.test(text)) n *= 1000;
  return neg ? -n : n;
}

function signedText(n) {
  if (!n) return "0";
  return (n < 0 ? "−" : "+") + Math.round(Math.abs(n)).toLocaleString("en-US");
}

function parseMoney(s) {
  const n = parseFloat(String(s).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function setMoney(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  if (document.activeElement === el) return;
  el.value = formatNumber(Math.max(0, n));
}

function formatNumber(n) {
  return Math.round(n).toLocaleString("en-US");
}

function formatMoneyLive(el) {
  const digits = el.value.replace(/[^\d]/g, "");
  if (!digits) {
    el.value = "";
    return;
  }
  el.value = Number(digits).toLocaleString("en-US");
}

function money(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function saveSentence(input, split) {
  const pct = trimNum(Math.round(input.savePct * 100));
  let text = "This year " + money(split.total) + " goes into the 401(k)";
  if (split.pre > 0 && split.roth > 0) {
    text += ", " + money(split.pre) + " pre-tax and " + money(split.roth) + " Roth";
  } else if (split.pre === 0) {
    text += " as Roth";
  } else {
    text += " pre-tax";
  }
  if (split.want > split.payUsed + 1) {
    text += ". " + pct + "% of " + money(split.salary) + " is " + money(split.want) + ", so the cap binds";
  }
  if (split.roth > 0) {
    text += ". Roth is paid with taxed pay: at your " + Math.round(split.taxRate * 100) + "% marginal rate, a dollar of pay puts " +
      money(100 * (1 - split.taxRate)).replace("$", "") + " cents in";
  }
  return text + ".";
}

function taxSentence(input, tax) {
  const steady = tax.steady;
  const share = tax.share;
  let text =
    "Keeping " +
    money(input.annualSpend) +
    " takes a " +
    money(steady.withdrawal) +
    " withdrawal once Social Security has started. ";
  if (share > 0.001 && share < 0.999) {
    text += money(steady.withdrawal * share) + " of that is pre-tax. ";
  } else if (share <= 0.001) {
    text += "That withdrawal is Roth. ";
  }
  if (steady.bill.total < 1) {
    text += "Income tax that year is about zero.";
  } else {
    text +=
      "Tax is about " +
      money(steady.bill.total) +
      " (" +
      money(steady.bill.federal) +
      " federal, " +
      money(steady.bill.state) +
      " California).";
  }
  if (tax.before) {
    text +=
      " Before " +
      input.ssAge +
      ", the withdrawal is " +
      money(tax.before.withdrawal) +
      " and tax is about " +
      money(tax.before.bill.total) +
      ".";
  }
  return text;
}

function moneyShort(n) {
  const v = Math.abs(n);
  if (v >= 1000000) {
    const m = v / 1000000;
    const body = m >= 10 || Math.abs(m - Math.round(m)) < 0.05 ? String(Math.round(m)) : m.toFixed(1);
    return "$" + body + "M";
  }
  if (v >= 10000) return "$" + Math.round(v / 1000) + "k";
  if (v >= 1000) return "$" + (v / 1000).toFixed(v >= 1000 ? 0 : 1) + "k";
  return "$" + Math.round(v);
}

function trimNum(n) {
  const x = Math.round(Number(n) * 10) / 10;
  return String(x);
}

function ageLabel(age) {
  return String(Math.floor(age));
}

function niceCeil(v) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function decadeFloor(v) {
  const exp = Math.floor(Math.log10(Math.max(v, 1000)));
  return 10 ** exp;
}

function decadeCeiling(v) {
  const exp = Math.ceil(Math.log10(Math.max(v * 1.08, 10)));
  return 10 ** exp;
}

function logTicks(floor, max) {
  const ticks = [];
  let v = decadeFloor(floor);
  while (v <= max * 1.001 && ticks.length < 6) {
    if (v >= floor * 0.99) ticks.push(v);
    v *= 10;
  }
  if (ticks.length === 0) ticks.push(floor, max);
  return ticks;
}

boot(document);
