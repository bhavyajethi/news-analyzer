document.getElementById('analyze-btn').addEventListener('click', async () => {
    const topic = document.getElementById('topic-input').value.trim();
    if (!topic) return;

    const btn = document.getElementById('analyze-btn');
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    const errorMsg = document.getElementById('error-msg');

    btn.disabled = true;
    loading.classList.remove('hidden');
    results.classList.add('hidden');
    errorMsg.classList.add('hidden');
    document.getElementById('cards-grid').innerHTML = '';

    try {
        const res = await fetch('http://127.0.0.1:8000/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || 'Failed to analyze topic');
        }

        window.currentReportData = data;
        const brief = data.brief;
        
        document.getElementById('brief-bottomline').textContent = brief.BottomLine;
        
        const cSec = document.getElementById('brief-consensus-section');
        const cEl = document.getElementById('brief-consensus');
        if (brief.Consensus) {
            cEl.textContent = brief.Consensus;
            cSec.classList.remove('hidden');
        } else cSec.classList.add('hidden');

        const dSec = document.getElementById('brief-discrepancies-section');
        const dEl = document.getElementById('brief-discrepancies');
        if (brief.Discrepancies && brief.Discrepancies.length > 5) {
            dEl.textContent = brief.Discrepancies;
            dSec.classList.remove('hidden');
        } else dSec.classList.add('hidden');

        const iSec = document.getElementById('brief-impact-section');
        const winList = document.getElementById('brief-winners');
        const loseList = document.getElementById('brief-losers');
        winList.innerHTML = '';
        loseList.innerHTML = '';
        if (brief.Impact) {
            brief.Impact.Winners.forEach(w => {
                const li = document.createElement('li'); li.textContent = w; winList.appendChild(li);
            });
            brief.Impact.Losers.forEach(l => {
                const li = document.createElement('li'); li.textContent = l; loseList.appendChild(li);
            });
            iSec.classList.remove('hidden');
        } else iSec.classList.add('hidden');
        const audio = document.getElementById('brief-audio');
        audio.src = data.audio_base64;
        audio.load();

        const grid = document.getElementById('cards-grid');
        data.articles.forEach(article => {
            const d = article.data;
            const sentClass = d.Sentiment ? d.Sentiment.toLowerCase() : 'neutral';
            const hype = d.HypeScore || 5;
            let hypeColor = '#10b981';
            if (hype > 7) hypeColor = '#ef4444';
            else if (hype > 4) hypeColor = '#f59e0b';

            const title = article.title || 'Intelligence Brief';
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-header">
                    <span class="badge ${sentClass}">${d.Sentiment}</span>
                    <span class="badge perspective">${d.Perspective}</span>
                </div>
                <h2 class="card-title">${title}</h2>
                <div class="card-content">
                    <h3>Summary</h3>
                    <p>${d.Summary}</p>
                </div>
                <div class="card-expect">
                    <h3>Expectation</h3>
                    <p>${d.Expectation}</p>
                </div>
                <div class="hype-container">
                    <div class="hype-label">
                        <span>Hype Score</span>
                        <span>${hype}/10</span>
                    </div>
                    <div class="hype-bar-bg">
                        <div class="hype-bar-fill" style="width: ${hype * 10}%; background-color: ${hypeColor};"></div>
                    </div>
                    <div class="hype-source">
                        <a href="${article.url}" target="_blank" rel="noopener noreferrer">View Source ↗</a>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });

        results.classList.remove('hidden');
    } catch (err) {
        errorMsg.textContent = err.message;
        errorMsg.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        loading.classList.add('hidden');
    }
});

document.getElementById('topic-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('analyze-btn').click();
});

document.getElementById('copy-markdown-btn').addEventListener('click', async () => {
    if (!window.currentReportData) return;
    const d = window.currentReportData;
    const brief = d.brief;
    const topic = document.getElementById('topic-input').value.trim();
    
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
    d.articles.forEach(a => {
        md += `- [${a.title}](${a.url})\n  *Score: ${a.data.HypeScore}/10 | Sentiment: ${a.data.Sentiment} | Perspective: ${a.data.Perspective}*\n\n`;
    });
    
    try {
        await navigator.clipboard.writeText(md);
        const btn = document.getElementById('copy-markdown-btn');
        const origText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = origText; }, 2000);
    } catch (e) {
        console.error('Failed to copy', e);
    }
});
