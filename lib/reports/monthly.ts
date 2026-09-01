import { acos, roas, cpc, ctr } from "./metrics";
import type { CampaignDailyRow } from "./preview";

export interface Blended {
  spend: number; sales: number; orders: number; clicks: number; impressions: number;
  acos: number | null; roas: number | null; cpc: number | null; ctr: number | null;
  cvr: number | null; costPerOrder: number | null; aov: number | null;
}

export interface CampaignMonth {
  campaign_name: string;
  cur: { spend: number; sales: number; orders: number; roas: number | null };
  prev: { spend: number; sales: number; orders: number; roas: number | null } | null;
}

export interface Monthly {
  month: string | null;      // 'YYYY-MM'
  prevMonth: string | null;
  hasPrev: boolean;
  cur: Blended;
  prev: Blended | null;
  campaigns: CampaignMonth[];
  availableMonths: string[];  // newest first
}

const mKey = (d: string) => d.slice(0, 7);

function prevKey(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() - 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function blended(rows: CampaignDailyRow[]): Blended {
  let spend = 0, sales = 0, orders = 0, clicks = 0, impressions = 0;
  for (const r of rows) { spend += r.spend || 0; sales += r.sales || 0; orders += r.orders || 0; clicks += r.clicks || 0; impressions += r.impressions || 0; }
  return {
    spend, sales, orders, clicks, impressions,
    acos: acos(spend, sales), roas: roas(spend, sales), cpc: cpc(spend, clicks), ctr: ctr(clicks, impressions),
    cvr: clicks > 0 ? (orders / clicks) * 100 : null,
    costPerOrder: orders > 0 ? spend / orders : null,
    aov: orders > 0 ? sales / orders : null,
  };
}

export function listMonths(rows: CampaignDailyRow[]): string[] {
  return [...new Set(rows.map((r) => mKey(r.date)))].sort().reverse();
}

export function computeMonthly(rows: CampaignDailyRow[], month?: string): Monthly {
  const months = listMonths(rows);
  const m = month && months.includes(month) ? month : months[0] ?? null;
  if (m === null) {
    return { month: null, prevMonth: null, hasPrev: false, cur: blended([]), prev: null, campaigns: [], availableMonths: months };
  }
  const pm = prevKey(m);
  const curRows = rows.filter((r) => mKey(r.date) === m);
  const prevRows = rows.filter((r) => mKey(r.date) === pm);
  const hasPrev = prevRows.length > 0;

  const grp = (rs: CampaignDailyRow[]) => {
    const g = new Map<string, { spend: number; sales: number; orders: number }>();
    for (const r of rs) {
      const a = g.get(r.campaign_name) ?? { spend: 0, sales: 0, orders: 0 };
      a.spend += r.spend || 0; a.sales += r.sales || 0; a.orders += r.orders || 0;
      g.set(r.campaign_name, a);
    }
    return g;
  };
  const curG = grp(curRows), prevG = grp(prevRows);

  const campaigns: CampaignMonth[] = [...curG.entries()].map(([name, c]) => {
    const p = prevG.get(name) ?? null;
    return {
      campaign_name: name,
      cur: { ...c, roas: roas(c.spend, c.sales) },
      prev: p ? { ...p, roas: roas(p.spend, p.sales) } : null,
    };
  }).sort((a, b) => b.cur.spend - a.cur.spend);

  return { month: m, prevMonth: pm, hasPrev, cur: blended(curRows), prev: hasPrev ? blended(prevRows) : null, campaigns, availableMonths: months };
}
