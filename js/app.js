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
    const searchInput = document.getElementById('searchInput'); 
    let errorLog = []; 

    // 綁定即時輸入事件 (Real-time search)
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

    // 3. 載入食譜 (解決香氣讀取不到的問題)
    try {
        const recListRes = await fetch('data/recipes_list.json');
        if (recListRes.ok) {
            const recList = await recListRes.json();
            const tasks = recList.map(async (n) => {
                try {
                    // 嘗試從 ingredients 或 recipes 資料夾讀取，視你的檔案架構而定
                    // 這裡假設食譜也是一種食材格式的 JSON
                    let r = await fetch(`data/recipes/${n}.json`);
                    if(!r.ok) r = await fetch(`data/ingredients/${n}.json`); // fallback
                    
                    if(r.ok) {
                        const data = await r.json();
                        // 確保將食譜也加入 flavorDB 以便搜尋和連結
                        flavorDB[data.name] = data; 
                        onlineRecipes.push(data);
                    }
                } catch(err){
                    console.error(`食譜 ${n} 載入失敗`, err);
                }
            });
            await Promise.all(tasks);
        }
    } catch (e) {}

    // 狀態更新
    if (Object.keys(flavorDB).length > 0) {
        if(emptyState) emptyState.innerHTML = '資料庫就緒，輸入關鍵字搜尋 (例如: A, 羊, 義...)';
        if(errorLog.length > 0 && emptyState) {
            emptyState.innerHTML += `<br><div style="color:red; font-size:14px; margin-top:10px;">部分檔案讀取失敗，請檢查 Console</div>`;
        }
    } else {
        if(emptyState) emptyState.innerHTML = '無法讀取資料庫';
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

// --- 演算法工具：Levenshtein Distance (模糊搜尋) ---
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
                    matrix[i][j - 1] + 1, // 插入
                    matrix[i - 1][j] + 1  // 刪除
                )
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

    // 隱藏結果區與空狀態
    const ir = document.getElementById('ingredientResult');
    const es = document.getElementById('emptyState');
    if(ir) ir.style.display = 'none';
    if(es) es.style.display = 'none';
    
    // 清空建議列表
    if(suggestionList) {
        suggestionList.innerHTML = '';
        suggestionList.style.display = 'none';
    }

    const lowerQ = query.toLowerCase();
    const matches = [];

    // 遍歷資料庫進行比對
    for (const [key, data] of Object.entries(flavorDB)) {
        const name = key;
        const enName = (data.enName || '').toLowerCase();
        const lowerName = name.toLowerCase();

        let score = 0;
        let isTypo = false;

        // 1. 精確比對
        if (lowerName === lowerQ || enName === lowerQ) score += 100;
        // 2. 開頭符合
        else if (lowerName.startsWith(lowerQ) || enName.startsWith(lowerQ)) score += 50;
        // 3. 內容包含
        else if (lowerName.includes(lowerQ) || enName.includes(lowerQ)) score += 30;
        // 4. 容錯搜尋
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
        
        // 只有當這是一次完整的搜尋確認（例如按Enter）才加入導航堆疊，
        // 即時搜尋(typing)不加入，避免上一頁按不完。
        if (forcedQuery === null) {
             // 這裡不特別推入堆疊，因為點擊結果時會推入 'ingredient' 頁面
             // 若需要保留搜尋列表狀態，可在此處理
        }
    }
}

let currentSingleData = null;

async function showIngredient(name, push = true) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-search').classList.add('active');
    
    // 隱藏其他列表與空狀態
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

        // 1. 填寫標題與筆記
        document.getElementById('ingredientTitle').innerHTML = name + (data.enName ? ` <small style="color:#888;">${data.enName}</small>` : '');
        const notes = document.getElementById('notesContainer');
        notes.innerHTML = '';
        for (const [k, label] of Object.entries(noteLabels)) {
            if (data.meta && data.meta[k]) {
                notes.innerHTML += `<div class="note-item"><span class="note-label">${label}</span>${data.meta[k]}</div>`;
            }
        }

        // 2. 處理食譜配比 (Composition)
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

        // 3. 填寫推薦搭配列表
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
            // 如果沒有搭配，但有食譜(composition)，header 也要顯示給食譜用，
            // 這裡僅針對 pairing list 的 header 控制
            if (!data.composition || data.composition.length === 0) {
                 header.style.display = 'none';
            }
        }

        // 4. 渲染關係圖
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
        console.log("Nav Stack:", navigationStack); // Debug
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

// --- [新功能] 食材庫渲染 ---
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
        div.onclick = () => {
            // [優化] 這裡不清除 Stack，直接進入新頁面，這樣按上一頁會回到 Library
            showIngredient(key);
        };
        container.appendChild(div);
    });
}

// --- 導航與其他函式 ---

function goBack() {
    if (navigationStack.length > 1) {
        navigationStack.pop(); // 移除當前頁
        const prev = navigationStack[navigationStack.length - 1]; // 取得前一頁
        
        console.log("Going back to:", prev); // Debug

        if (prev.page === 'home') {
            resetApp();
        } else if (prev.page === 'ingredient') {
            showIngredient(prev.data, false); // false 表示不再次 push stack
        } else if (prev.page === 'search_results') {
            document.getElementById('searchInput').value = prev.data;
            triggerSearch(prev.data);
        } else {
            // 切換到各個主頁籤 (cuisines, library, recipes...)
            switchPage(prev.page, false);
        }
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
    if(es) es.style.display = 'block'; 
    
    // 關閉側邊選單
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
        // [優化] 增加 cursor pointer 提示可點擊
        card.style.cursor = 'pointer'; 

        let ingStr = (recipe.ingredients || []).map(i => 
            `<span>${i.name}</span>: ${i.qty}`
        ).join(' | ');

        // 若 recipe.ingredients 為空，嘗試使用 composition (相容不同格式)
        if((!recipe.ingredients || recipe.ingredients.length === 0) && recipe.composition) {
             ingStr = recipe.composition.map(i => `<span>${i.name}</span>: ${i.qty}`).join(' | ');
        }

        card.innerHTML = `<div class="recipe-name">${recipe.name}</div><div style="font-size:14px;color:#555;">${ingStr}</div>`;
        
        // [優化] 綁定點擊事件，開啟該食譜/食材頁面
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
        div.onclick = () => { 
            // [優化] 移除 navigationStack 重置，保留歷史紀錄
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
    
    const target = document.getElementById(`page-${p}`);
    if(target) target.classList.add('active'); 
    
    if (push) navigationStack.push({page: p, data: null}); 
    
    if(p === 'bridge') setTimeout(updateBridge, 100);
    
    // 如果切換到食材庫，觸發渲染
    if(p === 'library') renderLibrary();
}

function handleEnter(e) { if(e.key === 'Enter') triggerSearch(); }