import { DEFAULTS, normalize, project, spendTax, contributionSplit, takeHome, retireNeed, lifeNeed, planCheck } from "./retirement-model.js?v=16";

const STORAGE = "retire-plan-v2";

const SCENES = [
  { key: "bad", color: "--good" },
  { key: "below", color: "--house" },
];

export function boot(root) {
  const $ = (id) => root.querySelector("#" + id);
  const chart = $("pathChart");
  let frame = 0;

  function readRaw() {
    return {
      age: fieldNum("age"),
      retireAge: sliderNum("retire"),
      endAge: fieldNum("end"),
      balance: fieldNum("balance-amt"),
      annualSpend: fieldNum("spend-amt"),
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
      spendMode: $("spend-mode").value,
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
    setMoney("spend-amt", input.annualSpend);
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
    $("spend-mode").value = input.spendMode;
    fitSlider("spend", input.annualSpend, [150000, 300000, 600000, 1500000]);
    if (fromSlider === "spend") $("spend").value = String(input.annualSpend);
    fitSlider("savepct", Math.round(input.savePct * 100), [40, 60, 100]);
    if (fromSlider === "savepct") $("savepct").value = String(Math.round(input.savePct * 100));
    paintSlider($("retire"));
    paintSlider($("spend"));
    paintSlider($("savepct"));
  }

  function commitKnob(id, n) {
    const el = $(id);
    if (!el) return;
    if (id === "spend" || id === "savepct") {
      const ceilings = id === "spend" ? [150000, 300000, 600000, 1500000] : [40, 60, 100];
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
    if (el.id === "spend") return moneyShort(val);
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
      if (document.activeElement && document.activeElement.id === "spend") {
        raw.annualSpend = parseFloat($("spend").value);
      }
      if (document.activeElement && document.activeElement.id === "savepct") {
        raw.savePct = parseFloat($("savepct").value);
      }
      input = normalize(raw);
      // Unless you set it yourself, spending follows the life you have now.
      if (input.spendMode === "life") input = { ...input, annualSpend: Math.round(lifeNeed(input) / 1000) * 1000 };
      const editing = document.activeElement;
      const skipFormat = editing && editing.classList && editing.classList.contains("money");
      applyNormalized(input, null);
      if (skipFormat && (editing.id === "balance-amt" || editing.id === "salary" || editing.id === "spend-amt" || editing.id === "ss")) {
        // leave the in-progress typing alone
      }
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
        if (!draw(chart, paths, snap)) {
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
    const life = input.spendMode === "life";
    $("burn-avg").textContent = money(plan);
    $("burn-mo").textContent = money(plan / 12) + " a month after tax, in today's dollars";
    const housing = input.home === "own"
      ? "with today's " + money(need.housingNow) + " of housing swapped for " + money(need.housingThen) +
        " to keep a paid-off home"
      : "with today's " + money(need.housingNow) + " of rent still paid";
    $("burn-sub").textContent = (life
      ? "What you live on now, " + money(now.live) + " after tax and saving, " + housing + ". Itemized in step 3."
      : "The number you set. Keeping the life you have now would take about " + money(Math.round(need.need / 1000) * 1000) + ".") +
      (lastYear > 0 && later.need - need.need > 2000
        ? " If your spending grows with your raises, the life you have at " + (input.retireAge - 1) + " would take about " +
          money(Math.round(later.need / 1000) * 1000) + "."
        : "");
    $("use-live").hidden = life;
    const rows = [
      ["Salary", now.salary],
      ["Federal and California income tax", -(now.federal + now.state)],
      ["Payroll tax", -now.payroll],
      ["Into the 401(k)", -now.saved],
    ];
    if (now.other > 0) rows.push(["Saved outside the 401(k)", -now.other]);
    rows.push(["You live on now", now.live, true]);
    rows.push([input.home === "own" ? "Less today's housing" : "Rent, kept", input.home === "own" ? -need.housingNow : 0]);
    if (input.home === "own") rows.push(["Plus the paid-off home", need.housingThen]);
    rows.push(["To keep that life in retirement", need.need, true]);
    const box = $("live-steps");
    box.innerHTML = "";
    rows.forEach(([label, v, total]) => {
      if (label === "Rent, kept") return;
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

    const check = planCheck(input);
    const pct = Math.round(check.success * 100);
    const ok = check.success >= 0.9;
    $("burn-avg").classList.toggle("pos", ok);
    $("burn-avg").classList.toggle("neg", !ok);
    const verdict = $("verdict");
    verdict.className = "verdict " + (ok ? "pos" : "neg");
    verdict.textContent = (ok ? "Lasts. " : "Falls short. ") + "Money lasts to " + input.endAge + " in " + pct +
      " of 100 simulated markets; the plan is 90.";
    let fix;
    const ways = [];
    if (ok) {
      fix = "You could spend up to " + money(cautious.burn) + " and still last in 9 of 10.";
    } else {
      if (check.retireAt !== Infinity && check.retireAt != null) ways.push("retire at " + check.retireAt);
      if (check.saveAt != null && !check.saveCapped) ways.push("save " + Math.round(check.saveAt * 100) + "% of pay");
      ways.push("spend " + money(cautious.burn));
      fix = "To last in 9 of 10: " + ways.join(", or ") + ".";
      if (check.saveCapped) {
        fix += " Saving more won't help: the 401(k) limit is already full" + (input.mega ? "." : ", and the mega backdoor raises it.");
      }
      if (check.retireAt === Infinity) fix += " Retiring later alone doesn't get there.";
    }
    $("fix-note").textContent = fix;
    const quick = $("quick");
    quick.className = "quick " + (ok ? "pos" : "neg");
    quick.textContent = (ok ? "Lasts: " : "Falls short: ") + money(plan) + " a year lasts to " + input.endAge +
      " in " + pct + " of 100 markets. The plan is 90. " + (ok ? "Up to " + money(cautious.burn) + " would." : "Fix: " + ways.join(", or ") + ".");
    $("spend-note").textContent = life
      ? "Starts at what you live on now, with housing swapped for your home then. Drag to set your own."
      : "Your number. Living as you do now would take about " + money(Math.round(need.need / 1000) * 1000) + ".";

    paths.forEach((p) => {
      $(p.key + "-burn").textContent = money(p.burn);
      $(p.key + "-nest").textContent = money(p.nest);
      const el = $(p.key + "-fate");
      if (p.depletedAge == null) {
        el.textContent = "In a market " + p.note.replace(" did better", " beat") + ", your plan lasts to " + input.endAge + ".";
        el.className = "hint pos";
      } else {
        el.textContent = "In a market " + p.note.replace(" did better", " beat") + ", your plan runs out at " + ageLabel(p.depletedAge) + ".";
        el.className = "hint neg";
      }
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
    $("ss-hint").textContent =
      "Social Security is " +
      money(input.ssAnnual) +
      " a year in today's dollars, starting at " +
      Math.max(input.ssAge, input.retireAge) +
      ". It counts toward the after-tax spending. Set it to 0 to leave it out.";
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
      try {
        localStorage.setItem(STORAGE, JSON.stringify(input));
      } catch (err) {
        /* private mode */
      }
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
      ["spend", Math.round(input.annualSpend), DEFAULTS.annualSpend],
      ["house", Math.round(input.housingMonth), DEFAULTS.housingMonth],
      ["osave", Math.round(input.otherSaveMonth), DEFAULTS.otherSaveMonth],
      ["home", input.home, DEFAULTS.home],
      ["carry", Math.round(input.ownCarry), DEFAULTS.ownCarry],
      ["smode", input.spendMode, DEFAULTS.spendMode],
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

  const useLive = $("use-live");
  if (useLive) {
    useLive.addEventListener("click", () => {
      $("spend-mode").value = "life";
      schedule();
    });
  }

  function onEdit(event) {
    const t = event.target;
    if (!(t instanceof HTMLElement) || !root.contains(t)) return;
    if (t.id === "spend") {
      $("spend-mode").value = "custom";
      setMoney("spend-amt", parseFloat(t.value));
    } else if (t.classList.contains("money") && event.type === "input") {
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

  const observer = new ResizeObserver(() => schedule());
  observer.observe(chart.parentElement);

  loadInitial();
  render();

  return () => {
    root.removeEventListener("input", onEdit);
    root.removeEventListener("change", onEdit);
    root.removeEventListener("blur", onBlur, true);
    root.removeEventListener("click", onPick);
    copy.removeEventListener("click", onCopy);
    observer.disconnect();
    clearTimeout(liveTimer);
    clearTimeout(frame);
  };

  function loadInitial() {
    const q = new URLSearchParams(location.search);
    const fromUrl = q.has("age") || q.has("bal") || q.has("spend") || q.has("retire");
    let stored = null;
    if (!fromUrl) {
      try {
        stored = JSON.parse(localStorage.getItem(STORAGE) || "null");
      } catch (err) {
        stored = null;
      }
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
          annualSpend: q.get("spend"),
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
          spendMode: q.get("smode") || (q.has("spend") ? "custom" : "life"),
        }
      : stored
        ? {
            age: stored.age,
            retireAge: stored.retireAge,
            endAge: stored.endAge,
            balance: stored.balance,
            salary: stored.salary,
            savePct: stored.savePct != null ? stored.savePct * 100 : undefined,
            raisePct: stored.raise != null ? stored.raise * 100 : undefined,
            mega: stored.mega == null ? undefined : stored.mega ? "1" : "0",
            annualSpend: stored.annualSpend,
            ssAnnual: stored.ssAnnual,
            ssAge: stored.ssAge,
            inflationPct: stored.inflation * 100,
            avgPct: stored.avg * 100,
            belowPct: stored.below * 100,
            badPct: stored.bad * 100,
            account: stored.account,
            filing: stored.filing,
            housingMonth: stored.housingMonth,
            otherSaveMonth: stored.otherSaveMonth,
            home: stored.home,
            ownCarry: stored.ownCarry,
            spendMode: stored.spendMode || "life",
          }
        : {};
    const input = normalize({ ...DEFAULTS, ...dropEmpty(src) });
    applyNormalized(input, null);
    setMoney("balance-amt", input.balance);
    setMoney("spend-amt", input.annualSpend);
  }
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
