import { DEFAULTS, normalize, project, spendTax, contributionSplit, takeHome, retireNeed, lifeNeed, planSpend, planCheck, rampPlan } from "./retirement-model.js?v=21";

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
    drawStart(startChart, lastStart, hoverAge, conf, $);
  }

  const ageFromPointer = (event) => {
    if (!lastStart || !lastStart.ages || !lastStart.ages.length) return null;
    const rect = startChart.getBoundingClientRect();
    const g = startGeometry(rect.width, lastStart.input);
    return switchAgeOf(lastStart.input, Math.round(g.ageOf(event.clientX - rect.left)));
  };
  const onHover = (event) => {
    // A mouse picks the age by hovering; a finger by touching or dragging.
    if (event.type === "pointermove" && event.pointerType !== "mouse" && event.buttons === 0) return;
    const age = ageFromPointer(event);
    if (age === hoverAge) return;
    hoverAge = age;
    drawStartNow();
  };
  const onLeave = () => {};
  const onConf = (event) => {
    const btn = event.target.closest("[data-conf]");
    if (btn && root.contains(btn)) {
      conf = Number(btn.getAttribute("data-conf")) || 0;
      root.querySelectorAll("[data-conf]").forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
      drawStartNow();
      return;
    }
    const mega = event.target.closest("[data-turn-mega]");
    if (mega && root.contains(mega)) {
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

// The save-now, need-later search runs in a worker. A newer input waits for the running one, and stale answers are dropped.
function makeSweeper(onDone) {
  let worker = null;
  let busy = false;
  let pending = null;
  const local = (input) => {
    setTimeout(() => {
      try {
        onDone({ input, ...rampPlan(input) });
      } catch (err) {
        onDone({ input, error: String(err && err.message ? err.message : err) });
      }
    }, 0);
  };
  try {
    worker = new Worker(new URL("./start-worker.js?v=3", import.meta.url), { type: "module" });
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

const CONF = [
  { name: "9 of 10 markets", short: "9 in 10" },
  { name: "3 of 4 markets", short: "3 in 4" },
  { name: "half of markets, for fun", short: "half" },
];

function startGeometry(w, input) {
  const padL = w < 420 ? 34 : 40;
  const padR = w < 420 ? 44 : 84;
  const first = input.age;
  const last = input.retireAge;
  const span = Math.max(1, last - first);
  const inner = Math.max(1, w - padL - padR);
  return {
    padL,
    padR,
    first,
    last,
    xOf: (age) => padL + ((age - first) / span) * inner,
    ageOf: (x) => first + ((x - padL) / inner) * span,
  };
}

function switchAgeOf(input, age) {
  const lo = Math.min(input.age + 1, input.retireAge - 1);
  return Math.min(input.retireAge - 1, Math.max(lo, age));
}

function pctText(v) {
  const p = v * 100;
  return (p >= 10 || Math.abs(p - Math.round(p)) < 0.05 ? String(Math.round(p)) : p.toFixed(1)) + "%";
}

function payPct(v) {
  const p = Math.round(v * 1000) / 10;
  return (Number.isInteger(p) ? String(p) : p.toFixed(1)) + "%";
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/**
 * Each plan is the share of pay you save at each age: its first share from today to the switch age, then the
 * smallest share from there to retirement that lasts. Moving the switch age moves every step together.
 */
function drawStart(canvas, res, pickAge, conf, $) {
  const input = res.input;
  const ages = res.ages || [];
  const lines = res.lines || [];
  const note = $("start-note");
  const empty = $("start-empty");
  const legend = $("start-legend");
  const c = CONF[conf] || CONF[0];
  if (!ages.length || !lines.length) return false;
  const at = switchAgeOf(input, pickAge == null ? input.age + 10 : pickAge);
  const k = at - input.age;
  note.textContent = "To spend " + money(input.annualSpend) + " a year (" + money(input.annualSpend / 12) + " a month) from " +
    input.retireAge + " to " + input.endAge + ", today's dollars. Each plan saves its first share until " + at +
    ", then the rate it needs from there to last in " + c.name + ". Drag or tap the chart to move the switch.";

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
  const warn = style.getPropertyValue("--rent").trim() || "#a65b2b";

  const series = lines.map((l) => l.byThreshold[conf] || l.byThreshold[0]);
  const steady = series[0][0].later;
  const g = startGeometry(w, input);
  const others = lines.filter((l) => !l.you);
  const shade = (l) => {
    if (l.you) return { color: ink, alpha: 1, width: 3 };
    const i = others.indexOf(l);
    const t = others.length > 1 ? i / (others.length - 1) : 0;
    return { color: green, alpha: 1 - 0.62 * t, width: 2.2 };
  };

  // Nothing fits: say so instead of an empty grid.
  if (!steady) {
    const most = lines.find((l) => l.most) || lines[0];
    empty.hidden = false;
    empty.innerHTML = "<div><b>No savings plan inside the " + (input.mega ? "401(k) and mega backdoor" : "401(k)") +
      " limit lasts in " + c.name + "</b> at " + money(input.annualSpend) + " a year. Saving the most it takes, " +
      money(most.earlySaved ? most.earlySaved.saved : 0) + " a year now, lasts in " + Math.round(most.odds * 100) + " of 100.</div>" +
      (input.mega ? "<div>Spend less or retire later: the line below says how much.</div>"
        : '<button type="button" data-turn-mega="1">Try the mega backdoor</button>');
    legend.innerHTML = "";
    paintPlanTable(res, conf, at, $, null);
    canvas.setAttribute("aria-label", empty.textContent);
    return true;
  }
  empty.hidden = true;

  const padT = 18;
  const padB = 22;
  let top = steady.payShare;
  lines.forEach((l, i) => {
    top = Math.max(top, l.early);
    const r = series[i][k];
    if (r && r.later) top = Math.max(top, r.later.payShare);
  });
  const ceil = res.ceiling || [];
  ceil.forEach((v) => (top = Math.max(top, Math.min(v, top * 1.25))));
  const step = niceCeil(Math.max(0.02, top) / 5);
  const rows = Math.max(2, Math.ceil(top / step - 1e-9));
  const yTop = step * rows;
  const plotH = h - padT - padB;
  const yOf = (v) => padT + (1 - Math.min(v, yTop) / yTop) * plotH;
  const xr = g.xOf(input.retireAge);
  const xs = g.xOf(at);

  ctx.font = "11px system-ui, sans-serif";
  ctx.lineWidth = 1;
  for (let i = 0; i <= rows; i++) {
    const y = yOf(i * step);
    ctx.strokeStyle = grid;
    ctx.beginPath();
    ctx.moveTo(g.padL, y);
    ctx.lineTo(xr, y);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillText(pctText(i * step), g.padL - 6, y);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const placedX = [];
  const paintAge = (age, strong) => {
    const x = g.xOf(age);
    if (!strong && placedX.some((px) => Math.abs(px - x) < 18)) return;
    placedX.push(x);
    ctx.font = (strong ? "700 " : "") + "11px system-ui, sans-serif";
    ctx.fillStyle = strong ? ink : muted;
    ctx.fillText(String(age), x, h - padB + 6);
  };
  paintAge(at, true);
  paintAge(g.first);
  paintAge(g.last);
  for (let a = Math.ceil(g.first / 5) * 5; a <= g.last; a += 5) paintAge(a);
  ctx.font = "11px system-ui, sans-serif";

  // The most the limits take, as a share of that year's pay.
  if (ceil.length) {
    ctx.save();
    ctx.setLineDash([1.5, 3.5]);
    ctx.lineCap = "round";
    ctx.strokeStyle = muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ceil.forEach((v, i) => {
      const x0 = g.xOf(ages[i]);
      const x1 = g.xOf(ages[i] + 1);
      const y = yOf(v);
      if (i === 0) ctx.moveTo(x0, y);
      else ctx.lineTo(x0, y);
      ctx.lineTo(x1, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // The switch: a band over the years still to come.
  ctx.save();
  ctx.fillStyle = muted;
  ctx.globalAlpha = 0.06;
  ctx.fillRect(xs, padT, xr - xs, plotH);
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = muted;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(xs, padT - 4);
  ctx.lineTo(xs, h - padB);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.font = "600 10.5px system-ui, sans-serif";
  ctx.fillStyle = muted;
  ctx.textBaseline = "bottom";
  ctx.textAlign = xs > w * 0.75 ? "right" : "left";
  ctx.fillText(xs > w * 0.75 ? "switch at " + at + " ◂▸" : "◂▸ switch at " + at, xs + (xs > w * 0.75 ? -4 : 4), padT - 4);
  ctx.restore();

  // The steady share: the same every year, no switch.
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(g.padL, yOf(steady.payShare));
  ctx.lineTo(xr, yOf(steady.payShare));
  ctx.stroke();
  ctx.restore();

  // Lightest first so the darker, front-loaded plans and you sit on top.
  const order = lines.map((l, i) => i).sort((a, b) => {
    if (lines[a].you) return 1;
    if (lines[b].you) return -1;
    return shade(lines[a]).alpha - shade(lines[b]).alpha;
  });
  const leftLabels = [];
  const rightLabels = [];
  order.forEach((i) => {
    const l = lines[i];
    const sh = shade(l);
    const later = series[i][k] && series[i][k].later;
    const y0 = yOf(l.early);
    ctx.save();
    ctx.globalAlpha = sh.alpha;
    ctx.strokeStyle = sh.color;
    ctx.lineWidth = sh.width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(g.padL, y0);
    ctx.lineTo(xs, y0);
    if (later) {
      const y1 = yOf(later.payShare);
      ctx.lineTo(xs, y1);
      ctx.lineTo(xr, y1);
    }
    ctx.stroke();
    if (!later) {
      // Too late: nothing under the limit makes up for it.
      ctx.strokeStyle = warn;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xs - 4, y0 - 4);
      ctx.lineTo(xs + 4, y0 + 4);
      ctx.moveTo(xs + 4, y0 - 4);
      ctx.lineTo(xs - 4, y0 + 4);
      ctx.stroke();
    }
    ctx.restore();
    leftLabels.push({ y: y0, text: (l.you ? "You " : "") + payPct(l.early), color: sh.color, alpha: sh.alpha, strong: l.you });
    rightLabels.push({
      y: later ? yOf(later.payShare) : y0,
      text: later ? ((w < 420 ? "" : "needs ") + payPct(later.payShare)) : "too late",
      color: later ? sh.color : warn,
      alpha: later ? sh.alpha : 1,
      strong: l.you,
      x: later ? xr + 5 : xs + 8,
    });
  });

  // Labels: first shares just inside the left edge, later shares past the right end. Nudged apart vertically.
  const lay = (items, xFor, align) => {
    items.sort((a, b) => a.y - b.y);
    const gap = 12;
    let prev = -Infinity;
    items.forEach((it) => {
      it.ly = Math.max(it.y, prev + gap);
      prev = it.ly;
    });
    const over = prev - (h - padB + 4);
    if (over > 0) items.forEach((it) => (it.ly -= over));
    items.forEach((it) => {
      ctx.save();
      ctx.font = (it.strong ? "700 " : "600 ") + "10.5px system-ui, sans-serif";
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.strokeStyle = card;
      ctx.lineWidth = 3.5;
      ctx.lineJoin = "round";
      const x = xFor(it);
      ctx.strokeText(it.text, x, it.ly);
      ctx.globalAlpha = Math.max(0.75, it.alpha);
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, x, it.ly);
      ctx.restore();
    });
  };
  const leftAbove = leftLabels.map((it) => ({ ...it, y: it.y - 7 }));
  lay(leftAbove, () => g.padL + 4, "left");
  lay(rightLabels.filter((it) => it.x > xr), (it) => it.x, "left");
  lay(rightLabels.filter((it) => it.x <= xr), (it) => it.x, "left");

  legend.innerHTML = "";
  const add = (label, color, alpha, kind) => {
    const item = document.createElement("span");
    const sw = document.createElement("i");
    if (kind) sw.className = kind;
    else {
      sw.style.background = color;
      sw.style.opacity = String(alpha);
    }
    item.append(sw, document.createTextNode(label));
    legend.appendChild(item);
  };
  add("You", ink, 1);
  add("Saving more first", green, 1);
  add("Steady " + payPct(steady.payShare) + ", no switch", ink, 0.55);
  add(input.mega ? "Most the 401(k) and mega backdoor take" : "Most the 401(k) takes", null, 1, "dot");

  paintPlanTable(res, conf, at, $, steady);
  canvas.setAttribute("aria-label", $("plan-lead").textContent);
  return true;
}

function paintPlanTable(res, conf, at, $, steady) {
  const input = res.input;
  const lines = res.lines || [];
  const k = at - res.ages[0];
  const c = CONF[conf] || CONF[0];
  const lead = $("plan-lead");
  const table = $("plan-table");
  const style = getComputedStyle(document.documentElement);
  const ink = style.getPropertyValue("--ink").trim();
  const green = style.getPropertyValue("--good").trim();
  const others = lines.filter((l) => !l.you);
  const alphaOf = (l) => (l.you ? 1 : 1 - 0.62 * (others.length > 1 ? others.indexOf(l) / (others.length - 1) : 0));

  const rowOf = (l) => (l.byThreshold[conf] || l.byThreshold[0])[k];
  const you = lines.find((l) => l.you);
  const best = lines.find((l) => rowOf(l) && rowOf(l).later);
  let text = "Switch at <b>" + at + "</b>: save the first share until then, the second from " + at + " to " + input.retireAge +
    ". Every row lasts in " + escapeHtml(c.name) + ".";
  if (steady) text = "The same " + payPct(steady.payShare) + " of pay every year from now works. " + text;
  if (you && best && best !== you) {
    const yr = rowOf(you).later;
    const br = rowOf(best).later;
    text += " Saving " + payPct(best.early) + " instead of " + payPct(you.early) + " until " + at + " takes what you need after from " +
      (yr ? "<b>" + payPct(yr.payShare) + "</b>" : "<b>more than the limit</b>") + (br.payShare === 0 ? " to <b>nothing</b>." : " down to <b>" + payPct(br.payShare) + "</b>.");
  }
  text += " Drag or tap the chart to switch at another age.";
  lead.innerHTML = text;

  const head = "<thead><tr><th>Until " + at + "</th><th>From " + at + " to " + input.retireAge + "</th><th>A year at " + at +
    "</th><th>Of take-home</th><th class=\"hide-sm\">First share all the way lasts in</th></tr></thead>";
  const body = lines.map((l) => {
    const r = rowOf(l);
    const later = r && r.later;
    const sw = '<span class="sw" style="background:' + (l.you ? ink : green) + ";opacity:" + alphaOf(l) + '"></span>';
    const first = sw + (l.you ? "You, " : "") + payPct(l.early) + " of pay" +
      '<span class="sub">' + (l.earlySaved ? money(l.earlySaved.saved) + " a year now" : "") + (l.most ? ", the most it takes" : "") + "</span>";
    let cells;
    if (!later) cells = '<td class="none">' + (steady ? "Too late" : "Doesn't fit") + '</td><td class="none">—</td><td class="none">—</td>';
    else if (later.payShare === 0) cells = '<td class="later zero">0%<span class="sub">stop saving</span></td><td>$0</td><td>0%</td>';
    else cells = '<td class="later">' + payPct(later.payShare) + '</td><td>' + money(later.saved) + "</td><td>" + pctText(later.share) + "</td>";
    return '<tr class="' + (l.you ? "you" : "") + '"><td>' + first + "</td>" + cells +
      '<td class="hide-sm">' + Math.round(l.odds * 100) + " of 100</td></tr>";
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
