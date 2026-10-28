import { DEFAULTS, normalize, project, spendTax, contributionSplit } from "./retirement-model.js?v=9";

const STORAGE = "retire-plan-v2";

const SCENES = [
  { key: "avg", color: "--good" },
  { key: "below", color: "--house" },
  { key: "bad", color: "--rent" },
];

export function boot(root) {
  const $ = (id) => root.querySelector("#" + id);
  const chart = $("pathChart");
  let frame = 0;

  function readRaw() {
    return {
      age: sliderNum("age"),
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
    fitSlider("balance", input.balance, [200000, 500000, 1000000, 2500000, 10000000]);
    fitSlider("spend", input.annualSpend, [150000, 300000, 600000, 1500000]);
    if (fromSlider === "balance") $("balance").value = String(input.balance);
    if (fromSlider === "spend") $("spend").value = String(input.annualSpend);
    fitSlider("savepct", Math.round(input.savePct * 100), [40, 60, 100]);
    if (fromSlider === "savepct") $("savepct").value = String(Math.round(input.savePct * 100));
    paintSlider($("age"), String(input.age));
    paintSlider($("retire"), String(input.retireAge));
    paintSlider($("balance"), moneyShort(input.balance));
    paintSlider($("spend"), moneyShort(input.annualSpend));
    paintSlider($("savepct"), trimNum(Math.round(input.savePct * 100)) + "%");
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

  function paintSlider(el, label) {
    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    const val = parseFloat(el.value);
    const pct = max > min ? (val - min) / (max - min) : 0;
    const box = el.closest(".vrange");
    if (box) box.style.setProperty("--fill", String(pct));
    const out = $(el.id + "-out");
    if (out) out.textContent = label;
  }

  let queued = false;
  let chartBusy = false;
  let chartAgain = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      render();
    });
  }

  function render() {
    let input;
    try {
      const raw = readRaw();
      if (document.activeElement && document.activeElement.id === "balance") {
        raw.balance = parseFloat($("balance").value);
      }
      if (document.activeElement && document.activeElement.id === "spend") {
        raw.annualSpend = parseFloat($("spend").value);
      }
      if (document.activeElement && document.activeElement.id === "savepct") {
        raw.savePct = parseFloat($("savepct").value);
      }
      input = normalize(raw);
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
    const median = paths.find((p) => p.key === "avg");
    $("burn-avg").textContent = money(cautious.burn);
    $("burn-mo").textContent = money(cautious.burn / 12) + " a month";
    const plan = input.annualSpend;
    const over = plan > cautious.burn + 50;
    $("burn-avg").classList.toggle("pos", !over && cautious.burn > 0);
    $("burn-avg").classList.toggle("neg", over);
    $("burn-sub").textContent = over
      ? "a year after tax that lasted in 9 out of 10 simulated markets, until " +
        input.endAge +
        ". Your " +
        money(plan) +
        " plan needs a kinder market than that."
      : "a year after tax that lasted in 9 out of 10 simulated markets, in today's dollars, until " +
        input.endAge +
        ".";

    paths.forEach((p) => {
      $(p.key + "-burn").textContent = money(p.burn);
      $(p.key + "-nest").textContent = money(p.nest);
      $(p.key + "-name").textContent = p.name;
      const el = $(p.key + "-fate");
      el.textContent = p.note;
      el.className = "hint";
    });

    $("path-note").textContent = "Dotted line is retirement.";

    const year = median.points.find((pt) => Math.abs(pt.age - (input.age + 1)) < 0.02) || median.points[1];
    const savedNow = contributionSplit(input, 0, input.age + 1);
    $("year-now").textContent = money(input.balance);
    $("year-add").textContent = money(savedNow.total);
    $("year-next").textContent = year ? money(year.balance) : "—";
    $("year-real").textContent = (median.real * 100).toFixed(1) + "%";
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
      avg: style.getPropertyValue("--good").trim(),
      below: style.getPropertyValue("--house").trim(),
      bad: style.getPropertyValue("--rent").trim(),
    };

    let maxV = 1;
    paths.forEach((p) => {
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

    ["bad", "below", "avg"].forEach((key) => {
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
    paths.forEach((p) => {
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
    if (t.id === "balance") {
      setMoney("balance-amt", parseFloat(t.value));
    } else if (t.id === "spend") {
      setMoney("spend-amt", parseFloat(t.value));
    } else if (t.classList.contains("money") && event.type === "input") {
      formatMoneyLive(t);
    }
    if (t.id === "age" || t.id === "retire") paintSlider(t, t.value);
    if (t.id === "balance" || t.id === "spend") paintSlider(t, moneyShort(parseFloat(t.value)));
    if (t.id === "savepct") paintSlider(t, trimNum(parseFloat(t.value)) + "%");
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
    const btn = event.target.closest("[data-account], [data-filing], [data-mega]");
    if (!btn || !root.contains(btn)) return;
    const name = btn.hasAttribute("data-account") ? "account" : btn.hasAttribute("data-filing") ? "filing" : "mega";
    setChoice(name, btn.getAttribute("data-" + name));
    schedule();
  };
  root.addEventListener("click", onPick);

  bindKnobs(root, () => {
    /* slider handlers dispatch input */
  });

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
    function valueFromY(clientY) {
      const rect = box.getBoundingClientRect();
      const pad = 14;
      const span = Math.max(1, rect.height - pad * 2);
      let t = (rect.bottom - pad - clientY) / span;
      t = Math.min(1, Math.max(0, t));
      const min = parseFloat(el.min);
      const max = parseFloat(el.max);
      const step = parseFloat(el.step) || 1;
      let v = min + Math.round((min + t * (max - min) - min) / step) * step;
      v = Math.min(max, Math.max(min, v));
      return Math.round(v * 1000) / 1000;
    }
    function setFromEvent(event) {
      const v = valueFromY(event.clientY);
      if (String(v) !== el.value) {
        el.value = String(v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    box.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      box.setPointerCapture(event.pointerId);
      setFromEvent(event);
    });
    box.addEventListener("pointermove", (event) => {
      if (!box.hasPointerCapture(event.pointerId)) return;
      setFromEvent(event);
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
  if (split.want > split.total + 1) {
    text += ". " + pct + "% of " + money(split.salary) + " is " + money(split.want) + ", so the cap binds";
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

boot(document);
