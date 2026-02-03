// --- 核心資料 ---
let flavorDB = {};     // 總資料庫
let cuisineList = [];  // 國家清單
let onlineRecipes = [];

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

    // [新增] 動態建立"搜尋建議列表"的容器與樣式，不需動 HTML/CSS
    const searchWrapper = searchPage.querySelector('.search-wrapper');
    const suggestionList = document.createElement('div');
    suggestionList.id = 'suggestionList';
    suggestionList.style.display = 'none';
    // 插入在搜尋框下方
    searchWrapper.parentNode.insertBefore(suggestionList, searchWrapper.nextSibling);

    // [新增] 注入建議列表的 CSS 樣式
    const style = document.createElement('style');
    style.innerHTML = `
        .suggestion-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 12px;
            margin-bottom: 30px;
        }
        .suggestion-item {
            background: #fff;
            border: 1px solid #e0e0e0;
            padding: 15px 10px;
            text-align: center;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        .suggestion-item:hover {
            border-color: var(--title-color);
            transform: translateY(-3px);
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }
        .suggestion-name { font-weight: 900; color: #333; font-size: 18px; }
        .suggestion-en { display: block; font-size: 13px; color: #888; margin-top: 5px; font-family: sans-serif; }
    `;
    document.head.appendChild(style);

    // 1. 載入食材
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

    // 4. 狀態更新
    if (Object.keys(flavorDB).length > 0) {
        emptyState.innerHTML = '資料庫就緒，輸入關鍵字搜尋 (例如: A, 羊, 義...)';
       if(errorLog.length > 0) {
    emptyState.innerHTML += `<br><div style="color:red; font-size:14px; margin-top:10px; background:#fff0f0; padding:10px; border-radius:5px;">
        <strong>以下檔案讀取失敗：</strong><br>
        ${errorLog.map(e => `❌ ${e}`).join('<br>')}
        <br><span style="font-size:12px; color:#666;">(請檢查 data/ingredients/ 資料夾中是否有這些檔案，且檔名完全一致)</span>
    </div>`;
}
    } else {
        emptyState.innerHTML = '無法讀取資料庫';
    }

    renderCuisines();
    renderOnlineRecipes();
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

// --- 核心功能改進 ---

function triggerSearch(forcedQuery = null) {
    // 支援從上一頁回來時，強制帶入之前的搜尋字
    const rawInput = document.getElementById('searchInput').value;
    const query = (forcedQuery !== null ? forcedQuery : rawInput).trim();
    
    if (!query) return;

    // 清空畫面
    document.getElementById('ingredientResult').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    const suggestionList = document.getElementById('suggestionList');
    suggestionList.innerHTML = '';
    suggestionList.className = 'suggestion-grid'; 

    const lowerQ = query.toLowerCase();
    const matches = [];

    // [關鍵邏輯] 搜尋所有"開頭"符合的項目 (中文或英文)
    for (const [key, data] of Object.entries(flavorDB)) {
        const nameMatch = key.toLowerCase().startsWith(lowerQ);
        // 防呆：確認 data.enName 存在才比對
        const enMatch = data.enName && data.enName.toLowerCase().startsWith(lowerQ);

        if (nameMatch || enMatch) {
            matches.push({ name: key, enName: data.enName || '' });
        }
    }

    if (matches.length === 0) {
        // 沒找到：顯示原本的查無資料畫面
        suggestionList.style.display = 'none';
        showIngredient(query, true); 
    } else {
        // 有找到：顯示建議列表
        suggestionList.style.display = 'grid';
        
        // 依照名稱長度排序 (短的在前面，通常是更精準的匹配)
        matches.sort((a, b) => a.name.length - b.name.length);

        matches.forEach(m => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            // 標示出關鍵字 (選用)
            div.innerHTML = `
                <div class="suggestion-name">${m.name}</div>
                ${m.enName ? `<div class="suggestion-en">${m.enName}</div>` : ''}
            `;
            div.onclick = () => showIngredient(m.name);
            suggestionList.appendChild(div);
        });

        // 如果是新搜尋 (非上一頁返回)，將搜尋結果狀態推入歷史堆疊
        if (forcedQuery === null) {
            navigationStack = [{ page: 'search_results', data: query }];
        }
    }
}

function showIngredient(name, push = true) {
    // 切換頁面顯示
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-search').classList.add('active');
    
    // 隱藏搜尋列表，顯示詳細資料
    document.getElementById('suggestionList').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    
    const resultDiv = document.getElementById('ingredientResult');
    resultDiv.style.display = 'block';
    
    document.getElementById('searchInput').value = name;
    const data = flavorDB[name];

    if (data) {
        document.getElementById('ingredientTitle').innerHTML = name + (data.enName ? ` <small style="color:#888;">${data.enName}</small>` : '');
        const notes = document.getElementById('notesContainer');
        notes.innerHTML = '';
        
        for (const [k, label] of Object.entries(noteLabels)) {
            if (data.meta && data.meta[k]) {
                notes.innerHTML += `<div class="note-item"><span class="note-label">${label}</span>${data.meta[k]}</div>`;
            }
        }

        const list = document.getElementById('pairingList');
        const header = document.getElementById('pairingHeader');
        list.innerHTML = '';
        
        if (data.pairings && data.pairings.length > 0) {
            header.style.display = 'block';
            data.pairings.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.name;
                li.className = `weight-${item.weight}`;
                li.onclick = () => showIngredient(item.name);
                list.appendChild(li);
            });
        } else {
            header.style.display = 'none';
        }
    } else {
        document.getElementById('ingredientTitle').innerText = name;
        document.getElementById('notesContainer').innerHTML = '<div style="color:#999; padding:20px 0;"><i>資料庫中尚未建立此項目。</i></div>';
        document.getElementById('pairingHeader').style.display = 'none';
        document.getElementById('pairingList').innerHTML = '';
    }

    if (push) navigationStack.push({ page: 'ingredient', data: name });
}

function goBack() {
    if (navigationStack.length > 1) {
        navigationStack.pop(); 
        const prev = navigationStack[navigationStack.length - 1]; 
        
        if (prev.page === 'home') {
            resetApp();
        } 
        else if (prev.page === 'ingredient') {
            showIngredient(prev.data, false);
        }
        else if (prev.page === 'search_results') {
            // [關鍵] 如果上一頁是搜尋結果，重新觸發搜尋來顯示列表
            document.getElementById('searchInput').value = prev.data;
            triggerSearch(prev.data);
        }
        else {
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
    document.getElementById('suggestionList').style.display = 'none'; // 隱藏建議列表
    document.getElementById('emptyState').style.display = 'block'; 
    
    document.getElementById('sidebar').classList.remove('active');
    document.querySelector('.sidebar-overlay').classList.remove('active');
}

// 渲染食譜與國家功能保持不變
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
            // 點擊國家分類，視為一種特殊的搜尋
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