# finance-calculator

A fixed-rate home loan payment and a month-by-month rent-versus-buy comparison, with the formulas on the page.

Live site: [https://rhianc.github.io/finance-calculator/](https://rhianc.github.io/finance-calculator/)

Open `index.html` in a browser, or serve the folder so the stylesheet and scripts load:

```bash
python3 -m http.server 8765
```

Then visit `http://127.0.0.1:8765/`.

The calculation lives in `js/model.js`. Check it with JavaScriptCore:

```bash
jsc test/model.test.js
```

Federal dollar amounts follow tax year 2026. The page states the assumptions and what it leaves out.
