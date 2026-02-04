// --- 核心資料 ---
let flavorDB = {};     
let cuisineList = [];  
let onlineRecipes = [];
let singleChart = null;
let bridgeChart = null;
let navigationStack = [{ page: 'home', data: null }];

const noteLabels = { 
    season: "季節", taste: "味道", tips: "小秘訣", 
    affinities: "對味組合", notes: "筆記", 
    function: "功能質性", volume: "分量感", intensity: "風味強度", techniques: "調理方式", avoid: "避免"
};

// --- [新功能] 安全的狀態更新 ---
function updateStatus(msg, isError = false) {
    const el = document.getElementById('emptyState');
    if (el) {
        el.innerHTML = msg;
        if (isError) el.style.color = '#d9534f'; // 紅色警告
    }
    console.log(`[System] ${msg}`);
}

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. 設定一個超時炸彈，如果 3 秒後還在"正在讀取"，就強制顯示錯誤
    const timeoutBomb = setTimeout(() => {
        const el = document.getElementById('emptyState');
        if (el && el.innerText.includes('正在')) {
            updateStatus(`
                <h3>讀取逾時 (Timeout)</h3>
                <p>系統讀取檔案超過 3 秒沒有回應。</p>
                <p>可能原因：</p>
                <ul style="text-align:left; display:inline-block;">
                    <li><b>data/list.json</b> 檔案不存在。</li>
                    <li>檔案路徑錯誤 (例如資料夾名稱大小寫不符)。</li>
                    <li>JSON 內容格式錯誤。</li>
                </ul>
            `, true);
        }
    }, 3000);

    const searchInput = document.getElementById('searchInput'); 
    let errorLog = []; 

    try {
        if (searchInput) searchInput.addEventListener('input', (e) => triggerSearch(e.target.value));

        // ----------------------------------------------------
        // 步驟 1: 讀取 list.json (最關鍵的一步)
        // ----------------------------------------------------
        updateStatus("步驟 1/3: 正在讀取 list.json...");
        
        let listRes;
        try {
            listRes = await fetch('data/list.json');
        } catch (netErr) {
            throw new Error("無法連接到 data/list.json (Network Error)");
        }

        if (!listRes.ok) throw new Error(`找不到 data/list.json (HTTP ${listRes.status})`);
        
        // 檢查是不是讀到了 HTML 錯誤頁面 (常見於 GitHub Pages 404)
        const contentType = listRes.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
            throw new Error("data/list.json 回傳了 HTML 網頁，這代表路徑錯誤或檔案不存在。");
        }

        const ingList = await listRes.json();
        
        // ----------------------------------------------------
        // 步驟 2: 批次讀取食材
        // ----------------------------------------------------
        updateStatus(`步驟 2/3: 正在載入 ${ingList.length} 個項目...`);
        await loadBatchIngredients(ingList, errorLog);

        // ----------------------------------------------------
        // 步驟 3: 讀取其他清單 (非必要，失敗可忽略)
        // ----------------------------------------------------
        try {
            const cRes = await fetch('data/cuisines_list.json');
            if (cRes.ok) {
                const cList = await cRes.json();
                await loadBatchIngredients(cList, errorLog);
                cuisineList = cList.filter(n => flavorDB[n]).map(n => flavorDB[n]);
            }
        } catch(e) { console.warn("國家清單讀取略過"); }

        try {
            const rRes = await fetch('data/recipes_list.json');
            if (rRes.ok) {
                const rList = await rRes.json();
                // 這裡改回用簡單迴圈，避免卡死
                for(const rName of rList) {
                    await loadSingleData(rName, true); // true = 是食譜
                }
            }
        } catch(e) { console.warn("食譜清單讀取略過"); }

        // ----------------------------------------------------
        // 完成
        // ----------------------------------------------------
        clearTimeout(timeoutBomb); // 解除炸彈

        if (Object.keys(flavorDB).length > 0) {
            updateStatus('資料庫就緒，請輸入關鍵字搜尋', false);
            const el = document.getElementById('emptyState');
            if(el) el.style.color = '#999';

            if(errorLog.length > 0) {
                // 顯示輕微錯誤但讓程式繼續跑
                console.warn("讀取錯誤:", errorLog);
                el.innerHTML += `<br><small style="color:orange">有 ${errorLog.length} 個檔案讀取失敗，請看 Console。</small>`;
            }
        } else {
            updateStatus('list.json 雖然讀到了，但資料庫是空的。', true);
        }

        renderCuisines();
        renderOnlineRecipes();
        
        window.addEventListener('resize', () => {
            if(singleChart) singleChart.resize();
            if(bridgeChart) bridgeChart.resize();
        });

    } catch (criticalError) {
        clearTimeout(timeoutBomb);
        updateStatus(`嚴重錯誤：${criticalError.message}`, true);
        console.error(criticalError);
    }
});

// 統一的讀取函式
async function loadSingleData(name, isRecipe = false) {
    if (flavorDB[name]) return flavorDB[name];
    
    // 定義嘗試路徑
    const paths = [
        `data/ingredients/${name}.json`,
        `data/recipes/${name}.json`
    ];

    for (const path of paths) {
        try {
            const res = await fetch(path);
            if (res.ok) {
                const txt = await res.text();
                try {
                    const data = JSON.parse(txt);
                    flavorDB[name] = data;
                    if(isRecipe) onlineRecipes.push(data);
                    return data;
                } catch(e) {
                    console.error(`JSON 格式錯誤: ${path}`);
                }
            }
        } catch(e) { }
    }
    return null;
}

async function loadBatchIngredients(names, errorLog) {
    for (const name of names) {
        const res = await loadSingleData(name);
        if(!res) errorLog.push(name);
    }
}

// 輔助：確保取得資料 (給搜尋用)
async function getIngredientData(name) {
    if (flavorDB[name]) return flavorDB[name];
    return await loadSingleData(name);
}

// --- 以下為 UI 邏輯 (不需變更) ---

function getEditDistance(a, b) {
    if(a.length===0)return b.length; if(b.length===0)return a.length;
    const matrix=[]; for(let i=0;i<=b.length;i++)matrix[i]=[i]; for(let j=0;j<=a.length;j++)matrix[0][j]=j;
    for(let i=1;i<=b.length;i++){for(let j=1;j<=a.length;j++){
        if(b.charAt(i-1)===a.charAt(j-1))matrix[i][j]=matrix[i-1][j-1];
        else matrix[i][j]=Math.min(matrix[i-1][j-1]+1,matrix[i][j-1]+1,matrix[i-1][j]+1);
    }} return matrix[b.length][a.length];
}

function triggerSearch(forcedQuery = null) {
    const rawInput = forcedQuery !== null ? forcedQuery : document.getElementById('searchInput').value;
    const query = rawInput.trim();
    const suggestionList = document.getElementById('suggestionList');

    if (!query) {
        if(suggestionList) suggestionList.style.display = 'none';
        const es = document.getElementById('emptyState');
        const ir = document.getElementById('ingredientResult');
        if(es) es.style.display = 'block';
        if(ir) ir.style.display = 'none';
        return;
    }

    const ir = document.getElementById('ingredientResult');
    const es = document.getElementById('emptyState');
    if(ir) ir.style.display = 'none';
    if(es) es.style.display = 'none';
    if(suggestionList) { suggestionList.innerHTML = ''; suggestionList.style.display = 'none'; }

    const lowerQ = query.toLowerCase();
    const matches = [];

    for (const [key, data] of Object.entries(flavorDB)) {
        const name = key;
        const enName = (data.enName || '').toLowerCase();
        const lowerName = name.toLowerCase();
        let score = 0, isTypo = false;

        if (lowerName === lowerQ || enName === lowerQ) score += 100;
        else if (lowerName.startsWith(lowerQ) || enName.startsWith(lowerQ)) score += 50;
        else if (lowerName.includes(lowerQ) || enName.includes(lowerQ)) score += 30;
        else if (query.length >= 3) {
            const dist = getEditDistance(enName, lowerQ);
            if (dist <= (query.length > 6 ? 2 : 1)) { score += 10; isTypo = true; }
        }

        if (score > 0) matches.push({ name: key, enName: data.enName||'', score, isTypo });
    }

    if (matches.length > 0 && suggestionList) {
        suggestionList.style.display = 'grid';
        matches.sort((a,b)=>b.score!==a.score ? b.score-a.score : a.name.length-b.name.length);
        matches.forEach(m => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `${m.isTypo?'<span class="typo-badge">?</span>':''} <div class="suggestion-name">${m.name}</div>${m.enName?`<div class="suggestion-en">${m.enName}</div>`:''}`;
            div.onclick = () => showIngredient(m.name);
            suggestionList.appendChild(div);
        });
    }
}

async function showIngredient(name, push = true) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-search').classList.add('active');
    
    document.getElementById('suggestionList').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('ingredientResult').style.display = 'block';
    
    document.getElementById('searchInput').value = name;
    
    const data = await getIngredientData(name);

    if (data) {
        currentSingleData = { name: name, pairings: data.pairings };
        document.getElementById('ingredientTitle').innerHTML = name + (data.enName ? ` <small style="color:#888;">${data.enName}</small>` : '');
        
        const notes = document.getElementById('notesContainer');
        notes.innerHTML = '';
        for (const [k, label] of Object.entries(noteLabels)) {
            if (data.meta && data.meta[k]) notes.innerHTML += `<div class="note-item"><span class="note-label">${label}</span>${data.meta[k]}</div>`;
        }

        let recipeSection = document.getElementById('recipeSection');
        if (!recipeSection) {
            recipeSection = document.createElement('div');
            recipeSection.id = 'recipeSection';
            recipeSection.style.marginBottom = '20px';
            notes.parentNode.insertBefore(recipeSection, document.getElementById('pairingHeader'));
        }
        recipeSection.innerHTML = ''; 
        if (data.composition && data.composition.length > 0) {
            recipeSection.innerHTML = '<div class="pairing-header" style="display:block;">經典配方比例：</div><ul style="list-style:none;padding:0;">' + 
            data.composition.map(i => `<li style="margin-bottom:5px;"><span style="cursor:pointer;text-decoration:underline;color:#3b6eac;font-weight:bold;" onclick="showIngredient('${i.name}')">${i.name}</span>: ${i.qty}</li>`).join('') + '</ul>';
        }

        const list = document.getElementById('pairingList');
        const header = document.getElementById('pairingHeader');
        list.innerHTML = '';
        const pairings = data.pairings || [];
        
        if (pairings.length > 0) {
            header.style.display = 'block';
            pairings.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.name;
                li.className = `weight-${item.weight}`;
                li.onclick = () => showIngredient(item.name);
                list.appendChild(li);
            });
        } else if (!data.composition) header.style.display = 'none';

        renderSingleGraph(name, pairings);
    } else {
        document.getElementById('ingredientTitle').innerText = name;
        document.getElementById('notesContainer').innerHTML = '<div style="color:#999; padding:20px 0;"><i>資料庫中尚未建立此項目。</i></div>';
        document.getElementById('pairingList').innerHTML = '';
        document.getElementById('singleGraph').innerHTML = '';
    }

    if (push) navigationStack.push({ page: 'ingredient', data: name });
}

function renderSingleGraph(centerName, pairings) {
    const container = document.getElementById('singleGraph');
    if(container.offsetWidth === 0) return;
    if (!singleChart) singleChart = echarts.init(container);

    let nodes = [{ name: centerName, symbolSize: 40, itemStyle: { color: '#8C9C5E' }, label: { show: true, fontWeight: 'bold' } }];
    let links = [];
    (pairings||[]).sort((a,b)=>b.weight-a.weight).slice(0,15).forEach(p=>{
        nodes.push({ name: p.name, symbolSize: p.weight===3?30:(p.weight===2?25:15), itemStyle: { color: '#c4a986' }, label: { show: true } });
        links.push({ source: centerName, target: p.name, lineStyle: { width: p.weight, color: '#ddd' } });
    });
    
    singleChart.setOption({
        series: [{ type: 'graph', layout: 'force', force: { repulsion: 200, edgeLength: 60 }, data: nodes, links: links, roam: true, label: {show:true} }]
    });
    singleChart.off('click');
    singleChart.on('click', p => { if(p.dataType==='node' && p.name!==centerName) showIngredient(p.name); });
}

async function updateBridge() {
    const valA = document.getElementById('bridgeInputA').value.trim();
    const valB = document.getElementById('bridgeInputB').value.trim();
    const container = document.getElementById('bridgeGraph');
    if(container.offsetWidth === 0 && (!valA && !valB)) return;
    if (!bridgeChart) bridgeChart = echarts.init(container);
    
    let nodes=[], links=[];
    if(valA) nodes.push({name:valA, symbolSize:40, itemStyle:{color:'#8C9C5E'}, label:{show:true}});
    if(valB) nodes.push({name:valB, symbolSize:40, itemStyle:{color:'#3b6eac'}, label:{show:true}});

    if(valA && valB) {
        const dA = await getIngredientData(valA), dB = await getIngredientData(valB);
        if(dA && dB) {
            const common = (dA.pairings||[]).map(p=>p.name).filter(n => (dB.pairings||[]).map(x=>x.name).includes(n));
            document.getElementById('bridgeResultText').innerHTML = common.length ? `發現 ${common.length} 個連結` : '無直接連結';
            common.forEach(c => {
                nodes.push({name:c, symbolSize:15, itemStyle:{color:'#eaddc5'}});
                links.push({source:valA, target:c}, {source:valB, target:c});
            });
        }
    }
    bridgeChart.setOption({ series: [{ type: 'graph', layout: 'force', force: { repulsion: 200 }, data: nodes, links: links, roam: true, label:{show:true} }] });
}

function renderLibrary() {
    const container = document.getElementById('libraryGrid');
    if(!container) return;
    container.innerHTML = '';
    const keys = Object.keys(flavorDB).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    document.getElementById('libraryCount').innerText = `(${keys.length})`;
    keys.forEach(k => {
        const div = document.createElement('div'); div.className = 'suggestion-item';
        div.innerHTML = `<div class="suggestion-name">${k}</div>`;
        div.onclick = () => showIngredient(k);
        container.appendChild(div);
    });
}

function renderOnlineRecipes() {
    const c = document.getElementById('recipeListContainer');
    if(!c) return; c.innerHTML = '';
    if(!onlineRecipes.length) { c.innerHTML = '<div style="text-align:center;color:#999">無食譜</div>'; return; }
    onlineRecipes.forEach(r => {
        const d = document.createElement('div'); d.className = 'recipe-card'; d.style.cursor='pointer';
        d.innerHTML = `<div class="recipe-name">${r.name}</div>`;
        d.onclick = () => showIngredient(r.name);
        c.appendChild(d);
    });
}

function renderCuisines() {
    const g = document.getElementById('cuisineGrid'); if(!g)return; g.innerHTML='';
    cuisineList.forEach(c => {
        const d = document.createElement('div'); d.className='cuisine-card';
        d.innerHTML = `<div>${c.name}</div>`;
        d.onclick = () => showIngredient(c.name, true);
        g.appendChild(d);
    });
}

function toggleMenu() { document.getElementById('sidebar').classList.toggle('active'); document.querySelector('.sidebar-overlay').classList.toggle('active'); }
function switchPage(p) { 
    document.getElementById('sidebar').classList.remove('active'); document.querySelector('.sidebar-overlay').classList.remove('active');
    document.querySelectorAll('.page-section').forEach(e=>e.classList.remove('active'));
    document.getElementById(`page-${p}`).classList.add('active');
    navigationStack.push({page:p});
    if(p==='library') renderLibrary();
    if(p==='bridge') setTimeout(updateBridge, 100);
}
function goBack() { 
    if(navigationStack.length>1) { navigationStack.pop(); const p=navigationStack[navigationStack.length-1]; 
    if(p.page==='home')resetApp(); else if(p.page==='ingredient')showIngredient(p.data,false); else switchPage(p.page); } 
    else resetApp(); 
}
function resetApp() { 
    navigationStack=[{page:'home'}]; document.querySelectorAll('.page-section').forEach(e=>e.classList.remove('active')); 
    document.getElementById('page-search').classList.add('active'); document.getElementById('ingredientResult').style.display='none';
    document.getElementById('searchInput').value=''; document.getElementById('emptyState').style.display='block';
    if(document.getElementById('emptyState').innerText.includes('逾時')) document.getElementById('emptyState').innerHTML='資料庫就緒';
}
function handleEnter(e){if(e.key==='Enter')triggerSearch();}