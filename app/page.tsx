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
function computePoints({ han, fu, dealer, win }: { han: number; fu: number; dealer: boolean; win: WinMethod; }) {
  let base = calcBasePoints(fu, han);
  const mangan = han >= 5 || base >= 2000;
  if (mangan) base = 2000;
  if (win === "ron") {
    const total = roundUpToHundred(base * (dealer ? 6 : 4));
    return { total, breakdown: dealer ? "親ロン" : "子ロン", mangan };
  } else {
    if (dealer) {
      const each = roundUpToHundred(base * 2);
      return { total: each * 3, breakdown: `親ツモ：各${each}点×3`, mangan };
    } else {
      const child = roundUpToHundred(base);
      const dealerPay = roundUpToHundred(base * 2);
      return { total: child*2 + dealerPay, breakdown: `子ツモ：子${child}点×2／親${dealerPay}点`, mangan };
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

  // スコア（簡易）
  const yakuAndScore = useMemo(()=>{
  if (hand.length !== 14) return null;

  // ★役牌判定に使うカウントを先に用意
  const counts = countsFromHand(hand);

  // 既存の役（MVP簡易）
  const tanyao = isTanyao(hand);
  const pinfu = isPinfu(hand);
  const iipeikou = pinfu && hasIipeikou(counts);
  const menzenTsumo = win === "tsumo";
  const redHan = (redCounts['5m']||0) + (redCounts['5p']||0) + (redCounts['5s']||0); // 赤ドラ=各1翻

  let han = 0;
  const yaku: string[] = [];

  if (tanyao) { han += 1; yaku.push("タンヤオ（1翻）"); }
  if (pinfu) { han += 1; yaku.push("平和（1翻）"); }
  if (iipeikou) { han += 1; yaku.push("一盃口（1翻）"); }
  if (menzenTsumo) { han += 1; yaku.push("門前清自摸和（1翻）"); }
  if (riichi) { han += 1; yaku.push("立直（1翻）"); }
  if (redHan > 0) { han += redHan; yaku.push(`赤ドラ×${redHan}（各1翻）`); }

  // === ここから役牌（風/三元）を追加 ===
  // 必要ヘルパー：
  //  - windToTile: {E:'z1', S:'z2', W:'z3', N:'z4'}
  //  - WIND_OPTIONS: [{label:'東',value:'E'}, ...]
  //  - hasTripletOrQuad(counts, tile): 3枚以上ならtrue
  // --- 風の役牌：ダブ風は1行で2翻、それ以外は個別に加算 ---
  const seatLabel = WIND_OPTIONS.find(w => w.value === seatWind)?.label;
  const roundLabel = WIND_OPTIONS.find(w => w.value === roundWind)?.label;

  const isSeatWindTriplet  = hasTripletOrQuad(counts, windToTile[seatWind]);
  const isRoundWindTriplet = hasTripletOrQuad(counts, windToTile[roundWind]);

  if (isSeatWindTriplet && isRoundWindTriplet && seatWind === roundWind) {
    // ダブ風：自風=場風 かつ その風が刻子/槓子
    han += 2;
    yaku.push(`役牌：ダブ${seatLabel}（2翻）`);
  } else {
    if (isSeatWindTriplet)  { han += 1; yaku.push(`役牌：自風（${seatLabel}）`); }
    if (isRoundWindTriplet) { han += 1; yaku.push(`役牌：場風（${roundLabel}）`); }
  }

  // 三元牌（白發中）
  if (hasTripletOrQuad(counts, 'z5')) { han += 1; yaku.push('役牌：白'); }
  if (hasTripletOrQuad(counts, 'z6')) { han += 1; yaku.push('役牌：發'); }
  if (hasTripletOrQuad(counts, 'z7')) { han += 1; yaku.push('役牌：中'); }
  // === 役牌ここまで ===

  const fu = computeFu({ isPinfuHan: pinfu, win });
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
                <div className="mb-1">符：{yakuAndScore.fu} 符（簡易計算）</div>
                <div className="mb-1">支払い：{yakuAndScore.pts.breakdown}</div>
                <div className="font-semibold">合計点：{yakuAndScore.pts.total} 点{yakuAndScore.pts.mangan ? "（満貫以上は満貫に丸め）" : ""}</div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
