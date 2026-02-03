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
    let errorLog = []; 

    // 動態建立"搜尋建議列表"
    const searchWrapper = searchPage.querySelector('.search-wrapper');
    const suggestionList = document.createElement('div');
    suggestionList.id = 'suggestionList';
    suggestionList.style.display = 'none';
    searchWrapper.parentNode.insertBefore(suggestionList, searchWrapper.nextSibling);

    // 注入 CSS
    const style = document.createElement('style');
    style.innerHTML = `
        .suggestion-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 30px; }
        .suggestion-item { background: #fff; border: 1px solid #e0e0e0; padding: 15px 10px; text-align: center; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
        .suggestion-item:hover { border-color: var(--title-color); transform: translateY(-3px); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .suggestion-name { font-weight: 900; color: #333; font-size: 18px; }
        .suggestion-en { display: block; font-size: 13px; color: #888; margin-top: 5px; font-family: sans-serif; }
    `;
    document.head.appendChild(style);

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

// 輔助：確保取得食材資料 (包含尚未載入的)
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

// --- 核心功能 ---

function triggerSearch(forcedQuery = null) {
    const rawInput = document.getElementById('searchInput').value;
    const query = (forcedQuery !== null ? forcedQuery : rawInput).trim();
    if (!query) return;

    // 清空與重置
    document.getElementById('ingredientResult').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    const suggestionList = document.getElementById('suggestionList');
    suggestionList.innerHTML = '';
    suggestionList.className = 'suggestion-grid'; 

    const lowerQ = query.toLowerCase();
    const matches = [];

    for (const [key, data] of Object.entries(flavorDB)) {
        const nameMatch = key.toLowerCase().startsWith(lowerQ);
        const enMatch = data.enName && data.enName.toLowerCase().startsWith(lowerQ);
        if (nameMatch || enMatch) matches.push({ name: key, enName: data.enName || '' });
    }

    if (matches.length === 0) {
        suggestionList.style.display = 'none';
        showIngredient(query, true); 
    } else {
        suggestionList.style.display = 'grid';
        matches.sort((a, b) => a.name.length - b.name.length);
        matches.forEach(m => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<div class="suggestion-name">${m.name}</div>${m.enName ? `<div class="suggestion-en">${m.enName}</div>` : ''}`;
            div.onclick = () => showIngredient(m.name);
            suggestionList.appendChild(div);
        });
        if (forcedQuery === null) navigationStack = [{ page: 'search_results', data: query }];
    }
}

// [修改] 顯示單一食材：同時渲染圖表 (方案B) 與 列表
async function showIngredient(name, push = true) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-search').classList.add('active');
    document.getElementById('suggestionList').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    
    const resultDiv = document.getElementById('ingredientResult');
    resultDiv.style.display = 'block';
    
    document.getElementById('searchInput').value = name;
    
    // 確保資料存在 (若點擊圖表節點，可能資料還沒 fetch)
    const data = await getIngredientData(name);

    if (data) {
        // 1. 填寫標題與筆記
        document.getElementById('ingredientTitle').innerHTML = name + (data.enName ? ` <small style="color:#888;">${data.enName}</small>` : '');
        const notes = document.getElementById('notesContainer');
        notes.innerHTML = '';
        for (const [k, label] of Object.entries(noteLabels)) {
            if (data.meta && data.meta[k]) {
                notes.innerHTML += `<div class="note-item"><span class="note-label">${label}</span>${data.meta[k]}</div>`;
            }
        }

        // 2. 填寫列表 (保留條列式)
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

        // 3. [新增] 渲染關係圖 (Plan B)
        renderSingleGraph(name, pairings);

    } else {
        // 查無資料
        document.getElementById('ingredientTitle').innerText = name;
        document.getElementById('notesContainer').innerHTML = '<div style="color:#999; padding:20px 0;"><i>資料庫中尚未建立此項目。</i></div>';
        document.getElementById('pairingHeader').style.display = 'none';
        document.getElementById('pairingList').innerHTML = '';
        document.getElementById('singleGraph').innerHTML = ''; // 清空圖表
    }

    if (push) navigationStack.push({ page: 'ingredient', data: name });
}

// [新增] 方案 B 的圖表繪製邏輯
function renderSingleGraph(centerName, pairings) {
    const container = document.getElementById('singleGraph');
    if (!singleChart) singleChart = echarts.init(container);

    // 準備節點與連線
    // 中心點
    let nodes = [{
        name: centerName,
        symbolSize: 40,
        itemStyle: { color: '#8C9C5E' },
        label: { show: true, fontWeight: 'bold' }
    }];
    let links = [];

    // 周圍點 (取前 15 個權重最高的，避免圖太亂)
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
    
    // 點擊事件：點擊圖上的圈圈也可跳轉
    singleChart.off('click');
    singleChart.on('click', function (params) {
        if (params.dataType === 'node' && params.name !== centerName) {
            showIngredient(params.name);
        }
    });
}

// [新增] 方案 A：風味橋接邏輯
async function updateBridge() {
    const valA = document.getElementById('bridgeInputA').value.trim();
    const valB = document.getElementById('bridgeInputB').value.trim();
    const resultText = document.getElementById('bridgeResultText');
    const container = document.getElementById('bridgeGraph');
    
    if (!bridgeChart) bridgeChart = echarts.init(container);

    let nodes = [];
    let links = [];

    // 1. 處理 A
    if (valA) {
        nodes.push({ name: valA, x: 100, y: 300, fixed: false, symbolSize: 50, itemStyle: { color: '#8C9C5E' }, label: {show:true, fontSize:16, fontWeight:'bold'} });
    }

    // 2. 處理 B
    if (valB) {
        nodes.push({ name: valB, x: 500, y: 300, fixed: false, symbolSize: 50, itemStyle: { color: '#3b6eac' }, label: {show:true, fontSize:16, fontWeight:'bold'} });
    }

    // 3. 處理交集 (當兩者都有輸入時)
    if (valA && valB) {
        const dataA = await getIngredientData(valA);
        const dataB = await getIngredientData(valB);

        if (dataA && dataB) {
            const listA = (dataA.pairings || []).map(p => p.name);
            const listB = (dataB.pairings || []).map(p => p.name);
            
            // 找出共同朋友
            const common = listA.filter(n => listB.includes(n));
            
            if (common.length === 0) {
                resultText.innerHTML = `找不到 <b>${valA}</b> 與 <b>${valB}</b> 的共同搭配。`;
            } else {
                resultText.innerHTML = `發現 ${common.length} 個共同連結！`;
                
                common.forEach(cName => {
                    nodes.push({
                        name: cName,
                        symbolSize: 20,
                        itemStyle: { color: '#eaddc5' }, // 米黃色
                        label: { show: true, color: '#555' }
                    });
                    // 連接 A -> Common
                    links.push({ source: valA, target: cName, lineStyle: { color: '#8C9C5E', opacity: 0.4 } });
                    // 連接 B -> Common
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

// [新增] 通用繪圖函式 (ECharts Force Layout)
function renderChart(chartInstance, nodes, links) {
    const option = {
        tooltip: {},
        animationDurationUpdate: 1500,
        animationEasingUpdate: 'quinticInOut',
        series: [{
            type: 'graph',
            layout: 'force',
            force: {
                repulsion: 300,     // 節點之間的排斥力
                edgeLength: 80,      // 連線長度
                gravity: 0.1
            },
            data: nodes,
            links: links,
            roam: true,             // 允許滑鼠拖拉縮放
            label: { show: true, position: 'right' },
            lineStyle: { curveness: 0.1 }
        }]
    };
    chartInstance.setOption(option);
}

// --- 導航與其他函式 (保持不變) ---

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
}

function handleEnter(e) { if(e.key === 'Enter') triggerSearch(); }