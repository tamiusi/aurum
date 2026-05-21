# AURUM

> **XAUUSD signal engine** — confluence-based market reading distilled from a 14-system Pine Script into a one-tap, zero-backend web demo.

[![No Backend](https://img.shields.io/badge/backend-none-magenta)]()
[![Static Site](https://img.shields.io/badge/deploy-static-green)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-cyan.svg)](LICENSE)

Live demo: [tamiusi.github.io/aurum](https://tamiusi.github.io/aurum/)

Source: [github.com/tamiusi/aurum](https://github.com/tamiusi/aurum)

---

## What is AURUM

AURUM is a black-and-gold web app that reads the XAUUSD (gold) market in real time. It lets you:

- See live spot price with delta, sparkline, and an active-session band (Sydney / Tokyo / London / New York).
- Auto-detect your local timezone and show local + UTC clocks side-by-side.
- Press one button to compute a confluence-based BUY / SELL / WAIT signal on any timeframe (1m → 1d) and any style (scalping / intraday / swing).
- Map standing **preparation zones** — projected limit-order zones from FVGs, equal highs / lows, and premium / discount halves of the recent leg.

Every signal output ships with **explicit reasoning**: the active confluence systems, the score, the tier, smart SL anchored on swing structure, and tiered TPs (fixed-points or ATR-scaled per timeframe).

> **DYOR. NFA.** AURUM is an analysis tool, not financial advice.

---

## How it thinks

The engine is a JS port + improvisation of a confluence-based Pine Script (V4.5 Premium) that scores 14 separate systems:

1. **Trend & momentum** — EMA200 trend filter, EMA21/EMA50 alignment, Supertrend direction, Supertrend flips, fast-RSI confirmation.
2. **SMC structure** — swing highs / lows, BOS, CHoCH, displacement candles, premium / discount of recent leg.
3. **ICT & liquidity** — equal-high / equal-low sweep liquidity, FVG and order-block confluence, AMD-aware smart SL.
4. **Flow & oscillators** — RSI, CCI, Stoch, MFI consensus, VWAP relative position, volume surge.
5. **Tiered scoring** — score in [-25, +25]. **SNIPER** ≥ ±15, **HIGH** ≥ ±10, **STD** above threshold. Momentum override for strong directional moves.
6. **Risk model** — smart SL anchored to last swing low/high, tiered TP1/TP2/TP3, fixed-points or ATR-based, every output paired with R:R math.

### Standing zones (preparation mode)

Instead of waiting for a real-time entry, AURUM also projects upcoming preparation zones — places where price is statistically likely to react. Sources:

- Un-tested FVG imbalances within 40 bars.
- Last 3 EQH and EQL clusters (liquidity pools).
- Premium / discount halves of the most recent leg.

Each zone shows the side, the price band, the rationale, and the distance from current price.

---

## Stack

- **Frontend:** vanilla HTML / CSS / JS. No framework. No build step.
- **Live spot:** [gold-api.com](https://api.gold-api.com/price/XAU) (no key) with [goldprice.org](https://data-asg.goldprice.org/) fallback.
- **Bar data:** Yahoo Finance gold futures (`GC=F`) by default; TwelveData if user pastes a key in Settings; in-browser tick aggregation as last-resort fallback.
- **Chart visual:** [TradingView Advanced Chart Widget](https://www.tradingview.com/widget/) embedded (`OANDA:XAUUSD`).
- **AI reasoning slot:** wired for [MiMo](https://platform.xiaomimimo.com/) — currently runs a local heuristic until the platform is live.

---

## Run locally

```bash
git clone https://github.com/urarore/aurum.git
cd aurum
python3 -m http.server 8080
# open http://localhost:8080
```

That's it. No build, no install, no backend.

---

## Roadmap

- [x] Engine v1: 14-system confluence + tiered scoring + smart SL.
- [x] Standing zones: FVG, EQH/EQL, premium/discount.
- [x] TradingView embed + live spot ticker.
- [x] Local + UTC + tz auto-detect, with active session band.
- [ ] **MiMo plug-in** — once the API is live, every signal gets an LLM-rationalized narrative paragraph instead of the local heuristic.
- [ ] **Backtest mode** — replay historical bars and surface engine win-rate by tier.
- [ ] **Order-flow / footprint** — requires paid CME tape data; on the long-term roadmap, not in this demo.
- [ ] **Push alerts** — browser notifications when SNIPER tier triggers on user-pinned timeframe.

---

## Why this matters for MiMo

This project demonstrates a **production-quality LLM-AI assist surface**:

- The engine is fully transparent and reasoning-friendly. Every numeric output corresponds to a structured rationale list — perfect input substrate for an LLM to wrap into a human-readable narrative.
- The MiMo slot is already wired in the UI (toggle + key field). When the platform is live, swapping the local heuristic for a real MiMo call is a single function change.
- The codebase is tiny, dependency-free, and runnable from any static host — easy to audit, fork, and extend.

---

## Disclaimer

**DYOR. NFA.** AURUM is a research and analysis demo. Markets are non-stationary. Do not trade real capital based on any signal here without your own risk framework, broker, and forward-tested strategy.

---

## License

MIT — see [LICENSE](LICENSE).

Built with vanilla JS + obsession.

