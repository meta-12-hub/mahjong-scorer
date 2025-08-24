'use client';
import React, { useMemo, useState } from "react";

/** ===== 型 ===== */
type Suit = "m" | "p" | "s" | "z"; // 萬/筒/索/字
type Tile =
  | `${1|2|3|4|5|6|7|8|9}${"m"|"p"|"s"}`
  | `z${1|2|3|4|5|6|7}`;            // z1=東 z2=南 z3=西 z4=北 z5=白 z6=發 z7=中
type WinMethod = "ron" | "tsumo";

/** ===== 定数 ===== */
const ALL_TILES: Tile[] = (["m","p","s"] as const).flatMap(s =>
  ([1,2,3,4,5,6,7,8,9] as const).map(n => `${n}${s}` as Tile)
).concat(( [1,2,3,4,5,6,7] as const).map(n => `z${n}` as Tile));

/** ===== 風（場風/自風） ===== */
type Wind = 'E' | 'S' | 'W' | 'N';          // 東南西北
const WIND_OPTIONS: { label: string; value: Wind }[] = [
  { label: '東', value: 'E' },
  { label: '南', value: 'S' },
  { label: '西', value: 'W' },
  { label: '北', value: 'N' },
];

const windToTile: Record<Wind, Tile> = {
  E: 'z1',  // 東
  S: 'z2',  // 南
  W: 'z3',  // 西
  N: 'z4',  // 北
};

// 3枚以上あるかの判定（刻子/槓子を1つとして扱う）
function hasTripletOrQuad(counts: Record<string, number>, t: Tile): boolean {
  return (counts[t] ?? 0) >= 3;
}

/** 並び: 萬→筒→索→字 & 数字昇順 */
function sortTilesForView(hand: Tile[]): Tile[] {
  const suitOrder = (s: string) => (s === 'm' ? 0 : s === 'p' ? 1 : s === 's' ? 2 : 3);
  return [...hand].sort((a, b) => {
    const sa = a.startsWith('z') ? 'z' : a[1];
    const sb = b.startsWith('z') ? 'z' : b[1];
    const oa = suitOrder(sa), ob = suitOrder(sb);
    if (oa !== ob) return oa - ob;
    const na = a.startsWith('z') ? parseInt(a.slice(1), 10) : parseInt(a[0], 10);
    const nb = b.startsWith('z') ? parseInt(b.slice(1), 10) : parseInt(b[0], 10);
    return na - nb;
  });
}

// いま選択されている総枚数を求める小ヘルパー
function sumCounts(rec: Record<string, number>): number {
  return Object.values(rec).reduce((a, b) => a + (b || 0), 0);
}

/** ===== タイルユーティリティ ===== */
function tileIsHonor(t: Tile){ return t.startsWith('z'); }
function tileSuit(t: Tile): 'm'|'p'|'s'|'z' { return t.startsWith('z') ? 'z' : (t[1] as 'm'|'p'|'s'); }
function tileNum(t: Tile): number { return t.startsWith('z') ? parseInt(t.slice(1),10) : parseInt(t[0],10); }
function tileIsTerminalOrHonor(t: Tile){ return tileIsHonor(t) || tileNum(t)===1 || tileNum(t)===9; }

/** ===== 面子分解（4面子1雀頭） ===== */
type Meld = { kind: 'pon'|'chi', tiles: Tile[] };

function cloneCountsObj(c: Record<string, number>) {
  return Object.fromEntries(Object.entries(c).map(([k,v])=>[k, v||0]));
}

/** counts（牌→枚数）から 4面子1雀頭 の分解を1つ見つける（なければ null） */
function findMeldDecomposition(counts0: Record<string, number>): { pair: Tile, melds: Meld[] } | null {
  const tiles = ALL_TILES;
  // 候補の雀頭を順に試す
  for (const p of tiles) {
    if ((counts0[p] ?? 0) < 2) continue;
    const c1 = cloneCountsObj(counts0);
    c1[p] -= 2;

    const melds: Meld[] = [];
    if (searchMelds(c1, melds)) return { pair: p, melds };
  }
  return null;

  function searchMelds(c: Record<string, number>, acc: Meld[]): boolean {
    // 残りがゼロなら成立
    let has = false;
    for (const t of tiles) { if ((c[t]??0)>0) { has=true; break; } }
    if (!has) return true;

    // 最初に残っている牌を探す
    let first: Tile | null = null;
    for (const t of tiles) { if ((c[t]??0)>0) { first = t as Tile; break; } }
    if (!first) return true;

    const s = tileSuit(first), n = tileNum(first);

    // 1) 刻子（pon）
    if ((c[first]??0) >= 3) {
      c[first]-=3;
      acc.push({ kind:'pon', tiles:[first, first, first] });
      if (searchMelds(c, acc)) return true;
      acc.pop();
      c[first]+=3;
    }

    // 2) 順子（chi）… 数牌のみ、n<=7
    if (s !== 'z' && n <= 7) {
      const a = `${n}${s}` as Tile, b = `${n+1}${s}` as Tile, d = `${n+2}${s}` as Tile;
      if ((c[a]??0)>0 && (c[b]??0)>0 && (c[d]??0)>0) {
        c[a]--; c[b]--; c[d]--;
        acc.push({ kind:'chi', tiles:[a,b,d] });
        if (searchMelds(c, acc)) return true;
        acc.pop();
        c[a]++; c[b]++; c[d]++;
      }
    }
    return false;
  }
}

/** 七対子（2枚×7種） */
function isChiitoitsu(counts: Record<string, number>): boolean {
  let pairs = 0;
  for (const t of ALL_TILES) {
    const v = counts[t] ?? 0;
    if (v === 2) pairs++;
    else if (v !== 0) return false;
  }
  return pairs === 7;
}

/** 三色同順（menzen前提） */
function hasSanshokuDoujun(melds: Meld[]): boolean {
  for (let n=1;n<=7;n++){
    const need = [`${n}m`,`${n}p`,`${n}s`] as Tile[];
    const has = (suit:'m'|'p'|'s') =>
      melds.some(m => m.kind==='chi' && m.tiles[0]===`${n}${suit}` && m.tiles[1]===`${n+1}${suit}` && m.tiles[2]===`${n+2}${suit}`);
    if (has('m') && has('p') && has('s')) return true;
  }
  return false;
}

/** 一気通貫（menzen前提） */
function hasIttsuu(melds: Meld[]): boolean {
  const hasSeq = (suit:'m'|'p'|'s', start:number) =>
    melds.some(m => m.kind==='chi' && m.tiles[0]===`${start}${suit}` && m.tiles[1]===`${start+1}${suit}` && m.tiles[2]===`${start+2}${suit}`);
  for (const s of ['m','p','s'] as const){
    if (hasSeq(s,1) && hasSeq(s,4) && hasSeq(s,7)) return true;
  }
  return false;
}

/** 対子が役牌か（符計算用） */
function isValuePair(pair: Tile, seatWind: Wind, roundWind: Wind): boolean {
  if (pair==='z5' || pair==='z6' || pair==='z7') return true; // 白發中
  if (pair === windToTile[seatWind]) return true;
  if (pair === windToTile[roundWind]) return true;
  return false;
}

/** メンツが全部刻子なら対々和 */
function isToitoi(melds: Meld[]): boolean {
  return melds.length===4 && melds.every(m => m.kind==='pon');
}

/** 清一色/混一色 判定 */
function suitSummary(counts: Record<string, number>) {
  let hasM=false, hasP=false, hasS=false, hasZ=false;
  for (const t of ALL_TILES) {
    const v = counts[t] ?? 0;
    if (!v) continue;
    const s = tileSuit(t);
    if (s==='m') hasM=true; else if (s==='p') hasP=true; else if (s==='s') hasS=true; else hasZ=true;
  }
  return { hasM,hasP,hasS,hasZ };
}

/** ===== 符計算（MVP拡張版：待ち形は未反映） ===== */
function computeFuDetailed(args: {
  hand: Tile[]; win: WinMethod; pair: Tile|null; melds: Meld[]|null;
  pinfu: boolean; seatWind: Wind; roundWind: Wind;
}): number {
  const { hand, win, pair, melds, pinfu, seatWind, roundWind } = args;
  const counts = countsFromHand(hand);

  // 七対子：25符固定
  if (isChiitoitsu(counts)) return 25;

  // 平和：ツモ20符／ロン30符（MVP）
  if (pinfu) return win === 'tsumo' ? 20 : 30;

  // それ以外：符の素点を積み上げ→10の位切り上げ
  let fu = 20;

  // ツモ +2
  if (win === 'tsumo') fu += 2;
  // 門前ロン +10（本アプリは副露入力がない＝門前前提）
  if (win === 'ron') fu += 10;

  // 雀頭（役牌なら +2）
  if (pair && isValuePair(pair, seatWind, roundWind)) fu += 2;

  // 面子：刻子のみ加符（順子は0）
  if (melds) {
    for (const m of melds) {
      if (m.kind==='pon') {
        const t = m.tiles[0];
        const isTh = tileIsTerminalOrHonor(t);
        // 門前前提の刻子：中張 4符 / 老頭・字 8符
        fu += isTh ? 8 : 4;
      }
    }
  }

  // 10の位切り上げ
  return Math.ceil(fu / 10) * 10;
}

/** ===== 画像タイル（通常 or 赤5でパス切替）===== */
const TileImg: React.FC<{ tile: Tile; size?: number; red?: boolean }> = ({ tile, size=64, red=false }) => {
  const w = size, h = size*1.3;
  const isFiveNum = !tile.startsWith('z') && tile[0] === '5';
  // 赤指定かつ 5m/5p/5s のときだけ red フォルダを見る
  const basePath = isFiveNum && red ? '/tiles/regular/red' : '/tiles/regular';
  const src = `${basePath}/${tile}.svg`;

  // 赤画像が未配置でも落ちないようフォールバック
  const onErr: React.ReactEventHandler<HTMLImageElement> = (e) => {
    if (isFiveNum && red) (e.currentTarget as HTMLImageElement).src = `/tiles/regular/${tile}.svg`;
  };

  return (
    <div style={{ width: w, height: h, position: 'relative' }}>
      <img src={src} onError={onErr} width={w} height={h} style={{ objectFit: 'contain' }} alt={tile} />
    </div>
  );
};

/** ===== UI部品 ===== */
type RedKey = '5m'|'5p'|'5s';

const TileButton: React.FC<{
  tile: Tile;
  selectedCount: number;
  onAdd: () => void;
  onRemove: () => void;
  redSelectedCount?: number;
  onRedInc?: () => void;
  onRedDec?: () => void;
  canAdd?: boolean; // ★追加
}> = ({ tile, selectedCount, onAdd, onRemove, redSelectedCount=0, onRedInc, onRedDec, canAdd=true }) => {
  const isFiveNumber = !tile.startsWith('z') && tile[0] === '5';
  return (
    <div className="relative flex flex-col items-center gap-2 rounded-2xl border p-2 hover:shadow transition">
      {/* 代表表示（赤枚数>0で赤画像に） */}
      <TileImg tile={tile} size={64} red={isFiveNumber && redSelectedCount>0} />
      <div className="flex items-center gap-2">
        <button className="rounded-xl border px-2 py-1 text-sm" onClick={onRemove} disabled={selectedCount===0}>-</button>
        <div className="w-6 text-center text-sm">{selectedCount}</div>
        <button className="rounded-xl border px-2 py-1 text-sm" onClick={onAdd} disabled={selectedCount===4 || !canAdd}>+</button>
      </div>
      {isFiveNumber && (
        <div className="flex items-center gap-1 text-[11px]">
          <span className="px-1">赤</span>
          <button className="rounded border px-2" onClick={onRedDec} disabled={redSelectedCount===0}>-</button>
          <div className="w-5 text-center">{redSelectedCount}</div>
          <button className="rounded border px-2" onClick={onRedInc} disabled={redSelectedCount>=selectedCount}>+</button>
        </div>
      )}
    </div>
  );
};

const HandBar: React.FC<{
  tiles: Tile[];
  onRemove: (t: Tile)=>void;
  redVisual: Record<RedKey, number>;
}> = ({ tiles, onRemove, redVisual }) => {
  // 赤は指定枚数ぶん先に赤画像で割り当てる
  const redRemain: Record<RedKey, number> = { '5m': redVisual['5m']||0, '5p': redVisual['5p']||0, '5s': redVisual['5s']||0 };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border p-2 bg-white">
      {tiles.length === 0 && <div className="text-sm text-gray-500 px-1">まだ牌が選ばれていません</div>}
      {tiles.map((t, idx) => {
        const key = (t === '5m' || t === '5p' || t === '5s') ? (t as RedKey) : null;
        let red = false;
        if (key && redRemain[key] > 0) { red = true; redRemain[key]--; }
        return (
          <button key={`${t}-${idx}`} className="relative" title="クリックで1枚削除" onClick={()=>onRemove(t)}>
            <TileImg tile={t} size={48} red={red}/>
            <span className="absolute -top-1 -right-1 rounded-full border bg-white px-1 text-[10px]">×</span>
          </button>
        );
      })}
    </div>
  );
};

/** ===== ざっくり役/点数（簡易版） ===== */
function isTerminalOrHonor(t: Tile): boolean {
  if (t.startsWith("z")) return true;
  const n = parseInt(t[0],10);
  return n === 1 || n === 9;
}
function countsFromHand(hand: Tile[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const t of hand) c[t] = (c[t] ?? 0) + 1;
  return c;
}
function cloneCounts(c: Record<string, number>): Record<string, number> {
  return JSON.parse(JSON.stringify(c));
}
function tryRemoveSequence(c: Record<string, number>, suit: "m"|"p"|"s", n: number): boolean {
  const a = `${n}${suit}` as Tile, b = `${n+1}${suit}` as Tile, d = `${n+2}${suit}` as Tile;
  if ((c[a]??0)>0 && (c[b]??0)>0 && (c[d]??0)>0) { c[a]--; c[b]--; c[d]--; return true; }
  return false;
}
function canFormAllSequencesOnly(c0: Record<string, number>): boolean {
  const c = cloneCounts(c0);
  for (const suit of ["m","p","s"] as const) {
    while (true) {
      let found = false;
      for (let n=1;n<=7;n++) {
        const k = `${n}${suit}` as Tile;
        if ((c[k]??0)>0) {
          if (tryRemoveSequence(c, suit, n)) { found = true; break; }
          else return false;
        }
      }
      if (!found) break;
    }
  }
  for (const t of ALL_TILES) if ((c[t]??0)>0) return false;
  return true;
}
function hasIipeikou(c: Record<string, number>): boolean {
  for (const suit of ["m","p","s"] as const) {
    for (let n=1;n<=7;n++) {
      const a = `${n}${suit}` as Tile, b = `${n+1}${suit}` as Tile, d = `${n+2}${suit}` as Tile;
      if ((c[a]??0) >= 2 && (c[b]??0) >= 2 && (c[d]??0) >= 2) return true;
    }
  }
  return false;
}
function isPinfu(hand: Tile[]): boolean {
  const counts = countsFromHand(hand);
  for (const t of ALL_TILES) {
    if ((counts[t]??0) >= 2) {
      if (t.startsWith("z")) continue; // 近似
      const c = cloneCounts(counts); c[t] -= 2;
      if (canFormAllSequencesOnly(c)) return true;
    }
  }
  return false;
}
function isTanyao(hand: Tile[]): boolean { return hand.every(t => !isTerminalOrHonor(t)); }
function roundUpToHundred(x: number): number { return Math.ceil(x / 100) * 100; }
function calcBasePoints(fu: number, han: number): number { return fu * Math.pow(2, 2 + han); }
function computeFu({ isPinfuHan, win }: { isPinfuHan: boolean; win: WinMethod; }): number {
  if (isPinfuHan) return win === "tsumo" ? 20 : 30; // 簡易
  return 30;
}

type LimitInfo = { label: string | null; cappedBase: number };

function getLimitInfo(han: number, baseBeforeCap: number): LimitInfo {
  // 役満（MVP：13翻以上を役満扱い）
  if (han >= 13) return { label: "役満",   cappedBase: 8000 };
  // 三倍満
  if (han >= 11) return { label: "三倍満", cappedBase: 6000 };
  // 倍満
  if (han >= 8)  return { label: "倍満",   cappedBase: 4000 };
  // 跳満
  if (han >= 6)  return { label: "跳満",   cappedBase: 3000 };
  // 満貫（5翻 or 基底点2000以上）
  if (han >= 5 || baseBeforeCap >= 2000) return { label: "満貫", cappedBase: 2000 };
  // それ未満は上限なし
  return { label: null, cappedBase: baseBeforeCap };
}

function computePoints({
  han, fu, dealer, win
}: { han: number; fu: number; dealer: boolean; win: WinMethod; }) {

  // 基底点（符 × 2^(2+翻)）
  const baseRaw = calcBasePoints(fu, han);

  // 上限判定（満貫〜役満）
  const { label, cappedBase } = getLimitInfo(han, baseRaw);
  const base = cappedBase;

  if (win === "ron") {
    const total = roundUpToHundred(base * (dealer ? 6 : 4));
    return {
      total,
      breakdown: dealer ? "親ロン" : "子ロン",
      limitLabel: label,
    };
  } else {
    if (dealer) {
      const each = roundUpToHundred(base * 2);
      return {
        total: each * 3,
        breakdown: `親ツモ：各${each}点×3`,
        limitLabel: label,
      };
    } else {
      const child = roundUpToHundred(base);
      const dealerPay = roundUpToHundred(base * 2);
      return {
        total: child * 2 + dealerPay,
        breakdown: `子ツモ：子${child}点×2／親${dealerPay}点`,
        limitLabel: label,
      };
    }
  }
}

function formatYakuList(ys: string[]): string { return ys.length ? ys.join("、") : "（役なし）"; }

/** ===== メイン ===== */
export default function MahjongScorerApp(){
  // 牌の枚数
  const [handCounts, setHandCounts] = useState<Record<string, number>>({});
  // 赤ドラ枚数（5m/5p/5s）
  const [redCounts, setRedCounts] = useState<Record<RedKey, number>>({ '5m':0, '5p':0, '5s':0 });

  const [win, setWin] = useState<WinMethod>("ron");
  const [dealer, setDealer] = useState(false);
  const [riichi, setRiichi] = useState(false);

  const [roundWind, setRoundWind] = useState<Wind>('E'); // 場風
  const [seatWind, setSeatWind]   = useState<Wind>('E'); // 自風

  // 手牌（スコア用。赤の概念なしで5は5）
  const hand: Tile[] = useMemo(()=>{
    const arr: Tile[] = [];
    for (const t of ALL_TILES) {
      const n = handCounts[t] ?? 0;
      for (let i=0;i<n;i++) arr.push(t);
    }
    return arr;
  }, [handCounts]);
  const totalSelected = hand.length;

  // 追加/削除
  const addTile = (t: Tile) =>
  setHandCounts(prev => {
    const currentTotal = sumCounts(prev);
    if (currentTotal >= 14) return prev; // ここでブロック
    return { ...prev, [t]: Math.min(4, (prev[t] ?? 0) + 1) };
  });
  const removeTile = (t: Tile) => setHandCounts(p => {
    const nextCount = Math.max(0, (p[t]??0)-1);
    const next = { ...p, [t]: nextCount };
    if (t === '5m' || t === '5p' || t === '5s') {
      setRedCounts(rc => ({ ...rc, [t]: Math.min(rc[t as RedKey], nextCount) }));
    }
    return next;
  });
  const clearAll = () => { setHandCounts({}); setRedCounts({ '5m':0, '5p':0, '5s':0 }); };

  // 赤増減
  const incRed = (key: RedKey) => setRedCounts(prev => {
    const max = handCounts[key] ?? 0;
    return { ...prev, [key]: Math.min((prev[key]??0)+1, max) };
  });
  const decRed = (key: RedKey) => setRedCounts(prev => ({ ...prev, [key]: Math.max((prev[key]??0)-1, 0) }));

  const sortedHand = useMemo(()=>sortTilesForView(hand), [hand]);

  // スコア（拡張版）
  const yakuAndScore = useMemo(()=>{
  if (hand.length !== 14) return null;

  const counts = countsFromHand(hand);
  const menzen = true; // 本MVPは副露入力がない＝門前扱い

  // --- 役の下ごしらえ ---
  const pinfu = isPinfu(hand);                      // 近似：待ち形は未判定
  const tanyao = isTanyao(hand);
  const iipeikou = pinfu && hasIipeikou(counts);    // 近似：分解に依存しない近似でOK
  const chiitoi = isChiitoitsu(counts);

  // 4面子1雀頭の分解（七対子でなければ必要）
  const decomp = chiitoi ? null : findMeldDecomposition(counts);
  const pair = chiitoi ? null : decomp?.pair ?? null;
  const melds = chiitoi ? null : decomp?.melds ?? null;

  // 三色/一気通貫/対々和など（分解が取れている時のみ）
  const sanshoku = !!melds && hasSanshokuDoujun(melds);
  const ittsuu   = !!melds && hasIttsuu(melds);
  const toitoi   = !!melds && isToitoi(melds);

  // 役牌（風/三元）
  const seatWindTile = windToTile[seatWind];
  const roundWindTile = windToTile[roundWind];

  const yaku: string[] = [];
  let han = 0;

  // 基本役
  if (tanyao)         { han += 1; yaku.push("タンヤオ（1翻）"); }
  if (pinfu)          { han += 1; yaku.push("平和（1翻）"); }
  if (iipeikou)       { han += 1; yaku.push("一盃口（1翻）"); }
  if (riichi)         { han += 1; yaku.push("立直（1翻）"); }
  if (win === "tsumo"){ han += 1; yaku.push("門前清自摸和（1翻）"); }
  if (chiitoi)        { han += 2; yaku.push("七対子（2翻）"); }

  // 複合系
  if (toitoi)         { han += 2; yaku.push("対々和（2翻）"); }
  if (sanshoku)       { han += menzen ? 2 : 1; yaku.push(`三色同順（${menzen?2:1}翻）`); }
  if (ittsuu)         { han += menzen ? 2 : 1; yaku.push(`一気通貫（${menzen?2:1}翻）`); }

  // 清一/混一（役満・混一色は副露で翻が変わるが門前前提）
  const ss = suitSummary(counts);
  const suitCount = (ss.hasM?1:0)+(ss.hasP?1:0)+(ss.hasS?1:0);
  if (suitCount===1 && !ss.hasZ) { han += menzen ? 6 : 5; yaku.push(`清一色（${menzen?6:5}翻）`); }
  else if (suitCount===1 && ss.hasZ) { han += menzen ? 3 : 2; yaku.push(`混一色（${menzen?3:2}翻）`); }

  // 役牌（風/三元）…刻子/槓子があるかで判定（既存ロジックを流用）
  const isSeatTrip = (counts[seatWindTile] ?? 0) >= 3;
  const isRoundTrip= (counts[roundWindTile] ?? 0) >= 3;
  const seatLabel  = WIND_OPTIONS.find(w=>w.value===seatWind)?.label;
  const roundLabel = WIND_OPTIONS.find(w=>w.value===roundWind)?.label;

  if (isSeatTrip && isRoundTrip && seatWind === roundWind) {
    han += 2; yaku.push(`役牌：ダブ${seatLabel}（2翻）`);
  } else {
    if (isSeatTrip)  { han += 1; yaku.push(`役牌：自風（${seatLabel}）`); }
    if (isRoundTrip) { han += 1; yaku.push(`役牌：場風（${roundLabel}）`); }
  }
  if ((counts['z5']??0) >= 3) { han += 1; yaku.push('役牌：白'); }
  if ((counts['z6']??0) >= 3) { han += 1; yaku.push('役牌：發'); }
  if ((counts['z7']??0) >= 3) { han += 1; yaku.push('役牌：中'); }

  // 赤ドラ
  const redHan = (redCounts['5m']||0) + (redCounts['5p']||0) + (redCounts['5s']||0);
  if (redHan>0) { han += redHan; yaku.push(`赤ドラ×${redHan}（各1翻）`); }

  // 符（拡張版）：七対子・平和特例、その他は刻子/役牌雀頭/門前ロン・ツモ加符
  const fu = computeFuDetailed({
    hand, win, pair, melds, pinfu,
    seatWind, roundWind
  });

  // 点数（現状は従来ロジックにそのまま渡す）
  const pts = computePoints({ han, fu, dealer, win });

  return { han, fu, pts, yaku };
  }, [hand, win, dealer, riichi, redCounts, roundWind, seatWind]);

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="text-2xl font-semibold mb-2">麻雀 点数計算 MVP（画像タイル & 赤ドラ）</h1>
      <p className="text-sm text-gray-600 mb-4">/public/tiles/regular/ に置いた画像を使用。赤5は /red/ 配下の別画像に切替。</p>

      <div className="grid md:grid-cols-3 gap-4">
        {/* 左：入力 */}
        <section className="md:col-span-2 rounded-2xl border p-3">
          <h2 className="font-medium mb-2">牌を選択</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-3">
            {ALL_TILES.map(t => (
              <TileButton
                key={t}
                tile={t}
                selectedCount={handCounts[t]??0}
                onAdd={()=>addTile(t)}
                onRemove={()=>removeTile(t)}
                redSelectedCount={
                  t === '5m' ? (redCounts['5m']||0)
                  : t === '5p' ? (redCounts['5p']||0)
                  : t === '5s' ? (redCounts['5s']||0)
                  : 0
                }
                onRedInc={
                  t === '5m' ? ()=>incRed('5m')
                  : t === '5p' ? ()=>incRed('5p')
                  : t === '5s' ? ()=>incRed('5s')
                  : undefined
                }
                onRedDec={
                  t === '5m' ? ()=>decRed('5m')
                  : t === '5p' ? ()=>decRed('5p')
                  : t === '5s' ? ()=>decRed('5s')
                  : undefined
                }
                // ★追加：手牌14枚・各牌4枚を超えないように
                canAdd={(handCounts[t] ?? 0) < 4 && totalSelected < 14}
              />
            ))}
          </div>

          <div className="flex items-center justify-between mt-3 text-sm">
            <div>選択枚数：<span className="font-medium">{totalSelected}</span> / 14</div>
            <button className="rounded-xl border px-3 py-1" onClick={clearAll}>クリア</button>
            {totalSelected >= 14 && (
            <div className="mt-2 text-xs text-rose-600">
            ※ 14枚に達しました。これ以上は追加できません。
            </div>
            )}
          </div>

          {/* 選択済み手牌（赤は優先して赤画像に） */}
          <HandBar
            tiles={sortedHand}
            onRemove={(t)=>removeTile(t)}
            redVisual={{ '5m': redCounts['5m']||0, '5p': redCounts['5p']||0, '5s': redCounts['5s']||0 }}
          />
        </section>

        {/* 右：条件＆結果 */}
        <section className="rounded-2xl border p-3">
          <h2 className="font-medium mb-2">条件</h2>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={win==="ron"} onChange={()=>setWin("ron")} /> ロン
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={win==="tsumo"} onChange={()=>setWin("tsumo")} /> ツモ
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dealer} onChange={e=>setDealer(e.target.checked)} />
              親（dealer）
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={riichi} onChange={e=>setRiichi(e.target.checked)} />
              立直（riichi）
            </label>

            {/* ★ここに場風/自風セレクトを追加 */}
            <div className="flex items-center gap-3 text-sm mt-2">
              <label className="flex items-center gap-2">
                場風
                <select
                  className="rounded border px-2 py-1"
                  value={roundWind}
                  onChange={(e)=>setRoundWind(e.target.value as Wind)}
                >
                  {WIND_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </label>

              <label className="flex items-center gap-2">
                自風
                <select
                  className="rounded border px-2 py-1"
                  value={seatWind}
                  onChange={(e)=>setSeatWind(e.target.value as Wind)}
                >
                  {WIND_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </label>
            </div>
            {/* ★ここまで */}
            
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-3">
            <h3 className="font-medium mb-1">結果</h3>
            {totalSelected !== 14 && <p className="text-sm text-gray-600">14枚選ぶと自動計算します。</p>}
            {totalSelected === 14 && yakuAndScore && (
              <div className="text-sm">
                <div className="mb-1">役：{formatYakuList(yakuAndScore.yaku)}</div>
                <div className="mb-1">翻：{yakuAndScore.han} 翻</div>
                <div className="mb-1">符：{yakuAndScore.fu} 符</div>
                <div className="mb-1">支払い：{yakuAndScore.pts.breakdown}</div>
                <div className="font-semibold flex items-center">
                  合計点：{yakuAndScore.pts.total} 点
                  {yakuAndScore.pts.limitLabel && (
                  <span className="ml-2 inline-block rounded-full border px-2 py-0.5 text-xs">
                  {yakuAndScore.pts.limitLabel}
                </span>
                )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
