import { api } from "./asc_lib.mjs";
const SUBS = { weekly: "6762059037", monthly: "6818215506", annual: "6762061478", special: "6767263019" };
const en = {
  weekly: ["Sone Music Weekly Premium", "Unlock Weekly Premium"],
  monthly: ["Sone Music Monthly Premium", "Unlock Monthly Premium"],
  annual: ["Sone Music Annual Premium", "Unlock Annual Premium"],
  special: ["Sone Music Special Annual Premium", "Unlock Special Annual Premium"],
};
const fr = {
  weekly: ["Sone Music Premium Hebdo", "Débloquez Premium chaque semaine"],
  monthly: ["Sone Music Premium Mensuel", "Débloquez Premium chaque mois"],
  annual: ["Sone Music Premium Annuel", "Débloquez Premium pour un an"],
  special: ["Sone Music Offre Annuelle", "Offre spéciale : Premium pour un an"],
};
const es = {
  weekly: ["Sone Music Premium Semanal", "Desbloquea Premium cada semana"],
  monthly: ["Sone Music Premium Mensual", "Desbloquea Premium cada mes"],
  annual: ["Sone Music Premium Anual", "Desbloquea Premium por un año"],
  special: ["Sone Music Oferta Anual", "Oferta especial: Premium por un año"],
};
const pt = {
  weekly: ["Sone Music Premium Semanal", "Desbloqueie o Premium semanal"],
  monthly: ["Sone Music Premium Mensal", "Desbloqueie o Premium mensal"],
  annual: ["Sone Music Premium Anual", "Desbloqueie o Premium anual"],
  special: ["Sone Music Oferta Anual", "Oferta especial: Premium anual"],
};
const L = {
  "en-GB": en, "en-AU": en, "en-CA": en,
  "fr-FR": fr, "fr-CA": fr, "es-ES": es, "es-MX": es, "pt-BR": pt, "pt-PT": pt,
  "de-DE": {
    weekly: ["Sone Music Premium Wöchentlich", "Premium wöchentlich freischalten"],
    monthly: ["Sone Music Premium Monatlich", "Premium monatlich freischalten"],
    annual: ["Sone Music Premium Jährlich", "Premium für ein Jahr freischalten"],
    special: ["Sone Music Jahres-Sonderangebot", "Sonderangebot: Premium für ein Jahr"],
  },
  it: {
    weekly: ["Sone Music Premium Settimanale", "Sblocca Premium ogni settimana"],
    monthly: ["Sone Music Premium Mensile", "Sblocca Premium ogni mese"],
    annual: ["Sone Music Premium Annuale", "Sblocca Premium per un anno"],
    special: ["Sone Music Offerta Annuale", "Offerta speciale: Premium per un anno"],
  },
  "nl-NL": {
    weekly: ["Sone Music Premium Wekelijks", "Ontgrendel Premium per week"],
    monthly: ["Sone Music Premium Maandelijks", "Ontgrendel Premium per maand"],
    annual: ["Sone Music Premium Jaarlijks", "Ontgrendel Premium per jaar"],
    special: ["Sone Music Jaaraanbieding", "Speciale aanbieding: Premium per jaar"],
  },
  pl: {
    weekly: ["Sone Music Premium Tygodniowy", "Odblokuj Premium na tydzień"],
    monthly: ["Sone Music Premium Miesięczny", "Odblokuj Premium na miesiąc"],
    annual: ["Sone Music Premium Roczny", "Odblokuj Premium na rok"],
    special: ["Sone Music Oferta Roczna", "Oferta specjalna: Premium na rok"],
  },
  no: {
    weekly: ["Sone Music Premium Ukentlig", "Lås opp Premium hver uke"],
    monthly: ["Sone Music Premium Månedlig", "Lås opp Premium hver måned"],
    annual: ["Sone Music Premium Årlig", "Lås opp Premium i ett år"],
    special: ["Sone Music Årstilbud", "Spesialtilbud: Premium i ett år"],
  },
  tr: {
    weekly: ["Sone Music Haftalık Premium", "Haftalık Premium'un kilidini aç"],
    monthly: ["Sone Music Aylık Premium", "Aylık Premium'un kilidini aç"],
    annual: ["Sone Music Yıllık Premium", "Yıllık Premium'un kilidini aç"],
    special: ["Sone Music Özel Yıllık Premium", "Özel Yıllık Premium'un kilidini aç"],
  },
  ru: {
    weekly: ["Sone Music Premium на неделю", "Откройте Premium на неделю"],
    monthly: ["Sone Music Premium на месяц", "Откройте Premium на месяц"],
    annual: ["Sone Music Premium на год", "Откройте Premium на год"],
    special: ["Sone Music Спецпредложение", "Спецпредложение: Premium на год"],
  },
  "ar-SA": {
    weekly: ["Sone Music بريميوم أسبوعي", "افتح ميزات بريميوم أسبوعيًا"],
    monthly: ["Sone Music بريميوم شهري", "افتح ميزات بريميوم شهريًا"],
    annual: ["Sone Music بريميوم سنوي", "افتح ميزات بريميوم سنويًا"],
    special: ["Sone Music عرض سنوي خاص", "عرض خاص: بريميوم لمدة عام"],
  },
  ja: {
    weekly: ["Sone Music 週間プレミアム", "毎週プレミアム機能をすべて解放"],
    monthly: ["Sone Music 月間プレミアム", "毎月プレミアム機能をすべて解放"],
    annual: ["Sone Music 年間プレミアム", "1年間プレミアム機能をすべて解放"],
    special: ["Sone Music 年間特別プラン", "特別価格で1年間プレミアムを解放"],
  },
  "zh-Hans": {
    weekly: ["Sone Music 每周高级版", "解锁每周高级版全部功能"],
    monthly: ["Sone Music 每月高级版", "解锁每月高级版全部功能"],
    annual: ["Sone Music 年度高级版", "解锁年度高级版全部功能"],
    special: ["Sone Music 年度特惠", "特惠价解锁年度高级版"],
  },
  "zh-Hant": {
    weekly: ["Sone Music 每週進階版", "解鎖每週進階版全部功能"],
    monthly: ["Sone Music 每月進階版", "解鎖每月進階版全部功能"],
    annual: ["Sone Music 年度進階版", "解鎖年度進階版全部功能"],
    special: ["Sone Music 年度特惠", "特惠價解鎖年度進階版"],
  },
  id: {
    weekly: ["Sone Music Premium Mingguan", "Buka Premium setiap minggu"],
    monthly: ["Sone Music Premium Bulanan", "Buka Premium setiap bulan"],
    annual: ["Sone Music Premium Tahunan", "Buka Premium selama setahun"],
    special: ["Sone Music Promo Tahunan", "Penawaran khusus: Premium setahun"],
  },
  th: {
    weekly: ["Sone Music พรีเมียมรายสัปดาห์", "ปลดล็อกพรีเมียมรายสัปดาห์"],
    monthly: ["Sone Music พรีเมียมรายเดือน", "ปลดล็อกพรีเมียมรายเดือน"],
    annual: ["Sone Music พรีเมียมรายปี", "ปลดล็อกพรีเมียมรายปี"],
    special: ["Sone Music ข้อเสนอพิเศษรายปี", "ข้อเสนอพิเศษ: ปลดล็อกพรีเมียมรายปี"],
  },
  vi: {
    weekly: ["Sone Music Premium Hằng Tuần", "Mở khóa Premium hằng tuần"],
    monthly: ["Sone Music Premium Hằng Tháng", "Mở khóa Premium hằng tháng"],
    annual: ["Sone Music Premium Hằng Năm", "Mở khóa Premium hằng năm"],
    special: ["Sone Music Ưu Đãi Năm", "Ưu đãi đặc biệt: Premium cả năm"],
  },
};
// length check
for (const [loc, m] of Object.entries(L)) for (const [k, [n, d]] of Object.entries(m))
  if ([...n].length > 35 || [...d].length > 55) throw new Error(`too long ${loc} ${k}`);
if (process.argv[2] !== "--apply") { console.log("lengths ok; pass --apply"); process.exit(0); }
let ok = 0, skip = 0, fail = 0;
for (const [key, id] of Object.entries(SUBS)) {
  const existing = new Set((await api(`/v1/subscriptions/${id}/subscriptionLocalizations?limit=200`)).data.map(l => l.attributes.locale));
  for (const [loc, m] of Object.entries(L)) {
    if (existing.has(loc)) { skip++; continue; }
    const [name, description] = m[key];
    try {
      await api("/v1/subscriptionLocalizations", "POST", { data: { type: "subscriptionLocalizations",
        attributes: { locale: loc, name, description },
        relationships: { subscription: { data: { type: "subscriptions", id } } } } });
      ok++;
    } catch (e) { fail++; console.log("FAIL", key, loc, e.message.split("\n").slice(0, 3).join(" ")); }
  }
}
console.log({ created: ok, skipped: skip, failed: fail });
