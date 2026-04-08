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

        document.getElementById('brief-text').textContent = data.brief;
        const audio = document.getElementById('brief-audio');
        audio.src = 'http://127.0.0.1:8000' + data.audio;
        audio.load();

        const grid = document.getElementById('cards-grid');
        data.articles.forEach(article => {
            const d = article.data;
            const sentClass = d.Sentiment ? d.Sentiment.toLowerCase() : 'neutral';
            const hype = d.HypeScore || 5;
            let hypeColor = '#10b981';
            if (hype > 7) hypeColor = '#ef4444';
            else if (hype > 4) hypeColor = '#f59e0b';

            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-header">
                    <span class="badge ${sentClass}">${d.Sentiment}</span>
                    <span class="badge perspective">${d.Perspective}</span>
                </div>
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
