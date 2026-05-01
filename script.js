/* ============================================================
   Sports Day Scoreboard Dashboard — script.js
   יום ספורט חוב״ב
   Fetches data from Google Sheets via JSONP, parses, and renders.
   ============================================================ */

// ── Constants ──────────────────────────────────────────────────
const SHEET_ID = '1wBDYWlm9DcjDsWD2ZNL5X2KuKig0d-TaIH8unVlOVZw';
const REFRESH_MS = 5000;

// Category rows (0-indexed gviz table row indices)
// gviz uses parsedNumHeaders:2, so sheet row 4 = data index 0
// Categories: indices 0–5 (sheet rows 4–9), skip index 6 (header), index 7 (שליחים, sheet row 11)
const CATEGORY_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];

// Medal rows (0-indexed gviz table row indices) — sheet rows 14–16 = data indices 10–12
const MEDAL_INDICES = [10, 11, 12];

// Row indices within the range-limited medal response (rows 14:16 only → indices 0,1,2)
const MEDAL_RANGE_INDICES = [0, 1, 2];

// Medal category map: index into CATEGORY_INDICES for each medal row
const MEDAL_CATEGORY_MAP = [0, 1, 2];

const CLASSES = [
    { name: 'כיתה א׳', girlCol: 3, boyCol: 4 },   // D=3, E=4
    { name: 'כיתה ב׳', girlCol: 5, boyCol: 6 },   // F=5, G=6
    { name: 'כיתה ג׳', girlCol: 7, boyCol: 8 },   // H=7, I=8
    { name: 'כיתה ד׳', girlCol: 9, boyCol: 10 },  // J=9, K=10
    { name: 'כיתה ה׳', girlCol: 11, boyCol: 12 }, // L=11, M=12
    { name: 'כיתה ו׳', girlCol: 13, boyCol: 14 }, // N=13, O=14
];

const COLOR_MAP = {
    'אדום': 'red',
    'צהוב': 'yellow',
    'ירוק': 'green',
};

const COLOR_HEX = {
    red: '#E53935',
    yellow: '#FDD835',
    green: '#43A047',
};

const COLOR_LABELS = {
    red: 'אדום',
    yellow: 'צהוב',
    green: 'ירוק',
};

// ── State ──────────────────────────────────────────────────────
let previousMedalState = {}; // track which medals were already revealed
let prevCategoriesJSON = '';
let prevStandingsJSON = '';
let prevMedalsJSON = '';

// ── JSONP Fetch ────────────────────────────────────────────────

/**
 * Fetch Google Sheet data via JSONP (script tag injection).
 * This avoids CORS issues when opening from file:// protocol.
 */
function fetchSheetData(range) {
    return new Promise((resolve, reject) => {
        const callbackName = '_gsheetCallback_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Request timed out'));
        }, 10000);

        function cleanup() {
            clearTimeout(timeout);
            delete window[callbackName];
            const el = document.getElementById(callbackName);
            if (el) el.remove();
        }

        window[callbackName] = function (response) {
            cleanup();
            if (response && response.status === 'ok') {
                resolve(response.table);
            } else {
                reject(new Error(response ? response.errors?.[0]?.message : 'Unknown error'));
            }
        };

        let url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}`;
        if (range) {
            url += `&range=${range}&headers=0`;
        }
        const script = document.createElement('script');
        script.id = callbackName;
        script.src = url;
        script.onerror = () => {
            cleanup();
            reject(new Error('Script load failed'));
        };
        document.head.appendChild(script);
    });
}

// ── Data Extraction ────────────────────────────────────────────

/**
 * Get cell value from the gviz table at given row/col.
 * @param {object} table - gviz table object with rows/cols
 * @param {number} row - row index
 * @param {number} col - column index
 * @returns {string|number|null}
 */
function cellValue(table, row, col) {
    if (!table.rows[row]) return null;
    const cell = table.rows[row].c[col];
    if (!cell) return null;
    // gviz cells have { v: value, f: formatted }
    return cell.v != null ? cell.v : (cell.f || null);
}

function extractCategories(table) {
    return CATEGORY_INDICES.map(idx => {
        if (idx >= table.rows.length) return null;

        const name = cellValue(table, idx, 1) || '';        // Column B
        const winnerText = cellValue(table, idx, 2) || '';   // Column C
        
        // Sum scores across all classes (Col D through W)
        // D,E,F (3,4,5), G,H,I (6,7,8), J,K,L (9,10,11), M,N,O (12,13,14), P,Q,R (15,16,17), S,T,U (18,19,20), V,W,X (21,22,23)
        let redScore = 0, yellowScore = 0, greenScore = 0;
        
        for (let i = 0; i < 7; i++) {
            const baseCol = 3 + (i * 3);
            redScore += parseFloat(cellValue(table, idx, baseCol)) || 0;
            yellowScore += parseFloat(cellValue(table, idx, baseCol + 1)) || 0;
            greenScore += parseFloat(cellValue(table, idx, baseCol + 2)) || 0;
        }

        // Parse winning colors
        const winningColors = [];
        if (winnerText) {
            for (const [heb, eng] of Object.entries(COLOR_MAP)) {
                if (winnerText.includes(heb)) {
                    winningColors.push(eng);
                }
            }
        }

        // A category is started if there are scores OR a winner is declared
        const started = redScore > 0 || yellowScore > 0 || greenScore > 0 || winningColors.length > 0;

        return {
            name,
            winnerText,
            winningColors,
            scores: { red: redScore, yellow: yellowScore, green: greenScore },
            started,
        };
    }).filter(Boolean);
}

function extractMedals(medalTable, categories) {
    return MEDAL_RANGE_INDICES.map((idx, i) => {
        if (idx >= medalTable.rows.length) return null;

        const catIdx = MEDAL_CATEGORY_MAP[i];
        const cat = categories[catIdx];

        const classList = CLASSES.map(cls => {
            const girl = cellValue(medalTable, idx, cls.girlCol);
            const boy = cellValue(medalTable, idx, cls.boyCol);

            return {
                className: cls.name,
                girl: girl ? String(girl) : '',
                boy: boy ? String(boy) : '',
            };
        });

        return {
            categoryName: cat ? cat.name : '',
            classes: classList,
        };
    }).filter(Boolean);
}

function calculateTotals(categories) {
    const totals = { red: 0, yellow: 0, green: 0 };
    const pointSums = { red: 0, yellow: 0, green: 0 };

    categories.forEach(cat => {
        pointSums.red += cat.scores.red;
        pointSums.yellow += cat.scores.yellow;
        pointSums.green += cat.scores.green;

        if (cat.started && cat.winningColors.length > 0) {
            cat.winningColors.forEach(c => { totals[c] += 1; });
        }
    });

    return { totals, pointSums };
}

// ── Rendering ──────────────────────────────────────────────────

function renderCategories(categories) {
    const grid = document.getElementById('categories-grid');
    grid.innerHTML = '';

    categories.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'category-card';

        // Title
        const title = document.createElement('div');
        title.className = 'category-title';
        title.textContent = cat.name;
        card.appendChild(title);

        // Winner badge chips
        const badge = document.createElement('div');
        badge.className = 'winner-badge';
        if (cat.winningColors.length > 0) {
            cat.winningColors.forEach(color => {
                const chip = document.createElement('span');
                chip.className = `winner-chip ${color}`;
                chip.textContent = COLOR_LABELS[color];
                badge.appendChild(chip);
            });
        }
        card.appendChild(badge);

        // Progress bars — one per color, proportional width
        const maxScore = Math.max(cat.scores.red, cat.scores.yellow, cat.scores.green, 1);
        const barsWrap = document.createElement('div');
        barsWrap.className = 'progress-bars';

        ['red', 'yellow', 'green'].forEach(color => {
            const row = document.createElement('div');
            row.className = 'progress-bar-row';

            const dot = document.createElement('div');
            dot.className = `pb-dot ${color}`;
            row.appendChild(dot);

            const label = document.createElement('div');
            label.className = 'pb-label';
            label.textContent = COLOR_LABELS[color];
            row.appendChild(label);

            const track = document.createElement('div');
            track.className = 'pb-track';

            const fill = document.createElement('div');
            fill.className = `pb-fill ${color}`;
            // Animate via rAF so CSS transition fires
            requestAnimationFrame(() => {
                fill.style.width = ((cat.scores[color] / maxScore) * 100).toFixed(1) + '%';
            });
            track.appendChild(fill);
            row.appendChild(track);

            const val = document.createElement('div');
            val.className = `pb-value ${color}`;
            val.textContent = cat.scores[color];
            row.appendChild(val);

            barsWrap.appendChild(row);
        });

        card.appendChild(barsWrap);
        grid.appendChild(card);
    });
}

function renderStandings(totals, pointSums) {
    const bar = document.getElementById('standings-bar');
    bar.innerHTML = '';

    // Sort colors by total categories won (descending)
    const RANK_ICONS = ['🏆', '🥈', '🥉'];
    const sorted = ['red', 'yellow', 'green']
        .map(color => ({ color, total: totals[color], pts: pointSums[color] }))
        .sort((a, b) => b.total - a.total || b.pts - a.pts);

    sorted.forEach(({ color, total, pts }, rank) => {
        const block = document.createElement('div');
        block.className = `standing-block ${color}-block${rank === 0 ? ' leader' : ''}`;

        const rankEl = document.createElement('div');
        rankEl.className = 'standing-rank';
        rankEl.textContent = RANK_ICONS[rank];
        block.appendChild(rankEl);

        const label = document.createElement('div');
        label.className = `standing-color-label ${color}`;
        label.textContent = COLOR_LABELS[color];
        block.appendChild(label);

        const totalEl = document.createElement('div');
        totalEl.className = `standing-total ${color}`;
        totalEl.textContent = total;
        block.appendChild(totalEl);

        const sub = document.createElement('div');
        sub.className = 'standing-subtitle';
        sub.textContent = 'קטגוריות';
        block.appendChild(sub);

        const ptsEl = document.createElement('div');
        ptsEl.className = 'standing-points-sum';
        ptsEl.textContent = `סה"כ נקודות: ${pts}`;
        block.appendChild(ptsEl);

        bar.appendChild(block);
    });
}

function renderMedals(medals) {
    const grid = document.getElementById('medals-grid');
    grid.innerHTML = '';

    CLASSES.forEach((cls, classIdx) => {
        const col = document.createElement('div');
        col.className = 'class-column';

        const header = document.createElement('div');
        header.className = 'class-header';
        header.textContent = cls.name;
        col.appendChild(header);

        medals.forEach((medal, medalIdx) => {
            const catDiv = document.createElement('div');
            catDiv.className = 'medal-category';

            const catName = document.createElement('div');
            catName.className = 'medal-category-name';
            catName.textContent = medal.categoryName;
            catDiv.appendChild(catName);

            const winnersDiv = document.createElement('div');
            winnersDiv.className = 'medal-winners';

            const classData = medal.classes[classIdx];

            // Helper to build a winner row
            function buildWinnerRow(genderLabel, nameText, stateKey) {
                const div = document.createElement('div');
                div.className = 'medal-winner';

                const label = document.createElement('span');
                label.className = 'gender-label';
                label.textContent = genderLabel;
                div.appendChild(label);

                const nameSpan = document.createElement('span');
                nameSpan.className = 'winner-name';

                if (nameText && nameText !== '—') {
                    // Medal icon
                    const icon = document.createElement('span');
                    icon.className = 'medal-icon';
                    icon.textContent = '🥇';
                    nameSpan.appendChild(document.createTextNode(nameText));
                    nameSpan.appendChild(icon);

                    if (!previousMedalState[stateKey]) {
                        div.classList.add('revealed');
                        previousMedalState[stateKey] = true;
                    }
                } else {
                    nameSpan.textContent = '—';
                    div.classList.add('placeholder');
                }

                div.appendChild(nameSpan);
                return div;
            }

            winnersDiv.appendChild(buildWinnerRow(
                'בנות', classData.girl,
                `${medalIdx}-${classIdx}-girl`
            ));
            winnersDiv.appendChild(buildWinnerRow(
                'בנים', classData.boy,
                `${medalIdx}-${classIdx}-boy`
            ));

            catDiv.appendChild(winnersDiv);
            col.appendChild(catDiv);
        });

        grid.appendChild(col);
    });
}

// ── Data Fetch & Update Loop ───────────────────────────────────

async function fetchData() {
    const statusDot = document.getElementById('status-dot');

    try {
        const [table, medalTable] = await Promise.all([
            fetchSheetData(),
            fetchSheetData('14:16'),
        ]);
        statusDot.classList.remove('error');

        const categories = extractCategories(table);
        const medals = extractMedals(medalTable, categories);
        const { totals, pointSums } = calculateTotals(categories);

        const catJSON = JSON.stringify(categories);
        if (catJSON !== prevCategoriesJSON) {
            prevCategoriesJSON = catJSON;
            renderCategories(categories);
        }

        const standJSON = JSON.stringify({ totals, pointSums });
        if (standJSON !== prevStandingsJSON) {
            prevStandingsJSON = standJSON;
            renderStandings(totals, pointSums);
        }

        const medJSON = JSON.stringify(medals);
        if (medJSON !== prevMedalsJSON) {
            prevMedalsJSON = medJSON;
            renderMedals(medals);
        }

    } catch (err) {
        console.error('Fetch error:', err);
        statusDot.classList.add('error');
        // Keep displaying last known data — don't clear the UI
    }
}

// ── Init ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(fetchData, REFRESH_MS);
});
