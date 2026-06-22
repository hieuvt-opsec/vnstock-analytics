const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '' || window.location.protocol === 'file:'
    ? 'https://vnstock-analytics.onrender.com'
    : 'https://vnstock-analytics.onrender.com'; // Fallback production URL placeholder

console.log("DEBUG: window.location.hostname = '" + window.location.hostname + "'");
console.log("DEBUG: window.location.protocol = '" + window.location.protocol + "'");
console.log("DEBUG: Resolved API_BASE_URL = '" + API_BASE_URL + "'");

// Application State
let currentSymbol = 'TCB';
let chartInstance = null;
let candlestickSeries = null;
let volumeSeries = null;
let isApiOnline = false;
let screenerData = [];
let marketBreadthChartInstance = null;
let foreignFlowChartInstance = null;

// DOM Elements
const apiStatusEl = document.getElementById('api-status');
const chartSymbolEl = document.getElementById('chart-symbol');
const chartCompanyEl = document.getElementById('chart-company-name');
const chartLoaderEl = document.getElementById('chart-loader');
const stockSearchInput = document.getElementById('stock-search-input');
const topGainersEl = document.getElementById('top-gainers-list');
const topLosersEl = document.getElementById('top-losers-list');
const screenerTableBody = document.getElementById('screener-table-body');
const chatMessagesEl = document.getElementById('chat-messages');
const chatInputEl = document.getElementById('chat-input');

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
    // Initialize empty chart structure
    initChart();

    // Check API Status and Load Data
    checkApiStatus().then(() => {
        loadMarketOverview();
        loadStockData(currentSymbol);
        loadMarketNews();
        loadScreenerData();
    });

    // Periodically ping backend
    setInterval(checkApiStatus, 15000);
});

// 1. Tab Switching Logic
function switchTab(tabId) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('block');
    });

    // Show selected tab content
    const selectedContent = document.getElementById(`content-${tabId}`);
    if (selectedContent) {
        selectedContent.classList.remove('hidden');
        selectedContent.classList.add('block');
    }

    // Update active tab styles
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.add('active');

    // Redraw chart when switching back to dashboard to prevent sizing bugs
    if (tabId === 'dashboard' && chartInstance) {
        setTimeout(() => {
            const container = document.getElementById('chart-container');
            if (container) {
                chartInstance.resize(container.clientWidth, 420);
                chartInstance.timeScale().fitContent();
            }
        }, 100);
    }
}

// Helper for fetch with timeout
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 15000 } = options;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

// 2. API Connection Helper
async function checkApiStatus() {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/`);
        if (response.ok) {
            isApiOnline = true;
            apiStatusEl.innerHTML = 'API: Trực tuyến';
            apiStatusEl.parentElement.classList.remove('border-accentred/30', 'bg-accentred/10');
            apiStatusEl.parentElement.classList.add('border-accentgreen/30', 'bg-darkitem');
            apiStatusEl.previousElementSibling.classList.replace('bg-accentred', 'bg-accentgreen');
        } else {
            throw new Error();
        }
    } catch (error) {
        isApiOnline = false;
        apiStatusEl.innerHTML = 'API: Ngoại tuyến (Đang mô phỏng)';
        apiStatusEl.parentElement.classList.remove('border-accentgreen/30', 'bg-darkitem');
        apiStatusEl.parentElement.classList.add('border-accentred/30', 'bg-accentred/10');
        apiStatusEl.previousElementSibling.classList.replace('bg-accentgreen', 'bg-accentred');
    }
}

// 3. TradingView Chart Initialization
function initChart() {
    const container = document.getElementById('chart-container');
    if (!container) return;

    // Clear any leftover divs inside
    container.innerHTML = '';

    if (typeof LightweightCharts === 'undefined') {
        container.innerHTML = `
            <div class="absolute inset-0 bg-darkcard flex flex-col items-center justify-center p-4 text-center">
                <i class="fa-solid fa-circle-exclamation text-yellow-500 text-3xl mb-2"></i>
                <span class="text-sm font-semibold text-white">Không thể tải thư viện biểu đồ TradingView</span>
                <span class="text-xs text-textmuted mt-1">Đang chạy ở chế độ ngoại tuyến hoặc kết nối mạng bị chặn (CDN unpkg.com)</span>
            </div>
        `;
        console.warn("TradingView Lightweight Charts is not defined. Running in chart-less mode.");
        return;
    }

    // Create Chart Instance
    chartInstance = LightweightCharts.createChart(container, {
        height: 420,
        layout: {
            background: { type: 'solid', color: '#11151F' }, // Matching card dark color
            textColor: '#848E9C',
            fontSize: 12,
            fontFamily: 'Inter, sans-serif'
        },
        grid: {
            vertLines: { color: 'rgba(35, 41, 54, 0.4)' },
            horzLines: { color: 'rgba(35, 41, 54, 0.4)' }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                width: 1,
                color: '#2F80ED',
                style: 3, // dashed
            },
            horzLine: {
                width: 1,
                color: '#2F80ED',
                style: 3,
            }
        },
        rightPriceScale: {
            borderColor: '#232936',
            scaleMargins: {
                top: 0.1,
                bottom: 0.25,
            },
        },
        timeScale: {
            borderColor: '#232936',
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 5,
        }
    });

    // Add Candlestick Series
    candlestickSeries = chartInstance.addCandlestickSeries({
        upColor: '#00C087',
        downColor: '#F94144',
        borderDownColor: '#F94144',
        borderUpColor: '#00C087',
        wickDownColor: '#F94144',
        wickUpColor: '#00C087',
    });

    // Add Volume Series overlayed
    volumeSeries = chartInstance.addHistogramSeries({
        color: 'rgba(38, 166, 154, 0.5)',
        priceFormat: {
            type: 'volume',
        },
        priceScaleId: '', // overlay
    });

    volumeSeries.priceScale().applyOptions({
        scaleMargins: {
            top: 0.8, // Volume height limited to bottom 20%
            bottom: 0,
        },
    });

    // Responsive design resize hook
    const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0 || !entries[0].contentRect) { return; }
        const { width } = entries[0].contentRect;
        if (chartInstance) {
            chartInstance.resize(width, 420);
        }
    });
    resizeObserver.observe(container);
}

// 4. Load Market Overview
async function loadMarketOverview() {
    try {
        let data;
        if (isApiOnline) {
            const response = await fetchWithTimeout(`${API_BASE_URL}/api/market-overview`);
            data = await response.json();
        } else {
            // Mock market overview
            data = getMockMarketOverview();
        }

        // Update Indexes
        data.indexes.forEach(idx => {
            const isPositive = idx.change >= 0;
            const colorClass = isPositive ? 'text-accentgreen' : 'text-accentred';
            const iconClass = isPositive ? 'fa-trend-up' : 'fa-trend-down';

            if (idx.name === 'VNINDEX') {
                document.getElementById('idx-vnindex-val').innerHTML = formatNumber(idx.value);
                document.getElementById('idx-vnindex-val').className = `text-2xl font-bold mt-1 ${colorClass}`;
                document.getElementById('idx-vnindex-chg').innerHTML = `${isPositive ? '+' : ''}${idx.change} (${isPositive ? '+' : ''}${idx.change_percent}%)`;
                document.getElementById('idx-vnindex-chg').className = `text-xs font-medium ${colorClass}`;
                document.getElementById('idx-vnindex-val').parentElement.nextElementSibling.className = `${colorClass}/10 text-5xl absolute -right-2 -bottom-2`;
                document.getElementById('idx-vnindex-val').parentElement.nextElementSibling.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
            } else if (idx.name === 'VN30') {
                document.getElementById('idx-vn30-val').innerHTML = formatNumber(idx.value);
                document.getElementById('idx-vn30-val').className = `text-2xl font-bold mt-1 ${colorClass}`;
                document.getElementById('idx-vn30-chg').innerHTML = `${isPositive ? '+' : ''}${idx.change} (${isPositive ? '+' : ''}${idx.change_percent}%)`;
                document.getElementById('idx-vn30-chg').className = `text-xs font-medium ${colorClass}`;
                document.getElementById('idx-vn30-val').parentElement.nextElementSibling.className = `${colorClass}/10 text-5xl absolute -right-2 -bottom-2`;
                document.getElementById('idx-vn30-val').parentElement.nextElementSibling.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
            } else if (idx.name === 'HNX-INDEX') {
                document.getElementById('idx-hnx-val').innerHTML = formatNumber(idx.value);
                document.getElementById('idx-hnx-val').className = `text-2xl font-bold mt-1 ${colorClass}`;
                document.getElementById('idx-hnx-chg').innerHTML = `${isPositive ? '+' : ''}${idx.change} (${isPositive ? '+' : ''}${idx.change_percent}%)`;
                document.getElementById('idx-hnx-chg').className = `text-xs font-medium ${colorClass}`;
                document.getElementById('idx-hnx-val').parentElement.nextElementSibling.className = `${colorClass}/10 text-5xl absolute -right-2 -bottom-2`;
                document.getElementById('idx-hnx-val').parentElement.nextElementSibling.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
            }
        });

        // Update Liquidity
        document.getElementById('market-liquidity').innerHTML = `${formatNumber(data.liquidity)} tỷ VND`;

        // Update Market Breadth
        const rising = data.market_breadth.rising || 0;
        const flat = data.market_breadth.flat || 0;
        const falling = data.market_breadth.falling || 0;
        const totalBreadth = rising + flat + falling;

        const risingPct = totalBreadth > 0 ? ((rising / totalBreadth) * 100).toFixed(1) : 0;
        const flatPct = totalBreadth > 0 ? ((flat / totalBreadth) * 100).toFixed(1) : 0;
        const fallingPct = totalBreadth > 0 ? ((falling / totalBreadth) * 100).toFixed(1) : 0;

        document.getElementById('breadth-rising-text').innerHTML = `${rising} Tăng`;
        document.getElementById('breadth-rising-pct').innerHTML = `${risingPct}%`;
        document.getElementById('breadth-flat-text').innerHTML = `${flat} Đi ngang`;
        document.getElementById('breadth-flat-pct').innerHTML = `${flatPct}%`;
        document.getElementById('breadth-falling-text').innerHTML = `${falling} Giảm`;
        document.getElementById('breadth-falling-pct').innerHTML = `${fallingPct}%`;

        updateMarketBreadthChart(rising, flat, falling);

        // Render Top Gainers / Losers
        topGainersEl.innerHTML = '';
        data.top_gainers.forEach(item => {
            topGainersEl.appendChild(createLeaderRow(item, true));
        });

        topLosersEl.innerHTML = '';
        data.top_losers.forEach(item => {
            topLosersEl.appendChild(createLeaderRow(item, false));
        });

    } catch (error) {
        console.error('Error loading market overview:', error);
    }
}

function createLeaderRow(item, isGainer) {
    const div = document.createElement('div');
    div.className = 'flex justify-between items-center bg-darkitem border border-bordergray/50 px-3 py-2 rounded-xl text-xs hover:border-accentblue cursor-pointer transition-all';
    div.onclick = () => selectStock(item.symbol);
    div.innerHTML = `
        <span class="font-bold text-white">${item.symbol}</span>
        <span class="text-textmuted">${formatPrice(item.price)}</span>
        <span class="font-semibold ${isGainer ? 'text-accentgreen' : 'text-accentred'}">${isGainer ? '+' : ''}${item.change_percent}%</span>
    `;
    return div;
}

// 5. Load detailed Stock data for charting
async function loadStockData(symbol) {
    symbol = symbol.toUpperCase();
    currentSymbol = symbol;
    chartSymbolEl.innerHTML = symbol;

    // Toggle loader
    if (chartLoaderEl) chartLoaderEl.classList.remove('hidden');

    try {
        let result;
        if (isApiOnline) {
            const response = await fetchWithTimeout(`${API_BASE_URL}/api/stock-analysis/${symbol}`);
            if (!response.ok) throw new Error('API failure');
            result = await response.json();
        } else {
            result = getMockStockAnalysis(symbol);
            result.company_name = getCompanyName(symbol);
            result.fundamentals = getMockFundamentalData(symbol);
            result.foreign_flow = getMockForeignFlow(symbol);
            result.shareholders = getMockShareholders(symbol);
        }

        const history = result.history;
        if (!history || history.length === 0) return;

        // Update company name dynamically from API payload using innerText to prevent XSS and fix UI bug
        chartCompanyEl.innerText = result.company_name || getCompanyName(symbol);

        // Update Chi tiết AI link in chart header dynamically
        const detailBtn = document.getElementById('view-detail-btn');
        if (detailBtn) {
            detailBtn.href = `detail.html?ticker=${symbol}`;
        }

        // Update price display if you have one... (optional, not strictly in instruction but good for sync)

        // Render sub-components
        if (result.fundamentals) renderFundamentals(result.fundamentals);
        loadForeignFlow(symbol);
        if (result.shareholders) renderShareholders(result.shareholders);

        // Convert to chart format
        const candleData = history.map(item => ({
            time: item.date,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close
        }));

        const volumeData = history.map(item => ({
            time: item.date,
            value: item.volume,
            color: item.close >= item.open ? 'rgba(0, 192, 135, 0.3)' : 'rgba(249, 65, 68, 0.3)'
        }));

        // Plot series if chart library is loaded
        if (candlestickSeries && volumeSeries && chartInstance) {
            candlestickSeries.setData(candleData);
            volumeSeries.setData(volumeData);
            chartInstance.timeScale().fitContent();
        }

        // Update Indicators display based on latest row
        const latest = history[history.length - 1];

        document.getElementById('detail-ma20').innerHTML = latest.ma20 ? formatPrice(latest.ma20) : '-';
        document.getElementById('detail-ma50').innerHTML = latest.ma50 ? formatPrice(latest.ma50) : '-';

        // Trend Status
        const trendEl = document.getElementById('detail-trend-status');
        if (latest.close > latest.ma20 && latest.ma20 > latest.ma50) {
            trendEl.innerHTML = 'Tăng trưởng (Bullish)';
            trendEl.className = 'font-bold text-accentgreen';
        } else if (latest.close < latest.ma20 && latest.ma20 < latest.ma50) {
            trendEl.innerHTML = 'Suy giảm (Bearish)';
            trendEl.className = 'font-bold text-accentred';
        } else {
            trendEl.innerHTML = 'Đi ngang (Sideways)';
            trendEl.className = 'font-bold text-textmuted';
        }

        // RSI
        const rsiVal = latest.rsi ? Math.round(latest.rsi) : 50;
        document.getElementById('detail-rsi-val').innerHTML = rsiVal;

        const rsiStatusEl = document.getElementById('detail-rsi-status');
        const rsiProgressEl = document.getElementById('rsi-progress-bar');
        rsiProgressEl.style.width = `${rsiVal}%`;

        if (rsiVal >= 70) {
            rsiStatusEl.innerHTML = 'Quá mua (Overbought)';
            rsiStatusEl.className = 'text-xs text-accentred font-semibold';
            rsiProgressEl.className = 'bg-accentred h-full';
        } else if (rsiVal <= 30) {
            rsiStatusEl.innerHTML = 'Quá bán (Oversold)';
            rsiStatusEl.className = 'text-xs text-accentblue font-semibold';
            rsiProgressEl.className = 'bg-accentblue h-full';
        } else {
            rsiStatusEl.innerHTML = 'Trung tính (Neutral)';
            rsiStatusEl.className = 'text-xs text-textmuted font-semibold';
            rsiProgressEl.className = 'bg-accentgreen h-full';
        }

        // FVG Signal (check last 5 days for latest FVG)
        let lastFvg = null;
        for (let i = history.length - 1; i >= Math.max(0, history.length - 10); i--) {
            if (history[i].fvg_type !== 0.0) {
                lastFvg = history[i];
                break;
            }
        }

        const fvgSignalEl = document.getElementById('detail-fvg-signal');
        const fvgZoneEl = document.getElementById('detail-fvg-zone');

        if (lastFvg) {
            const isBullish = lastFvg.fvg_type === 1.0;
            fvgSignalEl.innerHTML = isBullish ? 'Bullish FVG (Tăng)' : 'Bearish FVG (Giảm)';
            fvgSignalEl.className = isBullish ? 'font-bold text-accentgreen' : 'font-bold text-accentred';
            fvgZoneEl.innerHTML = `${formatPrice(lastFvg.fvg_bottom)} - ${formatPrice(lastFvg.fvg_top)} đ`;
            fvgZoneEl.className = isBullish
                ? 'bg-accentgreen/10 text-accentgreen border border-accentgreen/30 rounded-lg p-1.5 text-center text-xs font-mono font-semibold'
                : 'bg-accentred/10 text-accentred border border-accentred/30 rounded-lg p-1.5 text-center text-xs font-mono font-semibold';
        } else {
            fvgSignalEl.innerHTML = 'Không có';
            fvgSignalEl.className = 'font-bold text-textmuted';
            fvgZoneEl.innerHTML = 'Không có vùng gap';
            fvgZoneEl.className = 'bg-darkitem border border-bordergray rounded-lg p-1.5 text-center text-xs font-mono text-textmuted';
        }

    } catch (error) {
        console.error('Error loading stock chart data:', error);
    } finally {
        if (chartLoaderEl) chartLoaderEl.classList.add('hidden');
    }
}

// Search stock handler
function searchStock() {
    const val = stockSearchInput.value.trim().toUpperCase();
    if (val) {
        selectStock(val);
    }
}

// Select stock on click
function selectStock(symbol) {
    loadStockData(symbol);
    switchTab('dashboard');
    // Scroll to chart
    document.getElementById('chart-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// 6. Load Screener Data
async function loadScreenerData() {
    try {
        if (isApiOnline) {
            const response = await fetchWithTimeout(`${API_BASE_URL}/api/stock-screener`);
            screenerData = await response.json();
        } else {
            screenerData = getMockScreenerData();
        }

        renderScreenerTable(screenerData);

    } catch (error) {
        console.error('Error loading screener data:', error);
    }
}

function renderScreenerTable(data) {
    screenerTableBody.innerHTML = '';

    if (data.length === 0) {
        screenerTableBody.innerHTML = `<tr><td colspan="9" class="py-10 text-center text-textmuted">Không có mã nào khớp với bộ lọc</td></tr>`;
        return;
    }

    data.forEach(item => {
        const isPositive = item.change >= 0;
        const colorClass = isPositive ? 'text-accentgreen' : 'text-accentred';
        const tr = document.createElement('tr');
        tr.className = 'border-b border-bordergray';

        // FVG Signal badge styling
        let fvgBadge = '<span class="text-textmuted text-xs">-</span>';
        if (item.fvg_signal.includes('Bullish')) {
            fvgBadge = '<span class="bg-accentgreen/10 text-accentgreen border border-accentgreen/30 text-xs px-2 py-0.5 rounded">Bullish</span>';
        } else if (item.fvg_signal.includes('Bearish')) {
            fvgBadge = '<span class="bg-accentred/10 text-accentred border border-accentred/30 text-xs px-2 py-0.5 rounded">Bearish</span>';
        }

        // Trend Badge styling
        let trendBadge = '<span class="text-textmuted text-xs">Sideways</span>';
        if (item.trend === 'Bullish') {
            trendBadge = '<span class="text-accentgreen"><i class="fa-solid fa-circle-chevron-up mr-1 text-xs"></i> Tăng</span>';
        } else if (item.trend === 'Bearish') {
            trendBadge = '<span class="text-accentred"><i class="fa-solid fa-circle-chevron-down mr-1 text-xs"></i> Giảm</span>';
        }

        // RSI formatting with safety
        const rsiVal = item.rsi ? Math.round(item.rsi) : '-';
        let rsiColor = 'text-textlight';
        if (item.rsi_status === 'Overbought') rsiColor = 'text-accentred font-bold';
        if (item.rsi_status === 'Oversold') rsiColor = 'text-accentblue font-bold';

        tr.innerHTML = `
            <td class="py-4 px-4 font-bold text-white text-base">${item.symbol}</td>
            <td class="py-4 px-4 text-xs text-textmuted">${item.name}</td>
            <td class="py-4 px-4 text-right font-bold text-white">${formatPrice(item.price)}</td>
            <td class="py-4 px-4 text-right font-bold ${colorClass}">${isPositive ? '+' : ''}${item.change_percent}%</td>
            <td class="py-4 px-4 text-center ${rsiColor}">${rsiVal}</td>
            <td class="py-4 px-4 text-center text-xs font-mono text-textmuted">${item.ma20 ? formatPrice(item.ma20) : '-'} / ${item.ma50 ? formatPrice(item.ma50) : '-'}</td>
            <td class="py-4 px-4 text-center">${fvgBadge}</td>
            <td class="py-4 px-4 text-center text-sm font-semibold">${trendBadge}</td>
            <td class="py-4 px-4 text-center">
                <div class="flex items-center justify-center gap-1.5">
                    <button onclick="selectStock('${item.symbol}')" class="text-accentblue hover:text-white border border-accentblue/30 hover:bg-accentblue text-xs font-semibold px-2 py-1.5 rounded-lg transition-all">
                        Biểu đồ
                    </button>
                    <a href="detail.html?ticker=${item.symbol}" class="text-textmuted hover:text-white border border-bordergray hover:bg-darkitem text-xs font-semibold px-2 py-1.5 rounded-lg transition-all">
                        Chi tiết
                    </a>
                </div>
            </td>
        `;
        screenerTableBody.appendChild(tr);
    });
}

// 7. Screener Filter Button triggers
function filterScreener(filterType) {
    // Style active button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`btn-filter-${filterType}`).classList.add('active');

    // Filter logic
    let filtered = screenerData;

    if (filterType === 'bullish') {
        filtered = screenerData.filter(item => item.trend === 'Bullish');
    } else if (filterType === 'oversold') {
        filtered = screenerData.filter(item => item.rsi_status === 'Oversold');
    } else if (filterType === 'overbought') {
        filtered = screenerData.filter(item => item.rsi_status === 'Overbought');
    } else if (filterType === 'fvg') {
        filtered = screenerData.filter(item => item.fvg_signal !== 'None');
    }

    renderScreenerTable(filtered);
}

// 8. AI Agent Chat Logic
function handleChatSubmit(e) {
    e.preventDefault();
    const text = chatInputEl.value.trim();
    if (!text) return;

    askAI(text);
}

function parseMarkdown(text) {
    if (!text) return '';

    // Escape HTML to prevent XSS
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Headings (### title, ## title, # title)
    html = html.replace(/^### (.*$)/gim, '<h4 class="text-sm font-bold text-white mt-3 mb-1">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 class="text-base font-bold text-white mt-4 mb-2">$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2 class="text-lg font-bold text-white mt-5 mb-3">$1</h2>');

    // Bold (**text** or __text__)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Italic (*text* or _text_)
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');

    // Bullet points (- item or * item)
    html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li class="ml-4 list-disc text-xs my-1">$1</li>');

    // Horizontal Rule (---)
    html = html.replace(/^---$/gim, '<hr class="border-bordergray my-3">');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

async function askAI(question) {
    chatInputEl.value = '';

    // 1. Append User Message
    appendMessage(question, true);

    // 2. Scroll to bottom
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

    // 3. Show typing indicator
    const typingId = showTypingIndicator();

    try {
        // Extract symbol from question, default to currentSymbol or 'TCB'
        let symbol = currentSymbol || 'TCB';
        const supportedSymbols = ['FPT', 'HPG', 'VNM', 'SSI', 'TCB', 'VIC', 'VHM', 'MWG', 'STB', 'MBB'];
        const cleanQ = question.toUpperCase();
        for (let sym of supportedSymbols) {
            if (cleanQ.includes(sym)) {
                symbol = sym;
                break;
            }
        }

        // Call backend API
        const response = await fetch(`${API_BASE_URL}/api/ai-agent/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                symbol: symbol,
                message: question
            })
        });

        // Remove typing indicator
        removeTypingIndicator(typingId);

        if (response.ok) {
            const data = await response.json();
            const parsedResponse = parseMarkdown(data.response);
            appendMessage(parsedResponse, false);
        } else {
            let errMsg = 'Không thể kết nối với AI Agent. Vui lòng thử lại sau.';
            try {
                const errData = await response.json();
                errMsg = errData.detail || errMsg;
            } catch (e) { }
            appendMessage(`<span class="text-accentred font-semibold">${errMsg}</span>`, false);
        }
    } catch (error) {
        removeTypingIndicator(typingId);
        console.error('Error in askAI:', error);
        appendMessage('<span class="text-accentred font-semibold">Lỗi kết nối mạng. Không thể gửi yêu cầu đến AI Agent.</span>', false);
    }

    // Scroll again
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function appendMessage(text, isUser) {
    const msgDiv = document.createElement('div');
    msgDiv.className = isUser
        ? 'flex items-start gap-3 justify-end animate-fade-in'
        : 'flex items-start gap-3 max-w-[85%] animate-fade-in';

    const avatarHtml = isUser
        ? `<div class="w-8 h-8 rounded-lg bg-accentblue flex items-center justify-center text-white flex-shrink-0 text-xs font-bold">U</div>`
        : `<div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-accentblue to-purple-600 flex items-center justify-center text-white flex-shrink-0 text-xs"><i class="fa-solid fa-robot"></i></div>`;

    const bubbleHtml = isUser
        ? `<div class="user-msg-bubble rounded-2xl rounded-tr-none p-4 text-sm leading-relaxed shadow-sm">${text}</div>`
        : `<div class="bg-darkitem border border-bordergray rounded-2xl rounded-tl-none p-4 text-sm leading-relaxed text-textlight shadow-sm">${text}</div>`;

    msgDiv.innerHTML = isUser ? `${bubbleHtml}${avatarHtml}` : `${avatarHtml}${bubbleHtml}`;
    chatMessagesEl.appendChild(msgDiv);
}

function showTypingIndicator() {
    const indicatorId = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.id = indicatorId;
    div.className = 'flex items-start gap-3 max-w-[85%] animate-fade-in';
    div.innerHTML = `
        <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-accentblue to-purple-600 flex items-center justify-center text-white flex-shrink-0 text-xs"><i class="fa-solid fa-robot"></i></div>
        <div class="bg-darkitem border border-bordergray rounded-2xl rounded-tl-none p-4 text-sm text-textmuted flex items-center gap-2 shadow-sm">
            <span>AI đang phân tích...</span>
            <div class="flex gap-1">
                <span class="w-1.5 h-1.5 bg-textmuted rounded-full animate-bounce" style="animation-delay: 0s"></span>
                <span class="w-1.5 h-1.5 bg-textmuted rounded-full animate-bounce" style="animation-delay: 0.15s"></span>
                <span class="w-1.5 h-1.5 bg-textmuted rounded-full animate-bounce" style="animation-delay: 0.3s"></span>
            </div>
        </div>
    `;
    chatMessagesEl.appendChild(div);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    return indicatorId;
}

function removeTypingIndicator(id) {
    const indicator = document.getElementById(id);
    if (indicator) {
        indicator.remove();
    }
}

// 9. Format helpers & Mock Data Backups for offline state
function formatNumber(num) {
    return new Intl.NumberFormat('vi-VN').format(num);
}

function formatPrice(price) {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(price);
}

function getCompanyName(symbol) {
    const list = {
        "FPT": "CTCP FPT",
        "HPG": "CTCP Tập đoàn Hòa Phát",
        "VNM": "CTCP Sữa Việt Nam",
        "SSI": "CTCP Chứng khoán SSI",
        "TCB": "Ngân hàng Kỹ thương Việt Nam",
        "VIC": "Tập đoàn Vingroup",
        "VHM": "CTCP Vinhomes",
        "MWG": "CTCP Đầu tư Thế giới Di động",
        "STB": "Ngân hàng Sacombank",
        "MBB": "Ngân hàng Quân đội"
    };
    return list[symbol] || `Mã cổ phiếu ${symbol}`;
}

function getMockPrice(symbol) {
    const prices = {
        "FPT": 130000, "HPG": 28500, "VNM": 66000, "SSI": 34000, "TCB": 47000,
        "VIC": 42000, "VHM": 38000, "MWG": 62000, "STB": 29000, "MBB": 23000
    };
    return prices[symbol] || 50000;
}

// Mock Data Generators matching Backend formats
function getMockMarketOverview() {
    return {
        "indexes": [
            { "name": "VNINDEX", "value": 1282.40, "change": 12.50, "change_percent": 0.98 },
            { "name": "VN30", "value": 1312.10, "change": 14.80, "change_percent": 1.14 },
            { "name": "HNX-INDEX", "value": 245.30, "change": -1.20, "change_percent": -0.49 }
        ],
        "liquidity": 18240.5,
        "market_breadth": { "rising": 218, "flat": 75, "falling": 142 },
        "top_gainers": [
            { "symbol": "FPT", "price": 135000, "change_percent": 6.8 },
            { "symbol": "SSI", "price": 36200, "change_percent": 5.4 },
            { "symbol": "TCB", "price": 49200, "change_percent": 4.6 }
        ],
        "top_losers": [
            { "symbol": "VIC", "price": 40800, "change_percent": -3.2 },
            { "symbol": "VHM", "price": 37100, "change_percent": -2.5 },
            { "symbol": "VNM", "price": 64800, "change_percent": -1.8 }
        ]
    };
}

function getMockStockAnalysis(symbol) {
    const basePrice = getMockPrice(symbol);
    const history = [];
    const dateLimit = 100;

    // Seed price array
    let prices = [basePrice];
    for (let i = 1; i < dateLimit; i++) {
        prices.push(prices[i - 1] * (1 + (Math.random() * 0.03 - 0.014)));
    }

    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - dateLimit * 1.5);

    let dates = [];
    while (dates.length < dateLimit) {
        if (baseDate.getDay() !== 0 && baseDate.getDay() !== 6) { // Skip weekends
            dates.push(baseDate.toISOString().split('T')[0]);
        }
        baseDate.setDate(baseDate.getDate() + 1);
    }

    // Build OHLCV
    for (let i = 0; i < dateLimit; i++) {
        const close = prices[i];
        const prev = i > 0 ? prices[i - 1] : close;
        const ohlcSpread = close * 0.02;
        const open = prev + (Math.random() - 0.5) * (ohlcSpread * 0.5);
        const high = Math.max(open, close) + Math.random() * (ohlcSpread * 0.5);
        const low = Math.min(open, close) - Math.random() * (ohlcSpread * 0.5);

        // Calculate dynamic indicators (moving averages approximation)
        let ma20 = null;
        let ma50 = null;
        if (i >= 20) {
            let sum = 0;
            for (let j = i - 19; j <= i; j++) sum += prices[j];
            ma20 = sum / 20;
        }
        if (i >= 50) {
            let sum = 0;
            for (let j = i - 49; j <= i; j++) sum += prices[j];
            ma50 = sum / 50;
        }

        // RSI approximation
        let rsi = 50;
        if (symbol === 'FPT') rsi = 72 + (Math.random() * 5 - 2.5);
        else if (symbol === 'VIC') rsi = 28 + (Math.random() * 4 - 2);
        else rsi = 45 + (Math.random() * 20 - 10);

        // FVG
        let fvg_type = 0.0;
        let fvg_top = null;
        let fvg_bottom = null;
        if (i >= 2 && i % 15 === 0) { // simulate occasional FVGs
            fvg_type = Math.random() > 0.4 ? 1.0 : -1.0;
            if (fvg_type === 1.0) {
                fvg_top = low * 1.01;
                fvg_bottom = high * 0.99;
            } else {
                fvg_top = high * 1.01;
                fvg_bottom = low * 0.99;
            }
        }

        history.push({
            date: dates[i],
            open: Math.round(open),
            high: Math.round(high),
            low: Math.round(low),
            close: Math.round(close),
            volume: Math.floor(500000 + Math.random() * 3000000),
            ma20: ma20 ? Math.round(ma20) : null,
            ma50: ma50 ? Math.round(ma50) : null,
            rsi: rsi,
            fvg_type: fvg_type,
            fvg_top: fvg_top ? Math.round(fvg_top) : null,
            fvg_bottom: fvg_bottom ? Math.round(fvg_bottom) : null
        });
    }

    return { symbol, history };
}

function getMockScreenerData() {
    const list = ['FPT', 'HPG', 'VNM', 'SSI', 'TCB', 'VIC', 'VHM', 'MWG', 'STB', 'MBB'];
    return list.map(sym => {
        const price = getMockPrice(sym);
        const change_percent = sym === 'FPT' ? 5.8 : sym === 'VIC' ? -3.4 : (Math.random() * 6 - 2.5);
        const change = price * (change_percent / 100);

        const rsi = sym === 'FPT' ? 72 : sym === 'VIC' ? 28 : (40 + Math.random() * 25);
        let rsi_status = 'Neutral';
        if (rsi >= 70) rsi_status = 'Overbought';
        if (rsi <= 30) rsi_status = 'Oversold';

        const trend = sym === 'FPT' || sym === 'TCB' || sym === 'SSI' ? 'Bullish' : sym === 'VIC' || sym === 'VHM' ? 'Bearish' : 'Sideways';
        const fvg_signal = sym === 'FPT' || sym === 'TCB' ? 'Bullish FVG' : sym === 'VIC' ? 'Bearish FVG' : 'None';

        return {
            symbol: sym,
            name: getCompanyName(sym),
            price: price,
            change: Math.round(change),
            change_percent: Math.round(change_percent * 100) / 100,
            rsi: rsi,
            rsi_status: rsi_status,
            ma20: price * 0.98,
            ma50: price * 0.96,
            trend: trend,
            fvg_signal: fvg_signal,
            volume: Math.floor(1000000 + Math.random() * 5000000)
        };
    });
}

// 9. Fundamental & News Loading Functions
function renderFundamentals(data) {
    const peEl = document.getElementById('fundamental-pe');
    const pbEl = document.getElementById('fundamental-pb');
    const roeEl = document.getElementById('fundamental-roe');
    const roaEl = document.getElementById('fundamental-roa');
    const financialsBody = document.getElementById('fundamental-financials-body');

    if (peEl) peEl.innerHTML = data.pe !== null && data.pe !== undefined ? data.pe.toFixed(2) : '-';
    if (pbEl) pbEl.innerHTML = data.pb !== null && data.pb !== undefined ? data.pb.toFixed(2) : '-';
    if (roeEl) roeEl.innerHTML = data.roe !== null && data.roe !== undefined ? `${data.roe.toFixed(1)}%` : '-';
    if (roaEl) roaEl.innerHTML = data.roa !== null && data.roa !== undefined ? `${data.roa.toFixed(1)}%` : '-';

    if (financialsBody) {
        financialsBody.innerHTML = '';
        if (data.financials && data.financials.length > 0) {
            data.financials.forEach(item => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-bordergray/20 hover:bg-darkitem/30 transition-all';
                tr.innerHTML = `
                    <td class="py-2.5 font-bold">${item.period}</td>
                    <td class="py-2.5 text-right font-mono">${item.revenue !== null && item.revenue !== undefined ? formatNumber(item.revenue) : '-'}</td>
                    <td class="py-2.5 text-right font-mono ${item.net_profit >= 0 ? 'text-accentgreen' : 'text-accentred'}">${item.net_profit !== null && item.net_profit !== undefined ? formatNumber(item.net_profit) : '-'}</td>
                    <td class="py-2.5 text-right font-mono text-textmuted">${item.assets !== null && item.assets !== undefined ? formatNumber(item.assets) : '-'}</td>
                `;
                financialsBody.appendChild(tr);
            });
        } else {
            financialsBody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-textmuted">Không có dữ liệu báo cáo tài chính</td></tr>';
        }
    }
}

function getMockFundamentalData(symbol) {
    symbol = symbol.toUpperCase();
    const defaults = {
        'FPT': {
            pe: 22.4, pb: 5.8, roe: 27.2, roa: 11.5,
            financials: [
                { period: '2025', revenue: 62500.0, net_profit: 7800.0, assets: 65000.0, equity: 32000.0 },
                { period: '2024', revenue: 52600.0, net_profit: 6480.0, assets: 58000.0, equity: 28000.0 },
                { period: '2023', revenue: 45100.0, net_profit: 5500.0, assets: 49000.0, equity: 24000.0 }
            ]
        },
        'HPG': {
            pe: 14.2, pb: 1.6, roe: 12.5, roa: 7.2,
            financials: [
                { period: '2025', revenue: 145000.0, net_profit: 11800.0, assets: 195000.0, equity: 110000.0 },
                { period: '2024', revenue: 128000.0, net_profit: 8900.0, assets: 180000.0, equity: 98000.0 },
                { period: '2023', revenue: 115000.0, net_profit: 6800.0, assets: 170000.0, equity: 92000.0 }
            ]
        },
        'VNM': {
            pe: 16.8, pb: 4.2, roe: 24.5, roa: 17.8,
            financials: [
                { period: '2025', revenue: 61200.0, net_profit: 8950.0, assets: 52000.0, equity: 36000.0 },
                { period: '2024', revenue: 59800.0, net_profit: 8700.0, assets: 51000.0, equity: 35000.0 },
                { period: '2023', revenue: 58500.0, net_profit: 8400.0, assets: 50000.0, equity: 34000.0 }
            ]
        },
        'TCB': {
            pe: 8.5, pb: 1.1, roe: 17.5, roa: 2.4,
            financials: [
                { period: '2025', revenue: 45200.0, net_profit: 20500.0, assets: 890000.0, equity: 140000.0 },
                { period: '2024', revenue: 40100.0, net_profit: 18200.0, assets: 810000.0, equity: 125000.0 },
                { period: '2023', revenue: 36500.0, net_profit: 15400.0, assets: 730000.0, equity: 112000.0 }
            ]
        }
    };

    if (defaults[symbol]) {
        return defaults[symbol];
    }

    const isBank = ['TCB', 'STB', 'MBB'].includes(symbol);
    const pe = isBank ? 8.2 : 14.5;
    const pb = isBank ? 1.2 : 2.5;
    const roe = 16.5;
    const roa = isBank ? 2.1 : 8.5;

    return {
        pe: pe,
        pb: pb,
        roe: roe,
        roa: roa,
        financials: [
            { period: '2025', revenue: 25000.0, net_profit: isBank ? 11000.0 : 2500.0, assets: isBank ? 450000.0 : 35000.0, equity: 15000.0 },
            { period: '2024', revenue: 22000.0, net_profit: isBank ? 9500.0 : 2100.0, assets: isBank ? 400000.0 : 32000.0, equity: 13500.0 },
            { period: '2023', revenue: 19500.0, net_profit: isBank ? 8000.0 : 1800.0, assets: isBank ? 360000.0 : 29000.0, equity: 12000.0 }
        ]
    };
}

async function loadMarketNews() {
    const newsContainer = document.getElementById('news-container');
    if (!newsContainer) return;

    try {
        let newsList;
        if (isApiOnline) {
            const response = await fetchWithTimeout(`${API_BASE_URL}/api/market-news`);
            if (response.ok) {
                newsList = await response.json();
            } else {
                throw new Error('API news failure');
            }
        } else {
            newsList = getMockNewsList();
        }

        renderNews(newsList);
    } catch (error) {
        console.error('Error loading market news:', error);
        renderNews(getMockNewsList());
    }
}

function renderNews(newsList) {
    const newsContainer = document.getElementById('news-container');
    if (!newsContainer) return;

    newsContainer.innerHTML = '';
    if (newsList && newsList.length > 0) {
        newsList.forEach(item => {
            const div = document.createElement('div');
            div.className = 'bg-darkitem border border-bordergray/50 rounded-xl p-3 hover:border-accentblue transition-all cursor-pointer';
            div.onclick = () => {
                if (item.link !== '#') window.open(item.link, '_blank');
            };
            div.innerHTML = `
                <div class="flex justify-between text-[10px] text-textmuted mb-1 font-semibold">
                    <span class="text-accentblue font-bold">${item.source}</span>
                    <span>${item.time}</span>
                </div>
                <h4 class="text-xs font-bold text-white hover:text-accentblue transition-all mb-1 line-clamp-1">
                    ${item.title}
                </h4>
                <p class="text-[11px] text-textmuted line-clamp-2 leading-relaxed">
                    ${item.summary}
                </p>
            `;
            newsContainer.appendChild(div);
        });
    } else {
        newsContainer.innerHTML = '<div class="text-center py-8 text-xs text-textmuted">Không có tin tức mới</div>';
    }
}

function getMockNewsList() {
    return [
        {
            title: "Xu hướng dòng vốn ngoại: Khối ngoại quay lại mua ròng mạnh các mã Bluechips",
            source: "CafeF",
            time: "15 phút trước",
            summary: "Sau chuỗi ngày bán ròng liên tiếp, dòng vốn ngoại bắt đầu có tín hiệu đảo chiều tích cực khi giải ngân mạnh vào nhóm VN30 như FPT, HPG và TCB.",
            link: "#"
        },
        {
            title: "Doanh thu xuất khẩu phần mềm của các doanh nghiệp công nghệ Việt Nam tăng trưởng vượt kỳ vọng",
            source: "Vietstock",
            time: "45 phút trước",
            summary: "Thống kê sơ bộ từ Hiệp hội CNTT cho thấy kim ngạch xuất khẩu phần mềm sang thị trường Nhật Bản và Mỹ trong 5 tháng đầu năm tăng hơn 25% so với cùng kỳ.",
            link: "#"
        },
        {
            title: "Ngân hàng Nhà nước tiếp tục duy trì chính sách tiền tệ nới lỏng nhằm hỗ trợ phục hồi kinh tế",
            source: "VnExpress",
            time: "2 giờ trước",
            summary: "Lãi suất điều hành tiếp tục được giữ ở mức thấp ổn định, tạo điều kiện thuận lợi cho các doanh nghiệp tiếp cận nguồn vốn giá rẻ phục vụ sản xuất kinh doanh.",
            link: "#"
        },
        {
            title: "Nhóm cổ phiếu Thép bứt phá mạnh mẽ nhờ giá thép thế giới phục hồi ổn định",
            source: "Tin Nhanh Chứng Khoán",
            time: "4 giờ trước",
            summary: "Giá thép cuộn cán nóng HRC tăng nhẹ trên thị trường quốc tế là động lực thúc đẩy đà tăng trưởng của các cổ phiếu HPG, HSG và NKG trong các phiên gần đây.",
            link: "#"
        },
        {
            title: "Báo cáo phân tích kỹ thuật VN-Index: Kiểm định lại ngưỡng kháng cự tâm lý 1.300 điểm",
            source: "Rồng Việt",
            time: "6 giờ trước",
            summary: "Nhận định xu hướng kỹ thuật cho thấy chỉ số đang tích lũy tốt trên đường MA20, có khả năng sẽ bứt phá kiểm thử mốc kháng cự mạnh trong tuần tới.",
            link: "#"
        }
    ];
}

// ============================================
// 10. Chart.js Visualization Components
// ============================================

function updateMarketBreadthChart(rising, flat, falling) {
    const ctx = document.getElementById('marketBreadthChart').getContext('2d');

    const chartData = {
        labels: ['Tăng', 'Đi ngang', 'Giảm'],
        datasets: [{
            data: [rising, flat, falling],
            backgroundColor: [
                '#00C087', // accentgreen (Tăng)
                '#848E9C', // textmuted (Đi ngang)
                '#F94144'  // accentred (Giảm)
            ],
            borderColor: '#11151F', // Match dark card background
            borderWidth: 2,
            hoverOffset: 3
        }]
    };

    if (marketBreadthChartInstance) {
        marketBreadthChartInstance.data = chartData;
        marketBreadthChartInstance.update();
    } else {
        marketBreadthChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: '#1E2330',
                        titleColor: '#FFFFFF',
                        bodyColor: '#EAECEF',
                        borderColor: '#232936',
                        borderWidth: 1,
                        displayColors: false,
                        callbacks: {
                            label: function (context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const value = context.raw;
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return ` ${context.label}: ${value} mã (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

function formatDateDDMM(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}`;
    }
    return dateStr;
}

async function loadForeignFlow(symbol) {
    try {
        let data;
        if (isApiOnline) {
            const response = await fetchWithTimeout(`${API_BASE_URL}/api/stock-foreign/${symbol}`);
            if (response.ok) {
                data = await response.json();
            } else {
                throw new Error('API stock-foreign failure');
            }
        } else {
            data = getMockForeignFlow(symbol);
        }

        renderForeignFlowChart(data);
    } catch (error) {
        console.error('Error loading foreign flow:', error);
        const data = getMockForeignFlow(symbol);
        renderForeignFlowChart(data);
    }
}

function renderForeignFlowChart(data) {
    const canvas = document.getElementById('foreignFlowChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (!data || !data.history || data.history.length === 0) {
        return;
    }

    // Reverse to chronological order (oldest to newest)
    const sortedHistory = [...data.history].reverse();

    const labels = sortedHistory.map(item => formatDateDDMM(item.date));
    const values = sortedHistory.map(item => item.net_value);

    // Greenish for positive net value, Reddish for negative net value
    const backgroundColors = values.map(val => val >= 0 ? 'rgba(0, 192, 135, 0.45)' : 'rgba(249, 65, 68, 0.45)');
    const borderColors = values.map(val => val >= 0 ? '#00C087' : '#F94144');

    const chartData = {
        labels: labels,
        datasets: [{
            label: 'Mua/Bán ròng (Tỷ VND)',
            data: values,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1.5,
            borderRadius: 4,
            borderSkipped: false
        }]
    };

    if (foreignFlowChartInstance) {
        foreignFlowChartInstance.data = chartData;
        foreignFlowChartInstance.update();
    } else {
        foreignFlowChartInstance = new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: '#1E2330',
                        titleColor: '#FFFFFF',
                        bodyColor: '#EAECEF',
                        borderColor: '#232936',
                        borderWidth: 1,
                        displayColors: false,
                        callbacks: {
                            label: function (context) {
                                const val = context.raw;
                                if (val >= 0) {
                                    return ` Mua ròng: +${val.toFixed(2)} tỷ VND`;
                                } else {
                                    return ` Bán ròng: ${val.toFixed(2)} tỷ VND`;
                                }
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.08)',
                            borderColor: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#848E9C',
                            font: {
                                family: 'Inter, sans-serif',
                                size: 10
                            }
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.08)',
                            borderColor: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#848E9C',
                            font: {
                                family: 'Inter, sans-serif',
                                size: 10
                            },
                            callback: function (value) {
                                return value + ' tỷ';
                            }
                        }
                    }
                }
            }
        });
    }
}

function getMockForeignFlow(symbol) {
    symbol = symbol.toUpperCase();
    const baseBuy = { 'FPT': 65.5, 'HPG': 110.2, 'VNM': 45.8, 'TCB': 55.4 };
    const base = baseBuy[symbol] || 40.0;

    const history = [];
    const now = new Date();
    let daysGenerated = 0;
    let offset = 0;

    while (daysGenerated < 10) {
        const d = new Date(now);
        d.setDate(d.getDate() - offset);
        offset++;
        if (d.getDay() === 0 || d.getDay() === 6) continue;

        const buy = Math.round((base * (0.7 + Math.random() * 0.7)) * 100) / 100;
        const sell = Math.round((base * (0.6 + Math.random() * 0.7)) * 100) / 100;
        let net = Math.round((buy - sell) * 100) / 100;

        // Make FPT tend positive, VIC tend negative
        if (symbol === 'FPT') net = Math.abs(net) + Math.round(Math.random() * 10 * 100) / 100;
        if (symbol === 'VIC') net = -Math.abs(net) - Math.round(Math.random() * 15 * 100) / 100;

        history.push({
            date: d.toISOString().split('T')[0],
            buy_value: Math.round((sell + Math.max(net, 0)) * 100) / 100,
            sell_value: Math.round((sell) * 100) / 100,
            net_value: net
        });
        daysGenerated++;
    }

    return {
        latest: history[0],
        history: history
    };
}

// ============================================
// 11. Shareholders Loading & Rendering
// ============================================
// Data is now loaded through stock-analysis endpoint

function renderShareholders(data) {
    const tableBody = document.getElementById('shareholders-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="py-4 text-center text-textmuted">Không có dữ liệu cổ đông</td></tr>';
        return;
    }

    // Sort by percentage descending
    data.sort((a, b) => (b.percentage || 0) - (a.percentage || 0));

    const maxPct = Math.max(...data.map(d => d.percentage || 0), 1);

    data.forEach((shareholder, index) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-bordergray/15 hover:bg-darkitem/40 transition-all';

        // Determine if this is a fund/institution by keywords
        const name = shareholder.name || '';
        const isFund = /quỹ|capital|fund|vinacapital|dragon|fidelity|ssiam|ngoại|scic|tổng công ty/i.test(name);
        const iconClass = isFund
            ? 'fa-solid fa-building-columns text-purple-400'
            : 'fa-solid fa-user-tie text-accentblue';
        const tagHtml = isFund
            ? '<span class="ml-1.5 text-[9px] bg-purple-500/15 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded-md font-semibold">QUỸ</span>'
            : '';

        const barWidthPct = Math.min((shareholder.percentage / maxPct) * 100, 100);

        tr.innerHTML = `
            <td class="py-2.5 pr-2">
                <div class="flex items-center gap-2">
                    <i class="${iconClass} text-[10px]"></i>
                    <span class="text-white font-medium">${name}</span>
                    ${tagHtml}
                </div>
            </td>
            <td class="py-2.5 text-right font-mono text-textmuted">${shareholder.shares ? formatNumber(shareholder.shares) : '-'}</td>
            <td class="py-2.5 text-right">
                <div class="flex items-center justify-end gap-2">
                    <div class="w-16 h-1.5 bg-bordergray/30 rounded-full overflow-hidden">
                        <div class="bg-accentblue h-full rounded-full" style="width: ${barWidthPct}%"></div>
                    </div>
                    <span class="font-bold font-mono text-accentblue w-[45px] text-right">${shareholder.percentage ? shareholder.percentage.toFixed(2) : '0.00'}%</span>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function getMockShareholders(symbol) {
    symbol = symbol.toUpperCase();
    const mockData = {
        'FPT': [
            { name: 'Trương Gia Bình (Chủ tịch HĐQT)', shares: 117347966, percentage: 6.89 },
            { name: 'Tổng công ty Đầu tư và Kinh doanh vốn Nhà nước (SCIC)', shares: 102500000, percentage: 6.02 },
            { name: 'Dragon Capital (Quỹ ngoại)', shares: 85000000, percentage: 4.99 },
            { name: 'Bùi Quang Ngọc (Phó Chủ tịch HĐQT)', shares: 35400000, percentage: 2.08 },
            { name: 'VinaCapital (Quỹ ngoại)', shares: 51000000, percentage: 3.00 },
            { name: 'Fidelity Funds (Quỹ đầu tư)', shares: 34000000, percentage: 2.00 }
        ],
        'HPG': [
            { name: 'Trần Đình Long (Chủ tịch HĐQT)', shares: 1516000000, percentage: 26.08 },
            { name: 'Vũ Thị Hiền', shares: 400000000, percentage: 6.88 },
            { name: 'Dragon Capital (Quỹ ngoại)', shares: 310000000, percentage: 5.33 },
            { name: 'VinaCapital (Quỹ ngoại)', shares: 120000000, percentage: 2.06 },
            { name: 'Cổ đông nước ngoài khác', shares: 870000000, percentage: 14.97 }
        ],
        'TCB': [
            { name: 'Công ty Cổ phần Masan', shares: 524000000, percentage: 14.88 },
            { name: 'Hồ Hùng Anh (Chủ tịch HĐQT)', shares: 39300000, percentage: 1.12 },
            { name: 'Dragon Capital', shares: 110000000, percentage: 3.12 },
            { name: 'Cổ đông nước ngoài (Room tối đa)', shares: 776000000, percentage: 22.00 }
        ]
    };

    if (mockData[symbol]) return mockData[symbol];

    return [
        { name: 'Ban điều hành & HĐQT', shares: 12000000, percentage: 5.40 },
        { name: 'Tổng công ty Đầu tư SCIC', shares: 22000000, percentage: 9.90 },
        { name: 'Dragon Capital VN', shares: 11000000, percentage: 4.95 },
        { name: 'VinaCapital VN Opportunity', shares: 7500000, percentage: 3.37 },
        { name: 'Quỹ Đầu Tư SSIAM', shares: 5000000, percentage: 2.25 }
    ];
}

// Redirection handler for detail page from search input
function viewDetailFromSearch() {
    const input = document.getElementById('stock-search-input');
    if (!input) return;
    const symbol = input.value.trim().toUpperCase();
    if (symbol.length >= 3 && symbol.length <= 5) {
        window.location.href = `detail.html?ticker=${symbol}`;
    } else {
        alert('Mã cổ phiếu không hợp lệ. Vui lòng nhập từ 3 đến 5 ký tự.');
    }
}

