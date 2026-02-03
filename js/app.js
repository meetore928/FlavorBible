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

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', async () => {
    const emptyState = document.getElementById('emptyState');
    const searchPage = document.getElementById('page-search');
    const searchInput = document.getElementById('searchInput'); // 獲取輸入框
    let errorLog = []; 

    // 動態建立"搜尋建議列表"
    const searchWrapper = searchPage.querySelector('.search-wrapper');
    const suggestionList = document.createElement('div');
    suggestionList.id = 'suggestionList';
    suggestionList.style.display = 'none';
    searchWrapper.parentNode.insertBefore(suggestionList, searchWrapper.nextSibling);

    // 注入 CSS (建議樣式)
    const style = document.createElement('style');
    style.innerHTML = `
        .suggestion-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 30px; }
        .suggestion-item { background: #fff; border: 1px solid #e0e0e0; padding: 15px 10px; text-align: center; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.02); position: relative; overflow: hidden; }
        .suggestion-item:hover { border-color: var(--title-color); transform: translateY(-3px); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .suggestion-name { font-weight: 900; color: #333; font-size: 18px; }
        .suggestion-en { display: block; font-size: 13px; color: #888; margin-top: 5px; font-family: sans-serif; }
        .typo-badge { position: absolute; top: 2px; right: 2px; font-size: 10px; background: #eee; color: #666; padding: 2px 4px; border-radius: 4px; }
    `;
    document.head.appendChild(style);

    // [新增] 綁定即時輸入事件，解決"打出杏不會出現"的問題
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            triggerSearch(e.target.value);
        });
    }

    // 1. 載入食材清單
    try {
        const listRes = await fetch('data/list.json');
        if (!listRes.ok) throw new Error(`找不到 list.json`);
        const ingList = await listRes.json();
        await loadBatchIngredients(ingList, errorLog);
    } catch (e) { errorLog.push(`list.json 讀取失敗: ${e.message}`); }

    // 2. 載入國家
    try {
        const cuisineRes = await fetch('data/cuisines_list.json');
        if (cuisineRes.ok) {
            const cListNames = await cuisineRes.json();
            await loadBatchIngredients(cListNames, errorLog);
            cuisineList = cListNames.filter(n => flavorDB[n]).map(n => flavorDB[n]);
        }
    } catch (e) { console.warn("跳過國家載入", e); }

    // 3. 載入食譜
    try {
        const recListRes = await fetch('data/recipes_list.json');
        if (recListRes.ok) {
            const recList = await recListRes.json();
            const tasks = recList.map(async (n) => {
                try {
                    const r = await fetch(`data/recipes/${n}.json`);
                    if(r.ok) onlineRecipes.push(await r.json());
                } catch(err){}
            });
            await Promise.all(tasks);
        }
    } catch (e) {}

    // 狀態更新
    if (Object.keys(flavorDB).length > 0) {
        emptyState.innerHTML = '資料庫就緒，輸入關鍵字搜尋 (例如: A, 羊, 義...)';
        if(errorLog.length > 0) {
            emptyState.innerHTML += `<br><div style="color:red; font-size:14px; margin-top:10px;">部分檔案讀取失敗，請檢查 Console</div>`;
        }
    } else {
        emptyState.innerHTML = '無法讀取資料庫';
    }

    renderCuisines();
    renderOnlineRecipes();
    
    // 初始化 ECharts (視窗縮放時調整大小)
    window.addEventListener('resize', () => {
        if(singleChart) singleChart.resize();
        if(bridgeChart) bridgeChart.resize();
        
        // 重新渲染以套用手機/電腦版不同的參數
        if(singleChart && currentSingleData) {
            renderSingleGraph(currentSingleData.name, currentSingleData.pairings);
        }
        if(bridgeChart) updateBridge();
    });
});

async function loadBatchIngredients(names, errorLog) {
    const tasks = names.map(async (name) => {
        if (flavorDB[name]) return;
        try {
            const res = await fetch(`data/ingredients/${name}.json`);
            if(!res.ok) throw new Error();
            flavorDB[name] = await res.json();
        } catch (err) { errorLog.push(name); }
    });
    await Promise.all(tasks);
}

// 輔助：確保取得食材資料
async function getIngredientData(name) {
    if (flavorDB[name]) return flavorDB[name];
    try {
        const res = await fetch(`data/ingredients/${name}.json`);
        if (res.ok) {
            const data = await res.json();
            flavorDB[name] = data;
            return data;
        }
    } catch(e) {}
    return null;
}

// --- [新增] 演算法工具：計算字串編輯距離 (Levenshtein Distance) ---
function getEditDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // 初始化第一列和第一行
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // 替換
                    Math.min(
                        matrix[i][j - 1] + 1, // 插入
                        matrix[i - 1][j] + 1  // 刪除
                    )
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// --- 核心功能 (已修改為包含容錯與排序) ---

function triggerSearch(forcedQuery = null) {
    // 如果沒有傳入參數，則讀取輸入框
    const rawInput = forcedQuery !== null ? forcedQuery : document.getElementById('searchInput').value;
    const query = rawInput.trim();
    const suggestionList = document.getElementById('suggestionList');

    if (!query) {
        // 如果清空了，隱藏建議列表，顯示空狀態
        suggestionList.style.display = 'none';
        document.getElementById('emptyState').style.display = 'block';
        document.getElementById('ingredientResult').style.display = 'none';
        return;
    }

    // 清空目前顯示
    document.getElementById('ingredientResult').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    suggestionList.innerHTML = '';
    suggestionList.className = 'suggestion-grid'; 

    const lowerQ = query.toLowerCase();
    const matches = [];

    // 遍歷資料庫進行比對
    for (const [key, data] of Object.entries(flavorDB)) {
        const name = key;
        const enName = (data.enName || '').toLowerCase();
        const lowerName = name.toLowerCase();

        let score = 0;
        let isTypo = false;

        // 1. 精確比對 (優先級最高)
        if (lowerName === lowerQ || enName === lowerQ) score += 100;

        // 2. 開頭符合 (優先級高)
        else if (lowerName.startsWith(lowerQ) || enName.startsWith(lowerQ)) score += 50;

        // 3. 內容包含 (優先級中 - 解決"杏"找不到"杏仁"的問題)
        else if (lowerName.includes(lowerQ) || enName.includes(lowerQ)) score += 30;

        // 4. 容錯搜尋 (優先級低 - 解決打錯字)
        else {
            // 計算編輯距離 (僅針對 3 個字以上的查詢，避免短字誤判)
            if (query.length >= 3) {
                const distEn = getEditDistance(enName, lowerQ);
                // 允許誤差：長度越長允許越多錯誤，基本允許 1-2 個錯字
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

    if (matches.length === 0) {
        suggestionList.style.display = 'none';
        // 如果完全沒有建議，可以選擇顯示"找不到"或嘗試顯示最接近的結果
        // 這裡保持原樣，不顯示
    } else {
        suggestionList.style.display = 'grid';
        
        // 排序：分數高 > 字串長度短 (越短通常越精準)
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
        
        // 如果是按 Enter 觸發的 (forcedQuery 為 null)，且有完全匹配的，更新導航堆疊
        if (forcedQuery === null) navigationStack = [{ page: 'search_results', data: query }];
    }
}

// 暫存目前顯示的資料，供 Resize 使用
let currentSingleData = null;

async function showIngredient(name, push = true) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-search').classList.add('active');
    document.getElementById('suggestionList').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    
    const resultDiv = document.getElementById('ingredientResult');
    resultDiv.style.display = 'block';
    
    document.getElementById('searchInput').value = name;
    
    const data = await getIngredientData(name);

    if (data) {
        currentSingleData = { name: name, pairings: data.pairings };

        // 1. 填寫標題與筆記
        document.getElementById('ingredientTitle').innerHTML = name + (data.enName ? ` <small style="color:#888;">${data.enName}</small>` : '');
        const notes = document.getElementById('notesContainer');
        notes.innerHTML = '';
        for (const [k, label] of Object.entries(noteLabels)) {
            if (data.meta && data.meta[k]) {
                notes.innerHTML += `<div class="note-item"><span class="note-label">${label}</span>${data.meta[k]}</div>`;
            }
        }

        // 2. 填寫列表
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
            header.style.display = 'none';
        }

        // 3. 渲染關係圖
        renderSingleGraph(name, pairings);

    } else {
        currentSingleData = null;
        document.getElementById('ingredientTitle').innerText = name;
        document.getElementById('notesContainer').innerHTML = '<div style="color:#999; padding:20px 0;"><i>資料庫中尚未建立此項目。</i></div>';
        document.getElementById('pairingHeader').style.display = 'none';
        document.getElementById('pairingList').innerHTML = '';
        document.getElementById('singleGraph').innerHTML = '';
    }

    if (push) navigationStack.push({ page: 'ingredient', data: name });
}

function renderSingleGraph(centerName, pairings) {
    const container = document.getElementById('singleGraph');
    // 如果 dom 被隱藏，init 會報錯，先檢查 display
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
    
    // 檢查容器是否可見
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

// [修改] 通用繪圖函式 (增加手機版判斷邏輯)
function renderChart(chartInstance, nodes, links) {
    // 1. 偵測是否為手機
    const isMobile = window.innerWidth < 768;

    // 2. 設定不同的參數
    const sizeFactor = isMobile ? 0.6 : 1; 
    const forceRepulsion = isMobile ? 150 : 300; 
    const edgeLength = isMobile ? 40 : 80; 
    const labelSize = isMobile ? 10 : 12; 

    // 3. 調整節點數據 (動態縮放)
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
            label: { 
                show: true, 
                position: 'right',
                fontSize: labelSize 
            },
            lineStyle: { curveness: 0.1 }
        }]
    };
    chartInstance.setOption(option);
}

// --- 導航與其他函式 ---

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
    document.getElementById('suggestionList').style.display = 'none'; 
    document.getElementById('emptyState').style.display = 'block'; 
    
    document.getElementById('sidebar').classList.remove('active');
    document.querySelector('.sidebar-overlay').classList.remove('active');
}

function renderOnlineRecipes() {
    const container = document.getElementById('recipeListContainer');
    container.innerHTML = '';
    if (onlineRecipes.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#999;">目前沒有食譜。</div>';
        return;
    }
    onlineRecipes.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        let ingStr = (recipe.ingredients || []).map(i => 
            `<span style="cursor:pointer;text-decoration:underline;" onclick="showIngredient('${i.name}')">${i.name}</span>: ${i.qty}`
        ).join('<br>');
        card.innerHTML = `<div class="recipe-name">${recipe.name}</div><div style="font-size:14px;color:#555;">${ingStr}</div>`;
        container.appendChild(card);
    });
}

function renderCuisines() { 
    const grid = document.getElementById('cuisineGrid'); 
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
        div.onclick = () => { 
            navigationStack = [{ page: 'home', data: null }];
            showIngredient(c.name, true); 
        }; 
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
    document.getElementById(`page-${p}`).classList.add('active'); 
    if (push) navigationStack.push({page: p, data: null}); 
    
    // 解決切換頁面時圖表可能沒渲染的問題
    if(p === 'bridge') setTimeout(updateBridge, 100);
}

function handleEnter(e) { if(e.key === 'Enter') triggerSearch(); }