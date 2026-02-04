// --- 核心資料 ---
let flavorDB = {};     // 總資料庫
let cuisineList = [];  // 國家清單
let onlineRecipes = [];

// ECharts 實例變數
let singleChart = null;
let bridgeChart = null;

// 筆記標籤對照
const noteLabels = { 
    season: "季節", taste: "味道", tips: "小秘訣", 
    affinities: "對味組合", notes: "筆記", 
    function: "功能質性", volume: "分量感", intensity: "風味強度", techniques: "調理方式", avoid: "避免"
};

// 導航堆疊
let navigationStack = [{ page: 'home', data: null }];

// --- 輔助：顯示載入狀態 ---
function updateStatus(msg, isError = false) {
    const el = document.getElementById('emptyState');
    if (el) {
        el.innerHTML = msg;
        if (isError) el.style.color = 'red';
    }
    console.log(`[System] ${msg}`);
}

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', async () => {
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput'); 
    let errorLog = []; 

    // 0. 全局錯誤捕捉
    try {
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                triggerSearch(e.target.value);
            });
        }

        // 1. 載入食材清單
        updateStatus("正在讀取食材清單 (list.json)...");
        try {
            const listRes = await fetch('data/list.json');
            if (!listRes.ok) throw new Error(`找不到 data/list.json (404)`);
            const ingList = await listRes.json();
            await loadBatchIngredients(ingList, errorLog);
        } catch (e) { 
            errorLog.push(`list.json 錯誤: ${e.message}`); 
            console.error(e);
        }

        // 2. 載入國家
        updateStatus("正在讀取國家清單...");
        try {
            const cuisineRes = await fetch('data/cuisines_list.json');
            if (cuisineRes.ok) {
                const cListNames = await cuisineRes.json();
                await loadBatchIngredients(cListNames, errorLog);
                cuisineList = cListNames.filter(n => flavorDB[n]).map(n => flavorDB[n]);
            }
        } catch (e) { console.warn("跳過國家載入", e); }

        // 3. 載入食譜
        updateStatus("正在讀取食譜庫...");
        try {
            const recListRes = await fetch('data/recipes_list.json');
            if (recListRes.ok) {
                const recList = await recListRes.json();
                // 逐一載入，避免 Promise.all 因為一個壞檔而全部卡死
                for (const n of recList) {
                    try {
                        let r = await fetch(`data/recipes/${n}.json`);
                        if(!r.ok) r = await fetch(`data/ingredients/${n}.json`); 
                        
                        if(r.ok) {
                            // 這裡加強了 JSON 解析的保護
                            const text = await r.text();
                            try {
                                const data = JSON.parse(text);
                                flavorDB[data.name] = data; 
                                onlineRecipes.push(data);
                            } catch (jsonErr) {
                                errorLog.push(`檔案格式錯誤 (JSON Error): ${n}.json`);
                            }
                        }
                    } catch(err){
                        console.error(`食譜 ${n} 載入失敗`, err);
                    }
                }
            }
        } catch (e) {
            console.warn("跳過食譜載入或 recipes_list.json 不存在");
        }

        // 4. 最終狀態檢查
        if (Object.keys(flavorDB).length > 0) {
            if(emptyState) {
                emptyState.style.color = '#999';
                emptyState.innerHTML = '資料庫就緒，輸入關鍵字搜尋 (例如: A, 羊, 義...)';
            }
            
            // 如果有錯誤，顯示在下方供除錯
            if(errorLog.length > 0 && emptyState) {
                emptyState.innerHTML += `<br><div style="color:red; font-size:12px; margin-top:10px; text-align:left; background:#fff0f0; padding:10px;">
                    <strong>部分檔案讀取失敗：</strong><br>${errorLog.join('<br>')}
                </div>`;
            }
        } else {
            updateStatus('無法讀取任何資料庫內容，請檢查 data 資料夾設定', true);
        }

        renderCuisines();
        renderOnlineRecipes();
        
        // 初始化 ECharts
        window.addEventListener('resize', () => {
            if(singleChart) singleChart.resize();
            if(bridgeChart) bridgeChart.resize();
            if(singleChart && currentSingleData) {
                renderSingleGraph(currentSingleData.name, currentSingleData.pairings);
            }
            if(bridgeChart) updateBridge();
        });

    } catch (criticalError) {
        // 這是最重要的部分：如果程式崩潰，顯示原因
        updateStatus(`程式發生嚴重錯誤：<br>${criticalError.message}<br><small>請檢查 Console 獲取詳細資訊</small>`, true);
        console.error("Critical System Error:", criticalError);
    }
});

async function loadBatchIngredients(names, errorLog) {
    // 使用 for...of 迴圈代替 Promise.all 避免並發錯誤難以追蹤
    for (const name of names) {
        if (flavorDB[name]) continue;
        try {
            const res = await fetch(`data/ingredients/${name}.json`);
            if(!res.ok) {
                // 嘗試從 recipes 資料夾找找看
                 const res2 = await fetch(`data/recipes/${name}.json`);
                 if(res2.ok) {
                     const txt = await res2.text();
                     flavorDB[name] = JSON.parse(txt);
                     continue;
                 }
                 throw new Error("404 Not Found");
            }
            const txt = await res.text();
            flavorDB[name] = JSON.parse(txt);
        } catch (err) { 
            // 這裡不紀錄每一個 404，避免錯誤訊息洗版，只記錄嚴重的
        }
    }
}

// 輔助：確保取得食材資料
async function getIngredientData(name) {
    if (flavorDB[name]) return flavorDB[name];
    try {
        let res = await fetch(`data/ingredients/${name}.json`);
        if(!res.ok) res = await fetch(`data/recipes/${name}.json`);
        
        if (res.ok) {
            const data = await res.json();
            flavorDB[name] = data;
            return data;
        }
    } catch(e) {}
    return null;
}

// --- 演算法工具：Levenshtein Distance (模糊搜尋) ---
function getEditDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// --- 核心功能 ---
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
    
    if(suggestionList) {
        suggestionList.innerHTML = '';
        suggestionList.style.display = 'none';
    }

    const lowerQ = query.toLowerCase();
    const matches = [];

    for (const [key, data] of Object.entries(flavorDB)) {
        const name = key;
        const enName = (data.enName || '').toLowerCase();
        const lowerName = name.toLowerCase();

        let score = 0;
        let isTypo = false;

        if (lowerName === lowerQ || enName === lowerQ) score += 100;
        else if (lowerName.startsWith(lowerQ) || enName.startsWith(lowerQ)) score += 50;
        else if (lowerName.includes(lowerQ) || enName.includes(lowerQ)) score += 30;
        else {
            if (query.length >= 3) {
                const distEn = getEditDistance(enName, lowerQ);
                const threshold = query.length > 6 ? 2 : 1;
                if (distEn <= threshold) {
                    score += 10;
                    isTypo = true;
                }
            }
        }

        if (score > 0) {
            matches.push({ 
                name: key, 
                enName: data.enName || '', 
                score: score,
                isTypo: isTypo 
            });
        }
    }

    if (matches.length > 0 && suggestionList) {
        suggestionList.style.display = 'grid';
        matches.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.name.length - b.name.length;
        });

        matches.forEach(m => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            let typoBadge = m.isTypo ? `<span class="typo-badge">您是找...?</span>` : '';
            div.innerHTML = `
                ${typoBadge}
                <div class="suggestion-name">${m.name}</div>
                ${m.enName ? `<div class="suggestion-en">${m.enName}</div>` : ''}
            `;
            div.onclick = () => showIngredient(m.name);
            suggestionList.appendChild(div);
        });
    }
}

let currentSingleData = null;

async function showIngredient(name, push = true) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-search').classList.add('active');
    
    const sl = document.getElementById('suggestionList');
    if(sl) sl.style.display = 'none';
    const es = document.getElementById('emptyState');
    if(es) es.style.display = 'none';
    
    const resultDiv = document.getElementById('ingredientResult');
    resultDiv.style.display = 'block';
    
    document.getElementById('searchInput').value = name;
    
    const data = await getIngredientData(name);

    if (data) {
        currentSingleData = { name: name, pairings: data.pairings };

        document.getElementById('ingredientTitle').innerHTML = name + (data.enName ? ` <small style="color:#888;">${data.enName}</small>` : '');
        const notes = document.getElementById('notesContainer');
        notes.innerHTML = '';
        for (const [k, label] of Object.entries(noteLabels)) {
            if (data.meta && data.meta[k]) {
                notes.innerHTML += `<div class="note-item"><span class="note-label">${label}</span>${data.meta[k]}</div>`;
            }
        }

        // 處理食譜配比
        let recipeSection = document.getElementById('recipeSection');
        if (!recipeSection) {
            recipeSection = document.createElement('div');
            recipeSection.id = 'recipeSection';
            recipeSection.style.marginBottom = '20px';
            notes.parentNode.insertBefore(recipeSection, document.getElementById('pairingHeader'));
        }
        recipeSection.innerHTML = ''; 

        if (data.composition && data.composition.length > 0) {
            recipeSection.innerHTML = '<div class="pairing-header" style="display:block;">經典配方比例：</div>';
            const ul = document.createElement('ul');
            ul.style.listStyle = 'none'; 
            ul.style.padding = '0';
            data.composition.forEach(item => {
                const li = document.createElement('li');
                li.style.fontSize = '16px';
                li.style.marginBottom = '5px';
                li.style.color = '#555';
                li.innerHTML = `
                    <span style="cursor:pointer; text-decoration:underline; color:#3b6eac; font-weight:bold;" 
                          onclick="showIngredient('${item.name}')">
                          ${item.name}
                    </span> 
                    : ${item.qty}`;
                ul.appendChild(li);
            });
            recipeSection.appendChild(ul);
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
        } else {
            if (!data.composition || data.composition.length === 0) {
                 header.style.display = 'none';
            }
        }
        renderSingleGraph(name, pairings);

    } else {
        currentSingleData = null;
        document.getElementById('ingredientTitle').innerText = name;
        document.getElementById('notesContainer').innerHTML = '<div style="color:#999; padding:20px 0;"><i>資料庫中尚未建立此項目。</i></div>';
        document.getElementById('pairingHeader').style.display = 'none';
        document.getElementById('pairingList').innerHTML = '';
        document.getElementById('singleGraph').innerHTML = '';
        const rs = document.getElementById('recipeSection');
        if(rs) rs.innerHTML = '';
    }

    if (push) {
        navigationStack.push({ page: 'ingredient', data: name });
    }
}

function renderSingleGraph(centerName, pairings) {
    const container = document.getElementById('singleGraph');
    if(container.offsetWidth === 0) return;
    if (!singleChart) singleChart = echarts.init(container);

    let nodes = [{
        name: centerName,
        symbolSize: 40,
        itemStyle: { color: '#8C9C5E' },
        label: { show: true, fontWeight: 'bold' }
    }];
    let links = [];

    const topPairings = pairings.sort((a,b) => b.weight - a.weight).slice(0, 15);
    topPairings.forEach(p => {
        nodes.push({
            name: p.name,
            symbolSize: p.weight === 3 ? 30 : (p.weight === 2 ? 25 : 15),
            itemStyle: { color: '#c4a986' },
            label: { show: true }
        });
        links.push({
            source: centerName,
            target: p.name,
            lineStyle: { width: p.weight, color: '#ddd' }
        });
    });
    renderChart(singleChart, nodes, links);
    singleChart.off('click');
    singleChart.on('click', function (params) {
        if (params.dataType === 'node' && params.name !== centerName) {
            showIngredient(params.name);
        }
    });
}

async function updateBridge() {
    const valA = document.getElementById('bridgeInputA').value.trim();
    const valB = document.getElementById('bridgeInputB').value.trim();
    const resultText = document.getElementById('bridgeResultText');
    const container = document.getElementById('bridgeGraph');
    
    if(container.offsetWidth === 0 && (!valA && !valB)) return;
    if (!bridgeChart) bridgeChart = echarts.init(container);

    let nodes = [];
    let links = [];

    if (valA) nodes.push({ name: valA, symbolSize: 50, itemStyle: { color: '#8C9C5E' }, label: {show:true, fontSize:16, fontWeight:'bold'} });
    if (valB) nodes.push({ name: valB, symbolSize: 50, itemStyle: { color: '#3b6eac' }, label: {show:true, fontSize:16, fontWeight:'bold'} });

    if (valA && valB) {
        const dataA = await getIngredientData(valA);
        const dataB = await getIngredientData(valB);

        if (dataA && dataB) {
            const listA = (dataA.pairings || []).map(p => p.name);
            const listB = (dataB.pairings || []).map(p => p.name);
            const common = listA.filter(n => listB.includes(n));
            
            if (common.length === 0) {
                resultText.innerHTML = `找不到 <b>${valA}</b> 與 <b>${valB}</b> 的共同搭配。`;
            } else {
                resultText.innerHTML = `發現 ${common.length} 個共同連結！`;
                common.forEach(cName => {
                    nodes.push({ name: cName, symbolSize: 20, itemStyle: { color: '#eaddc5' }, label: { show: true, color: '#555' } });
                    links.push({ source: valA, target: cName, lineStyle: { color: '#8C9C5E', opacity: 0.4 } });
                    links.push({ source: valB, target: cName, lineStyle: { color: '#3b6eac', opacity: 0.4 } });
                });
            }
        } else {
            resultText.innerText = "其中一個食材不在資料庫中，無法分析。";
        }
    } else {
        resultText.innerText = "請輸入兩個食材來查看連結。";
    }
    renderChart(bridgeChart, nodes, links);
}

function renderChart(chartInstance, nodes, links) {
    const isMobile = window.innerWidth < 768;
    const sizeFactor = isMobile ? 0.6 : 1; 
    const forceRepulsion = isMobile ? 150 : 300; 
    const edgeLength = isMobile ? 40 : 80; 
    const labelSize = isMobile ? 10 : 12; 

    const adjustedNodes = nodes.map(node => ({
        ...node,
        symbolSize: (node.symbolSize || 20) * sizeFactor,
        label: {
            ...node.label,
            fontSize: node.label?.fontSize ? Math.max(10, node.label.fontSize * sizeFactor) : labelSize
        }
    }));

    const option = {
        tooltip: {},
        animationDurationUpdate: 1500,
        animationEasingUpdate: 'quinticInOut',
        series: [{
            type: 'graph',
            layout: 'force',
            force: {
                repulsion: forceRepulsion,
                edgeLength: edgeLength,
                gravity: 0.1
            },
            data: adjustedNodes,
            links: links,
            roam: true,
            label: { show: true, position: 'right', fontSize: labelSize },
            lineStyle: { curveness: 0.1 }
        }]
    };
    chartInstance.setOption(option);
}

function renderLibrary() {
    const container = document.getElementById('libraryGrid');
    const countLabel = document.getElementById('libraryCount');
    if (!container) return;
    container.innerHTML = '';
    const allKeys = Object.keys(flavorDB).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    if (countLabel) countLabel.innerText = `(${allKeys.length})`;

    if (allKeys.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#999; padding:20px;">資料庫目前為空</div>';
        return;
    }
    allKeys.forEach(key => {
        const data = flavorDB[key];
        const div = document.createElement('div');
        div.className = 'suggestion-item'; 
        div.innerHTML = `
            <div class="suggestion-name">${key}</div>
            ${data.enName ? `<div class="suggestion-en">${data.enName}</div>` : ''}
        `;
        div.onclick = () => showIngredient(key);
        container.appendChild(div);
    });
}

function goBack() {
    if (navigationStack.length > 1) {
        navigationStack.pop(); 
        const prev = navigationStack[navigationStack.length - 1]; 
        if (prev.page === 'home') resetApp();
        else if (prev.page === 'ingredient') showIngredient(prev.data, false);
        else if (prev.page === 'search_results') {
            document.getElementById('searchInput').value = prev.data;
            triggerSearch(prev.data);
        }
        else switchPage(prev.page, false);
    } else {
        resetApp();
    }
}

function resetApp() {
    navigationStack = [{ page: 'home', data: null }];
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-search').classList.add('active');
    document.getElementById('searchInput').value = ''; 
    document.getElementById('ingredientResult').style.display = 'none'; 
    const sl = document.getElementById('suggestionList');
    if(sl) sl.style.display = 'none'; 
    const es = document.getElementById('emptyState');
    if(es) {
        es.style.display = 'block'; 
        // 重置時確保空狀態文字是正常的
        if (!es.innerHTML.includes('資料庫就緒')) {
             es.innerHTML = '資料庫就緒，輸入關鍵字搜尋 (例如: A, 羊, 義...)';
        }
    }
    const sb = document.getElementById('sidebar');
    if(sb) sb.classList.remove('active');
    const sbo = document.querySelector('.sidebar-overlay');
    if(sbo) sbo.classList.remove('active');
}

function renderOnlineRecipes() {
    const container = document.getElementById('recipeListContainer');
    if(!container) return;
    container.innerHTML = '';
    if (onlineRecipes.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#999;">目前沒有食譜。</div>';
        return;
    }
    onlineRecipes.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.style.cursor = 'pointer'; 
        let ingStr = (recipe.ingredients || []).map(i => `<span>${i.name}</span>: ${i.qty}`).join(' | ');
        if((!recipe.ingredients || recipe.ingredients.length === 0) && recipe.composition) {
             ingStr = recipe.composition.map(i => `<span>${i.name}</span>: ${i.qty}`).join(' | ');
        }
        card.innerHTML = `<div class="recipe-name">${recipe.name}</div><div style="font-size:14px;color:#555;">${ingStr}</div>`;
        card.onclick = () => showIngredient(recipe.name);
        container.appendChild(card);
    });
}

function renderCuisines() { 
    const grid = document.getElementById('cuisineGrid'); 
    if(!grid) return;
    grid.innerHTML = ''; 
    if (cuisineList.length === 0) {
        grid.innerHTML = '<div style="text-align:center; color:#999;">尚未設定國家清單</div>';
        return;
    }
    cuisineList.forEach(c => { 
        const div = document.createElement('div'); 
        div.className = 'cuisine-card'; 
        let top = (c.pairings || []).sort((a,b)=>b.weight-a.weight).slice(0,4).map(p=>p.name).join('、');
        div.innerHTML = `<div>${c.name}</div><div style="font-size:12px;color:#666;margin-top:5px;">${top}...</div>`;
        div.onclick = () => showIngredient(c.name, true); 
        grid.appendChild(div); 
    }); 
}

function toggleMenu() { 
    document.getElementById('sidebar').classList.toggle('active'); 
    document.querySelector('.sidebar-overlay').classList.toggle('active'); 
}

function switchPage(p, push = true) { 
    document.getElementById('sidebar').classList.remove('active');
    document.querySelector('.sidebar-overlay').classList.remove('active');
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active')); 
    const target = document.getElementById(`page-${p}`);
    if(target) target.classList.add('active'); 
    if (push) navigationStack.push({page: p, data: null}); 
    if(p === 'bridge') setTimeout(updateBridge, 100);
    if(p === 'library') renderLibrary();
}

function handleEnter(e) { if(e.key === 'Enter') triggerSearch(); }