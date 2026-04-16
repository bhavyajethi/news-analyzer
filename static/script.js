const input = document.getElementById('topic-input');
const runBtn = document.getElementById('analyze-btn');
const linkBtn = document.getElementById('copy-link-btn');
const mdBtn = document.getElementById('copy-markdown-btn');
const loadBox = document.getElementById('loading');
const outBox = document.getElementById('results');
const errBox = document.getElementById('error-msg');
const grid = document.getElementById('cards-grid');
const cSec = document.getElementById('brief-consensus-section');
const cTxt = document.getElementById('brief-consensus');
const dSec = document.getElementById('brief-discrepancies-section');
const dTxt = document.getElementById('brief-discrepancies');
const iSec = document.getElementById('brief-impact-section');
const winBox = document.getElementById('brief-winners');
const loseBox = document.getElementById('brief-losers');
const audio = document.getElementById('brief-audio');

const apiUrl = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://127.0.0.1:8000/api/analyze';
    }
    return '/api/analyze';
};

const setLink = (q) => {
    const u = new URL(window.location.href);
    if (q) {
        u.searchParams.set('q', q);
    } else {
        u.searchParams.delete('q');
    }
    window.history.pushState({}, '', u);
};

const flash = (btn, txt) => {
    const old = btn.textContent;
    btn.textContent = txt;
    setTimeout(() => {
        btn.textContent = old;
    }, 2000);
};

const wipe = (node) => {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
};

const cleanUrl = (v) => {
    try {
        const u = new URL(v, window.location.origin);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
            return u.toString();
        }
    } catch (e) {
        return '';
    }
    return '';
};

const makeText = (tag, txt) => {
    const el = document.createElement(tag);
    el.textContent = txt;
    return el;
};

const addChip = (box, txt) => {
    const li = document.createElement('li');
    li.textContent = txt;
    box.appendChild(li);
};

const addCard = (a) => {
    const d = a.data || {};
    const s = d.Sentiment ? d.Sentiment.toLowerCase() : 'neutral';
    const raw = Number(d.HypeScore);
    const n = Number.isFinite(raw) ? Math.max(0, Math.min(10, raw)) : 5;
    let bar = '#10b981';

    if (n > 7) bar = '#ef4444';
    else if (n > 4) bar = '#f59e0b';

    const card = document.createElement('div');
    card.className = 'card';

    const head = document.createElement('div');
    head.className = 'card-header';

    const sent = document.createElement('span');
    sent.className = `badge ${s}`;
    sent.textContent = d.Sentiment || 'Neutral';

    const per = document.createElement('span');
    per.className = 'badge perspective';
    per.textContent = d.Perspective || 'Unknown';

    head.appendChild(sent);
    head.appendChild(per);

    const title = makeText('h2', a.title || 'Intelligence Brief');
    title.className = 'card-title';

    const sum = document.createElement('div');
    sum.className = 'card-content';
    sum.appendChild(makeText('h3', 'Summary'));
    sum.appendChild(makeText('p', d.Summary || 'No summary available.'));

    const exp = document.createElement('div');
    exp.className = 'card-expect';
    exp.appendChild(makeText('h3', 'Expectation'));
    exp.appendChild(makeText('p', d.Expectation || 'No expectation available.'));

    const hype = document.createElement('div');
    hype.className = 'hype-container';

    const label = document.createElement('div');
    label.className = 'hype-label';
    label.appendChild(makeText('span', 'Hype Score'));
    label.appendChild(makeText('span', `${n}/10`));

    const bg = document.createElement('div');
    bg.className = 'hype-bar-bg';

    const fill = document.createElement('div');
    fill.className = 'hype-bar-fill';
    fill.style.width = `${n * 10}%`;
    fill.style.backgroundColor = bar;
    bg.appendChild(fill);

    const src = document.createElement('div');
    src.className = 'hype-source';

    const link = document.createElement('a');
    const href = cleanUrl(a.url || '');
    link.href = href || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View Source ->';
    if (!href) {
        link.setAttribute('aria-disabled', 'true');
        link.tabIndex = -1;
    }
    src.appendChild(link);

    hype.appendChild(label);
    hype.appendChild(bg);
    hype.appendChild(src);

    card.appendChild(head);
    card.appendChild(title);
    card.appendChild(sum);
    card.appendChild(exp);
    card.appendChild(hype);
    grid.appendChild(card);
};

const render = (data) => {
    window.currentReportData = data;
    const brief = data.brief || {};

    document.getElementById('brief-bottomline').textContent = brief.BottomLine || '';

    if (brief.Consensus) {
        cTxt.textContent = brief.Consensus;
        cSec.classList.remove('hidden');
    } else {
        cTxt.textContent = '';
        cSec.classList.add('hidden');
    }

    if (brief.Discrepancies && brief.Discrepancies.length > 5) {
        dTxt.textContent = brief.Discrepancies;
        dSec.classList.remove('hidden');
    } else {
        dTxt.textContent = '';
        dSec.classList.add('hidden');
    }

    wipe(winBox);
    wipe(loseBox);

    if (brief.Impact && Array.isArray(brief.Impact.Winners) && Array.isArray(brief.Impact.Losers)) {
        brief.Impact.Winners.forEach((w) => addChip(winBox, w));
        brief.Impact.Losers.forEach((l) => addChip(loseBox, l));
        iSec.classList.remove('hidden');
    } else {
        iSec.classList.add('hidden');
    }

    audio.src = data.audio_base64 || '';
    audio.load();

    wipe(grid);
    (data.articles || []).forEach(addCard);
    outBox.classList.remove('hidden');
};

const analyze = async (seed = '') => {
    const topic = (seed || input.value).trim();
    if (!topic) {
        return;
    }

    input.value = topic;
    setLink(topic);

    runBtn.disabled = true;
    loadBox.classList.remove('hidden');
    outBox.classList.add('hidden');
    errBox.classList.add('hidden');
    errBox.textContent = '';
    wipe(grid);

    try {
        const res = await fetch(apiUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic })
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || 'Failed to analyze topic');
        }
        render(data);
    } catch (e) {
        errBox.textContent = e.message;
        errBox.classList.remove('hidden');
    } finally {
        runBtn.disabled = false;
        loadBox.classList.add('hidden');
    }
};

runBtn.addEventListener('click', () => {
    analyze();
});

input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        analyze();
    }
});

linkBtn.addEventListener('click', async () => {
    const topic = input.value.trim();
    if (topic) {
        setLink(topic);
    }
    try {
        await navigator.clipboard.writeText(window.location.href);
        flash(linkBtn, 'Copied!');
    } catch (e) {
        errBox.textContent = 'Failed to copy link';
        errBox.classList.remove('hidden');
    }
});

mdBtn.addEventListener('click', async () => {
    if (!window.currentReportData) {
        return;
    }

    const d = window.currentReportData;
    const brief = d.brief;
    const topic = input.value.trim();

    let md = `# Intelligence Report: ${topic}\n\n`;
    md += `## Bottom Line\n${brief.BottomLine}\n\n`;

    if (brief.Consensus) md += `## Consensus\n${brief.Consensus}\n\n`;
    if (brief.Discrepancies && brief.Discrepancies.length > 5) md += `## Discrepancies\n${brief.Discrepancies}\n\n`;

    if (brief.Impact) {
        md += `## Impact Radius\n`;
        md += `**Winners:** ${brief.Impact.Winners.join(', ')}\n`;
        md += `**Losers:** ${brief.Impact.Losers.join(', ')}\n\n`;
    }

    md += `## Sources\n`;
    d.articles.forEach((a) => {
        md += `- [${a.title}](${a.url})\n  *Score: ${a.data.HypeScore}/10 | Sentiment: ${a.data.Sentiment} | Perspective: ${a.data.Perspective}*\n\n`;
    });

    try {
        await navigator.clipboard.writeText(md);
        flash(mdBtn, 'Copied!');
    } catch (e) {
        errBox.textContent = 'Failed to copy report';
        errBox.classList.remove('hidden');
    }
});

window.addEventListener('popstate', () => {
    const q = new URLSearchParams(window.location.search).get('q') || '';
    input.value = q;
});

window.addEventListener('DOMContentLoaded', () => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) {
        input.value = q;
        analyze(q);
    }
});
