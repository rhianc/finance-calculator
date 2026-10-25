(function (root) {
  'use strict';

  // Redfin region paths for the places this site can select.
  // City and county ids come from Redfin's own result URLs.
  var REGION = {
    '13820': '/city/1823/AL/Birmingham',
    '30780': '/city/10455/AR/Little-Rock',
    '38060': '/city/14240/AZ/Phoenix',
    '46060': '/city/19459/AZ/Tucson',
    '12540': '/city/953/CA/Bakersfield',
    '23420': '/city/6904/CA/Fresno',
    '40140': '/county/335/CA/Riverside-County',
    '31084': '/city/11203/CA/Los-Angeles',
    '36084': '/city/13654/CA/Oakland',
    '11244': '/county/332/CA/Orange-County',
    '40900': '/city/16409/CA/Sacramento',
    '41740': '/city/16904/CA/San-Diego',
    '41884': '/city/17151/CA/San-Francisco',
    '41940': '/city/17420/CA/San-Jose',
    '44700': '/city/19009/CA/Stockton',
    '37100': '/city/16678/CA/Ventura',
    '17820': '/city/4147/CO/Colorado-Springs',
    '19740': '/city/5155/CO/Denver',
    '25540': '/city/9406/CT/Hartford',
    '14860': '/city/18605/CT/Stamford',
    '47764': '/city/12839/DC/Washington-DC',
    '48864': '/city/19583/DE/Wilmington',
    '22744': '/city/6173/FL/Fort-Lauderdale',
    '15980': '/city/6208/FL/Fort-Myers',
    '27260': '/city/8907/FL/Jacksonville',
    '29460': '/city/9711/FL/Lakeland',
    '33124': '/city/11458/FL/Miami',
    '36740': '/city/13655/FL/Orlando',
    '35840': '/city/16463/FL/Sarasota',
    '41304': '/city/16164/FL/St-Petersburg',
    '45294': '/city/18142/FL/Tampa',
    '48424': '/city/19373/FL/West-Palm-Beach',
    '12054': '/city/30756/GA/Atlanta',
    '31924': '/city/12766/GA/Marietta',
    '19780': '/city/5415/IA/Des-Moines',
    '14260': '/city/2287/ID/Boise',
    '16984': '/city/29470/IL/Chicago',
    '20994': '/city/29477/IL/Elgin',
    '26900': '/city/9170/IN/Indianapolis',
    '28140': '/city/35751/MO/Kansas-City',
    '31140': '/city/12262/KY/Louisville',
    '12940': '/city/1336/LA/Baton-Rouge',
    '35380': '/city/14233/LA/New-Orleans',
    '14454': '/city/1826/MA/Boston',
    '15764': '/city/2833/MA/Cambridge',
    '49340': '/city/20420/MA/Worcester',
    '12580': '/city/1073/MD/Baltimore',
    '23224': '/city/21534/MD/Bethesda',
    '19804': '/city/5665/MI/Detroit',
    '47664': '/county/1410/MI/Oakland-County',
    '24340': '/city/8694/MI/Grand-Rapids',
    '33460': '/city/10943/MN/Minneapolis',
    '41180': '/city/16661/MO/St-Louis',
    '16740': '/city/3105/NC/Charlotte',
    '24660': '/city/7161/NC/Greensboro',
    '39580': '/city/35711/NC/Raleigh',
    '36540': '/city/9417/NE/Omaha',
    '15804': '/city/2570/NJ/Camden',
    '29484': '/county/1902/NJ/Middlesex-County',
    '35084': '/city/13136/NJ/Newark',
    '10740': '/city/513/NM/Albuquerque',
    '29820': '/city/10201/NV/Las-Vegas',
    '10580': '/city/245/NY/Albany',
    '15380': '/city/2832/NY/Buffalo',
    '35004': '/county/1974/NY/Nassau-County',
    '35614': '/city/30749/NY/New-York',
    '40380': '/city/16162/NY/Rochester',
    '17140': '/city/3879/OH/Cincinnati',
    '17410': '/city/4145/OH/Cleveland',
    '18140': '/city/4664/OH/Columbus',
    '19430': '/city/5413/OH/Dayton',
    '36420': '/city/14237/OK/Oklahoma-City',
    '46140': '/city/35765/OK/Tulsa',
    '38900': '/city/30772/OR/Portland',
    '10900': '/city/514/PA/Allentown',
    '37964': '/city/15502/PA/Philadelphia',
    '33874': '/county/2406/PA/Montgomery-County',
    '38300': '/city/15702/PA/Pittsburgh',
    '39300': '/city/15272/RI/Providence',
    '16700': '/city/3478/SC/Charleston',
    '17900': '/city/4149/SC/Columbia',
    '24860': '/city/7891/SC/Greenville',
    '28940': '/city/10200/TN/Knoxville',
    '32820': '/city/12260/TN/Memphis',
    '34980': '/city/13415/TN/Nashville',
    '12420': '/city/30818/TX/Austin',
    '19124': '/city/30794/TX/Dallas',
    '21340': '/city/6171/TX/El-Paso',
    '23104': '/city/30827/TX/Fort-Worth',
    '26420': '/city/8903/TX/Houston',
    '41700': '/city/16657/TX/San-Antonio',
    '39340': '/city/16042/UT/Provo',
    '41620': '/city/17150/UT/Salt-Lake-City',
    '11694': '/county/2965/VA/Fairfax-County',
    '40060': '/city/17149/VA/Richmond',
    '47260': '/city/20418/VA/Virginia-Beach',
    '21794': '/city/5832/WA/Everett',
    '42644': '/city/16163/WA/Seattle',
    '45104': '/city/17887/WA/Tacoma',
    '33340': '/city/35759/WI/Milwaukee'
  };

  function statePath(code) {
    if (code === 'DC') return '/county/436/DC/District-of-Columbia';
    var states = root.HomeMarkets && root.HomeMarkets.STATES;
    var state = states && states[code];
    if (!state || code === 'US') return '';
    return '/state/' + state.name.replace(/ /g, '-');
  }

  function priceToken(n) {
    if (n >= 1000000) {
      var millions = Math.round(n / 10000) / 100;
      var text = String(millions).replace(/\.0$/, '').replace(/(\.\d)0$/, '$1');
      return text + 'M';
    }
    return Math.round(n / 1000) + 'k';
  }

  function searchUrl(code, cityId, price) {
    var path = (cityId && REGION[cityId]) || statePath(code);
    if (!path) return 'https://www.redfin.com/';
    var step = 25000;
    var lo = Math.floor(price * 0.9 / step + 1e-6) * step;
    var hi = Math.ceil(price * 1.1 / step - 1e-6) * step;
    if (lo < 50000) lo = 50000;
    if (hi <= lo) hi = lo + step;
    return 'https://www.redfin.com' + path + '/filter/min-price=' + priceToken(lo) + ',max-price=' + priceToken(hi);
  }

  function paint() {
    var link = root.document && root.document.getElementById('redfin-link');
    if (!link) return;
    var state = root.document.getElementById('state');
    var city = root.document.getElementById('city');
    var price = root.document.getElementById('home-price');
    if (!state || !price) return;
    var code = state.value === 'US' || state.value.indexOf('CA') === 0 ? (state.value === 'US' ? 'US' : 'CA') : state.value;
    var n = parseFloat(String(price.value).replace(/,/g, ''));
    if (!isFinite(n)) n = 0;
    link.href = searchUrl(code, city && city.value, n);
  }

  root.RedfinLink = { searchUrl: searchUrl, paint: paint };
})(typeof globalThis !== 'undefined' ? globalThis : this);
