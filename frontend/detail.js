// ================================================================
//  VNSTOCK DYNAMIC DASHBOARD — detail.js
//  Pure data dashboard, no AI. Computes technicals client-side.
// ================================================================

const API_BASE_URL =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '' ||
    window.location.protocol === 'file:'
        ? 'http://localhost:8000'
        : 'https://vnstock-analytics.onrender.com';

// ================================================================
//  UTILITIES
// ================================================================

function getTickerFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('ticker') || 'HPG';
}

function fmt(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return Number(value).toLocaleString('vi-VN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function fmtInt(value) {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return Math.round(value).toLocaleString('vi-VN');
}

function fmtCurrency(value) {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return Math.round(value).toLocaleString('vi-VN') + ' đ';
}

function fmtPercent(value) {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    return sign + value.toFixed(2) + '%';
}

function colorClass(value) {
    if (value === null || value === undefined || isNaN(value)) return 'text-neutral';
    return value > 0 ? 'text-positive' : value < 0 ? 'text-negative' : 'text-neutral';
}

// ================================================================
//  TECHNICAL ANALYSIS — Client-side Computation
// ================================================================

function computeTechnicals(history) {
    if (!history || history.length < 2) {
        return { ema34: null, ma20: null, ema89: null, rsi: null, price: null, score: 0, signal: 'N/A' };
    }

    const closes = history.map(h => h.close).filter(c => c != null);
    const len = closes.length;
    const price = closes[len - 1];

    // Simple Moving Average (SMA)
    const calcMA = (period) => {
        if (len < period) return null;
        const slice = closes.slice(len - period);
        return slice.reduce((a, b) => a + b, 0) / period;
    };
    const ma20 = calcMA(20);

    // Exponential Moving Average (EMA)
    const calcEMA = (period) => {
        if (len < period) return null;
        const alpha = 2 / (period + 1);
        let ema = closes[0];
        for (let i = 1; i < len; i++) {
            ema = alpha * closes[i] + (1 - alpha) * ema;
        }
        return ema;
    };
    const ema34 = calcEMA(34);
    const ema89 = calcEMA(89);

    // RSI (14)
    let rsi = null;
    if (len >= 15) {
        const deltas = [];
        for (let i = 1; i < len; i++) deltas.push(closes[i] - closes[i - 1]);
        let avgGain = 0, avgLoss = 0;
        for (let i = 0; i < 14; i++) {
            if (deltas[i] > 0) avgGain += deltas[i];
            else avgLoss += Math.abs(deltas[i]);
        }
        avgGain /= 14;
        avgLoss /= 14;
        for (let i = 14; i < deltas.length; i++) {
            avgGain = (avgGain * 13 + Math.max(deltas[i], 0)) / 14;
            avgLoss = (avgLoss * 13 + Math.max(-deltas[i], 0)) / 14;
        }
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi = 100 - (100 / (1 + rs));
    }

    // Technical Score (0–100)
    let score = 50; // neutral baseline
    const factors = [];

    // EMA34 position: price above = bullish
    if (ema34 !== null) {
        const pct = ((price - ema34) / ema34) * 100;
        const pts = Math.min(Math.max(pct * 3, -15), 15);
        score += pts;
        factors.push({ name: 'EMA34', value: ema34, signal: price > ema34 ? 'Bullish' : 'Bearish', pts });
    }
    // MA20 position
    if (ma20 !== null) {
        const pct = ((price - ma20) / ma20) * 100;
        const pts = Math.min(Math.max(pct * 2.5, -12), 12);
        score += pts;
        factors.push({ name: 'MA20', value: ma20, signal: price > ma20 ? 'Bullish' : 'Bearish', pts });
    }
    // EMA89 position
    if (ema89 !== null) {
        const pct = ((price - ema89) / ema89) * 100;
        const pts = Math.min(Math.max(pct * 2, -10), 10);
        score += pts;
        factors.push({ name: 'EMA89', value: ema89, signal: price > ema89 ? 'Bullish' : 'Bearish', pts });
    }
    // RSI
    if (rsi !== null) {
        let pts = 0;
        if (rsi >= 70) pts = -8;       // overbought
        else if (rsi >= 60) pts = -3;
        else if (rsi <= 30) pts = -6;   // oversold (risky)
        else if (rsi <= 40) pts = 3;    // near oversold = potential bounce
        else pts = 5;                   // healthy range
        score += pts;
        factors.push({ name: 'RSI(14)', value: rsi, signal: rsi >= 70 ? 'Quá mua' : rsi <= 30 ? 'Quá bán' : 'Trung tính', pts });
    }

    score = Math.min(Math.max(Math.round(score), 0), 100);

    let signal = 'Trung tính';
    if (score >= 70) signal = 'Bullish';
    else if (score >= 55) signal = 'Hơi tích cực';
    else if (score <= 30) signal = 'Bearish';
    else if (score <= 45) signal = 'Hơi tiêu cực';

    return { ema34, ma20, ema89, rsi, price, score, signal, factors };
}

// ================================================================
//  RENDER: FINANCIAL TABLE
// ================================================================

function renderFinancialTable(financials) {
    const tbody = document.getElementById('financial-table-body');
    if (!financials || financials.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:32px;">Không có dữ liệu tài chính</td></tr>';
        return;
    }

    // Sort by period ascending for YoY calc
    const sorted = [...financials].sort((a, b) => {
        return String(a.period).localeCompare(String(b.period));
    });

    let rows = '';
    for (let i = 0; i < sorted.length; i++) {
        const f = sorted[i];
        const prev = i > 0 ? sorted[i - 1] : null;

        const revGrowth = prev && prev.revenue && f.revenue
            ? ((f.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100
            : null;
        const npGrowth = prev && prev.net_profit && f.net_profit
            ? ((f.net_profit - prev.net_profit) / Math.abs(prev.net_profit)) * 100
            : null;

        rows += `<tr>
            <td style="font-weight:700;color:#fff;">${f.period || 'N/A'}</td>
            <td>${f.revenue != null ? fmtInt(f.revenue) : 'N/A'}</td>
            <td>${f.net_profit != null ? fmtInt(f.net_profit) : 'N/A'}</td>
            <td>${f.assets != null ? fmtInt(f.assets) : 'N/A'}</td>
            <td>${f.equity != null ? fmtInt(f.equity) : 'N/A'}</td>
            <td class="${colorClass(revGrowth)}" style="font-weight:600;">${revGrowth != null ? fmtPercent(revGrowth) : '—'}</td>
            <td class="${colorClass(npGrowth)}" style="font-weight:600;">${npGrowth != null ? fmtPercent(npGrowth) : '—'}</td>
        </tr>`;
    }
    tbody.innerHTML = rows;
}

// ================================================================
//  RENDER: TECHNICAL PANEL
// ================================================================

function renderTechnicalPanel(tech, priceScale = 1) {
    // Scale converts history-unit prices to display-unit (VND)
    const s = priceScale;
    // Score ring animation
    const arc = document.getElementById('tech-score-arc');
    const scoreVal = document.getElementById('tech-score-value');
    const circumference = 2 * Math.PI * 54; // ~339.29
    const offset = circumference - (tech.score / 100) * circumference;

    arc.style.strokeDashoffset = offset;
    scoreVal.textContent = tech.score;

    // Color the ring & value based on score
    let ringColor = 'var(--accent-blue)';
    if (tech.score >= 70) ringColor = 'var(--accent-green)';
    else if (tech.score <= 35) ringColor = 'var(--accent-red)';
    else if (tech.score <= 50) ringColor = 'var(--accent-amber)';
    arc.style.stroke = ringColor;
    scoreVal.style.color = ringColor;

    // Overall signal badge
    const signalBadge = document.getElementById('tech-overall-signal');
    signalBadge.textContent = tech.signal;
    if (tech.score >= 55) {
        signalBadge.className = 'badge bg-positive-subtle text-positive';
    } else if (tech.score <= 45) {
        signalBadge.className = 'badge bg-negative-subtle text-negative';
    } else {
        signalBadge.className = 'badge bg-blue-subtle text-accent-blue';
    }

    // Breakdown items
    const breakdownEl = document.getElementById('tech-breakdown');
    if (tech.factors && tech.factors.length > 0) {
        breakdownEl.innerHTML = tech.factors.map(f => {
            const ptsColor = f.pts > 0 ? 'text-positive' : f.pts < 0 ? 'text-negative' : 'text-neutral';
            const ptsSign = f.pts > 0 ? '+' : '';
            return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:4px 0;">
                <span style="color:var(--text-secondary);font-weight:500;">${f.name}</span>
                <span class="${ptsColor}" style="font-weight:700;">${ptsSign}${f.pts.toFixed(1)} pts</span>
            </div>`;
        }).join('');
    }

    // Indicator cards
    const indicatorsEl = document.getElementById('tech-indicators');
    const indicators = [
        { name: 'Giá hiện tại', value: tech.price != null ? fmtInt(Math.round(tech.price * s)) : 'N/A', signal: null },
        { name: 'EMA 34', value: tech.ema34 != null ? fmtInt(Math.round(tech.ema34 * s)) : 'N/A',
          signal: tech.price && tech.ema34 ? (tech.price > tech.ema34 ? 'TRÊN' : 'DƯỚI') : null,
          positive: tech.price && tech.ema34 ? tech.price > tech.ema34 : null },
        { name: 'MA 20', value: tech.ma20 != null ? fmtInt(Math.round(tech.ma20 * s)) : 'N/A',
          signal: tech.price && tech.ma20 ? (tech.price > tech.ma20 ? 'TRÊN' : 'DƯỚI') : null,
          positive: tech.price && tech.ma20 ? tech.price > tech.ma20 : null },
        { name: 'EMA 89', value: tech.ema89 != null ? fmtInt(Math.round(tech.ema89 * s)) : 'N/A',
          signal: tech.price && tech.ema89 ? (tech.price > tech.ema89 ? 'TRÊN' : 'DƯỚI') : null,
          positive: tech.price && tech.ema89 ? tech.price > tech.ema89 : null },
        { name: 'RSI (14)', value: tech.rsi != null ? tech.rsi.toFixed(2) : 'N/A',
          signal: tech.rsi != null ? (tech.rsi >= 70 ? 'QUÁ MUA' : tech.rsi <= 30 ? 'QUÁ BÁN' : 'TRUNG TÍNH') : null,
          positive: tech.rsi != null ? (tech.rsi < 70 && tech.rsi > 30) : null }
    ];

    indicatorsEl.innerHTML = indicators.map(ind => {
        let signalHTML = '';
        if (ind.signal) {
            const cls = ind.positive === true ? 'bg-positive-subtle text-positive'
                      : ind.positive === false ? 'bg-negative-subtle text-negative'
                      : 'bg-blue-subtle text-accent-blue';
            signalHTML = `<span class="tech-indicator-signal ${cls}">${ind.signal}</span>`;
        }
        return `<div class="tech-indicator-item">
            <div>
                <div class="tech-indicator-name">${ind.name}</div>
                <div class="tech-indicator-value" style="margin-top:4px;color:#fff;">${ind.value}</div>
            </div>
            ${signalHTML}
        </div>`;
    }).join('');
}

// ================================================================
//  MAIN: LOAD & RENDER
// ================================================================

async function loadStockDetail() {
    const ticker = getTickerFromUrl().toUpperCase().trim();
    const overlay = document.getElementById('loading-overlay');

    try {
        const res = await fetch(`${API_BASE_URL}/api/stock/detail?symbol=${ticker}`);
        if (!res.ok) throw new Error(`Không tìm thấy dữ liệu cho mã ${ticker}. HTTP ${res.status}`);

        const d = await res.json();

        // — Title & Identity
        document.title = `${d.symbol} — Chi Tiết Cổ Phiếu | VNStock Analytics`;
        const symbolEl = document.getElementById('stock-symbol');
        symbolEl.textContent = d.symbol;
        document.getElementById('stock-company-name').textContent = d.company_name;
        document.getElementById('stock-exchange').textContent = d.exchange || 'HOSE';
        document.getElementById('stock-sector').textContent = d.sector || 'N/A';

        // — Price
        const priceEl = document.getElementById('stock-price');
        if (priceEl) {
            priceEl.textContent = fmtCurrency(d.price).replace(' đ', '');
        }

        // — Apply market color to Symbol, Price and Currency unit
        const current_price = d.price || 0;
        const ref_price = d.ref_price || current_price;
        const ceiling_price = d.ceiling_price || (current_price * 1.07);
        const floor_price = d.floor_price || (current_price * 0.93);
        const eps = 0.001; // Avoid float inaccuracies

        let priceClass = 'text-warning';
        if (Math.abs(current_price - ceiling_price) < eps) {
            priceClass = 'text-purple';
        } else if (Math.abs(current_price - floor_price) < eps) {
            priceClass = 'text-cyan';
        } else if (current_price > ref_price + eps) {
            priceClass = 'text-success';
        } else if (current_price < ref_price - eps) {
            priceClass = 'text-danger';
        }

        // Clean previous classes if any
        symbolEl.classList.remove('text-purple', 'text-cyan', 'text-success', 'text-danger', 'text-warning');
        if (priceEl) priceEl.classList.remove('text-purple', 'text-cyan', 'text-success', 'text-danger', 'text-warning');

        symbolEl.classList.add(priceClass);
        if (priceEl) priceEl.classList.add(priceClass);

        const priceUnitEl = document.getElementById('stock-price-unit');
        if (priceUnitEl) {
            priceUnitEl.classList.remove('text-purple', 'text-cyan', 'text-success', 'text-danger', 'text-warning');
            priceUnitEl.classList.add(priceClass);
        }

        const chgEl = document.getElementById('stock-change');
        const chg = d.change_percent || 0;
        if (chgEl) {
            chgEl.textContent = fmtPercent(chg);
            chgEl.className = colorClass(chg);
            chgEl.style.fontWeight = '700';
            chgEl.style.fontSize = '15px';
        }

        // — Market cap & volume
        const marketCapEl = document.getElementById('stock-market-cap');
        if (marketCapEl) {
            if (d.market_cap) {
                const vndCap = Math.round(d.market_cap);
                const usdCap = (vndCap * 1000000000 / 25400) / 1000000000; // billion USD
                const usdCapStr = usdCap.toFixed(2);
                marketCapEl.innerHTML = `Capitalization ~ <strong>${fmtInt(vndCap)} tỷ VND</strong> (~$${usdCapStr}B USD) - Cập nhật thời gian thực`;
            } else {
                marketCapEl.textContent = '---';
            }
        }

        const volumeEl = document.getElementById('stock-volume');
        if (volumeEl) {
            volumeEl.textContent = d.volume_formatted || fmtInt(d.volume) || 'N/A';
        }

        const tradingVolValEl = document.getElementById('trading-volume-value');
        if (tradingVolValEl) {
            let formattedVol = '0';
            if (d.volume != null && !isNaN(d.volume)) {
                const vol = d.volume;
                if (vol >= 1000000) {
                    formattedVol = (vol / 1000000).toFixed(2) + 'M';
                } else if (vol >= 1000) {
                    formattedVol = (vol / 1000).toFixed(1) + 'K';
                } else {
                    formattedVol = vol.toLocaleString('vi-VN');
                }
            } else if (d.volume_formatted) {
                formattedVol = d.volume_formatted.replace(' CP', '').replace(' cp', '');
            } else {
                formattedVol = 'N/A';
            }
            tradingVolValEl.textContent = formattedVol;
        }

        // — Metric cards helper
        const setMetricBox = (id, valStr, descStr, descClass, valueClass = '') => {
            const valEl = document.getElementById(id);
            const descEl = document.getElementById(`${id}-desc`);
            if (valEl) {
                valEl.textContent = valStr;
                valEl.className = 'metric-box-value ' + valueClass;
            }
            if (descEl) {
                descEl.textContent = descStr;
                descEl.className = 'metric-box-desc ' + descClass;
            }
        };

        // 1. P/E
        let peVal = 'N/A';
        let peDesc = 'Không có dữ liệu';
        let peDescClass = 'text-neutral';
        let peValClass = 'text-neutral';
        if (d.pe != null && !isNaN(d.pe)) {
            peVal = fmt(d.pe);
            if (d.pe < 8) {
                peDesc = 'Dưới median 5N';
                peDescClass = 'text-positive';
                peValClass = 'text-positive';
            } else if (d.pe < 15) {
                peDesc = 'Sát trung vị 5N';
                peDescClass = 'text-warning';
                peValClass = 'text-warning';
            } else {
                peDesc = 'Giá premium cao';
                peDescClass = 'text-negative';
                peValClass = 'text-negative';
            }
        }
        setMetricBox('metric-pe', peVal, peDesc, peDescClass, peValClass);

        // 2. P/B
        let pbVal = 'N/A';
        let pbDesc = 'Không có dữ liệu';
        let pbDescClass = 'text-neutral';
        let pbValClass = 'text-neutral';
        if (d.pb != null && !isNaN(d.pb)) {
            pbVal = fmt(d.pb);
            if (d.pb < 1.0) {
                pbDesc = 'Dưới giá trị sổ sách';
                pbDescClass = 'text-positive';
                pbValClass = 'text-positive';
            } else if (d.pb < 1.8) {
                pbDesc = 'Định giá hợp lý';
                pbDescClass = 'text-positive';
                pbValClass = 'text-positive';
            } else {
                pbDesc = 'Giá premium 25%';
                pbDescClass = 'text-warning';
                pbValClass = 'text-warning';
            }
        }
        setMetricBox('metric-pb', pbVal, pbDesc, pbDescClass, pbValClass);

        // 3. ROE 2025
        let roeVal = 'N/A';
        let roeDesc = 'Không có dữ liệu';
        let roeDescClass = 'text-neutral';
        let roeValClass = 'text-neutral';
        if (d.roe != null && !isNaN(d.roe)) {
            roeVal = fmt(d.roe) + '%';
            if (d.roe > 15) {
                roeDesc = 'Hiệu quả xuất sắc';
                roeDescClass = 'text-positive';
                roeValClass = 'text-positive';
            } else if (d.roe > 7) {
                roeDesc = 'Tăng trưởng ổn định';
                roeDescClass = 'text-positive';
                roeValClass = 'text-positive';
            } else {
                roeDesc = 'Hiệu suất thấp';
                roeDescClass = 'text-warning';
                roeValClass = 'text-warning';
            }
        }
        setMetricBox('metric-roe', roeVal, roeDesc, roeDescClass, roeValClass);

        // 4. BVPS 2025
        let bvpsVal = 'N/A';
        let bvpsDesc = 'Không có dữ liệu';
        let bvpsDescClass = 'text-neutral';
        let bvpsValClass = 'text-neutral';
        if (d.bvps != null && !isNaN(d.bvps)) {
            bvpsVal = fmtInt(d.bvps);
            bvpsDesc = 'Tích lũy tài sản tốt';
            bvpsDescClass = 'text-positive';
            bvpsValClass = 'text-positive';
        }
        setMetricBox('metric-bvps', bvpsVal, bvpsDesc, bvpsDescClass, bvpsValClass);

        // 5. LNST 2025
        let lnstVal = 'N/A';
        let lnstDesc = 'Không có dữ liệu';
        let lnstDescClass = 'text-neutral';
        let lnstValClass = 'text-neutral';
        if (d.lnst != null && !isNaN(d.lnst)) {
            lnstVal = fmtInt(d.lnst) + ' tỷ';
            if (d.lnst > 0) {
                lnstDesc = '↑ phục hồi từ đáy';
                lnstDescClass = 'text-positive';
                lnstValClass = 'text-positive';
            } else {
                lnstDesc = 'LNST sụt giảm';
                lnstDescClass = 'text-negative';
                lnstValClass = 'text-negative';
            }
        }
        setMetricBox('metric-lnst', lnstVal, lnstDesc, lnstDescClass, lnstValClass);

        // 6. SẢN LƯỢNG (Volume)
        let volVal = 'N/A';
        let volDesc = 'Duy trì ổn định';
        let volDescClass = 'text-positive';
        let volValClass = 'text-positive';
        if (d.volume != null) {
            volVal = d.volume_formatted || fmtInt(d.volume);
            volDesc = 'Thanh khoản thị trường';
            volDescClass = 'text-positive';
            volValClass = 'text-neutral';
        }
        setMetricBox('metric-volume', volVal, volDesc, volDescClass, volValClass);

        // — Financial Table
        renderFinancialTable(d.financials);

        // — Technical Panel (compute from raw history)
        // Detect price scale: VCI history returns in thousands (23.7), price_board in VND (23700)
        let priceScale = 1;
        if (d.history && d.history.length > 0 && d.price) {
            const lastClose = d.history[d.history.length - 1].close;
            if (lastClose && d.price / lastClose > 100) {
                priceScale = Math.round(d.price / lastClose);
            }
        }
        const tech = computeTechnicals(d.history);
        renderTechnicalPanel(tech, priceScale);

        // — Hide loader
        if (overlay) overlay.classList.add('hidden');

    } catch (err) {
        console.error('Error:', err);
        if (overlay) overlay.classList.add('hidden');

        // Show error in financial table area
        const tbody = document.getElementById('financial-table-body');
        tbody.innerHTML = `<tr><td colspan="7" class="error-state">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <h4 style="color:#fff;font-weight:700;font-size:16px;margin:8px 0;">${err.message}</h4>
            <a href="index.html" style="display:inline-block;margin-top:12px;background:var(--bg-item);border:1px solid var(--border-color);color:#fff;font-size:12px;font-weight:600;padding:8px 18px;border-radius:10px;text-decoration:none;">Quay lại Trang chủ</a>
        </td></tr>`;
    }
}

// ================================================================
//  QUICK SEARCH
// ================================================================

function quickSearch() {
    const input = document.getElementById('quick-search-input');
    const ticker = input.value.trim().toUpperCase();
    if (ticker.length >= 3 && ticker.length <= 5) {
        window.location.href = `detail.html?ticker=${ticker}`;
    } else {
        alert('Mã cổ phiếu không hợp lệ. Vui lòng nhập từ 3 đến 5 ký tự.');
    }
}

document.getElementById('quick-search-input')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') quickSearch();
});

// ================================================================
//  INIT
// ================================================================
window.addEventListener('DOMContentLoaded', loadStockDetail);
