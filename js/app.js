// --- 核心資料 ---
let flavorDB = {};     // 總資料庫 (包含食材與國家)
let cuisineList = [];  // 專門存放國家的清單 (用於顯示在"世界風味"頁面)
let onlineRecipes = [];

// 筆記標籤對照
const noteLabels = { 
    season: "季節", taste: "味道", tips: "小秘訣", 
    affinities: "對味組合", notes: "筆記", 
    function: "功能質性", volume: "分量感", intensity: "風味強度", techniques: "調理方式", avoid: "避免"
};

// 導航堆疊
let navigationStack = [{ page: 'home', data: null }];

// --- 初始化 (GitHub 自動載入) ---
document.addEventListener('DOMContentLoaded', async () => {
    const emptyState = document.getElementById('emptyState');
    let errorLog = []; 

    // 1. 載入一般食材清單 (list.json)
    try {
        const listRes = await fetch('data/list.json');
        if (!listRes.ok) throw new Error(`找不到 data/list.json`);
        const ingList = await listRes.json();
        
        await loadBatchIngredients(ingList, errorLog);
    } catch (e) {
        errorLog.push(`❌ 無法讀取 list.json: ${e.message}`);
    }

    // 2. 載入國家/菜系清單 (cuisines_list.json) - 新增功能
    try {
        const cuisineRes = await fetch('data/cuisines_list.json');
        if (cuisineRes.ok) {
            const cListNames = await cuisineRes.json();
            // 載入這些國家的 JSON 檔
            await loadBatchIngredients(cListNames, errorLog);
            
            // 將載入完成的國家資料存入 cuisineList 供渲染使用
            cuisineList = cListNames.filter(name => flavorDB[name]).map(name => flavorDB[name]);
        }
    } catch (e) {
        console.warn("沒有發現獨立的 cuisines_list.json，跳過國家載入", e);
    }

    // 3. 載入食譜 (非必要)
    try {
        const recListRes = await fetch('data/recipes_list.json');
        if (recListRes.ok) {
            const recList = await recListRes.json();
            const recTasks = recList.map(async (name) => {
                try {
                    const res = await fetch(`data/recipes/${name}.json`);
                    if (res.ok) onlineRecipes.push(await res.json());
                } catch (err) { }
            });
            await Promise.all(recTasks);
        }
    } catch (e) { console.log("無食譜清單"); }

    // 4. 更新畫面狀態
    if (Object.keys(flavorDB).length > 0) {
        emptyState.innerHTML = '資料庫同步完成，請輸入食材。';
        if (errorLog.length > 0) {
            emptyState.innerHTML += `<br><br><div style="color:#d9534f;text-align:left;background:#fff0f0;padding:10px;">部分檔案讀取失敗：<br>${errorLog.join('<br>')}</div>`;
        }
    } else {
        emptyState.innerHTML = `<div style="color:red;font-weight:bold;">無法讀取資料</div>`;
    }

    renderCuisines();      // 渲染國家頁面
    renderOnlineRecipes(); // 渲染食譜頁面
});

// 通用載入函數：傳入名稱陣列，將檔案載入 flavorDB
async function loadBatchIngredients(names, errorLog) {
    const tasks = names.map(async (name) => {
        // 如果已經載入過，就不重複載入 (避免 list.json 和 cuisines_list.json 重複)
        if (flavorDB[name]) return;

        try {
            const res = await fetch(`data/ingredients/${name}.json`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            flavorDB[name] = data; // 存入總資料庫
        } catch (err) {
            console.warn(`讀取失敗: ${name}`, err);
            errorLog.push(`❌ 找不到: ingredients/${name}.json`);
        }
    });
    await Promise.all(tasks);
}


// --- 核心功能函數 ---

function triggerSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;
    navigationStack = [{ page: 'home', data: null }];
    
    // 優先搜尋精確匹配
    if (flavorDB[query]) {
        showIngredient(query, true);
    } else {
        // 英文搜尋
        let found = false;
        for (const [key, val] of Object.entries(flavorDB)) {
            if (val.enName && val.enName.toLowerCase() === query.toLowerCase()) {
                showIngredient(key, true);
                found = true;
                break;
            }
        }
        if (!found) showIngredient(query, true); 
    }
}

function showIngredient(name, push = true) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-search').classList.add('active');
    
    const data = flavorDB[name];
    const resultDiv = document.getElementById('ingredientResult');
    const emptyDiv = document.getElementById('emptyState');
    
    document.getElementById('searchInput').value = name;
    emptyDiv.style.display = 'none';
    resultDiv.style.display = 'block';

    if (data) {
        document.getElementById('ingredientTitle').innerHTML = name + (data.enName ? ` <small style="color:#888;">${data.enName}</small>` : '');
        const notes = document.getElementById('notesContainer');
        notes.innerHTML = '';
        
        // 顯示 Meta 資訊
        for (const [k, label] of Object.entries(noteLabels)) {
            if (data.meta && data.meta[k]) {
                notes.innerHTML += `<div class="note-item"><span class="note-label">${label}</span>${data.meta[k]}</div>`;
            }
        }

        // 顯示搭配列表
        document.getElementById('pairingHeader').style.display = 'block';
        const list = document.getElementById('pairingList');
        list.innerHTML = '';
        if (data.pairings) {
            data.pairings.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.name;
                li.className = `weight-${item.weight}`;
                li.onclick = () => showIngredient(item.name);
                list.appendChild(li);
            });
        }
    } else {
        // 查無資料
        document.getElementById('ingredientTitle').innerText = name;
        document.getElementById('notesContainer').innerHTML = '<div style="color:#999; padding:20px 0;"><i>資料庫尚未建立此項目。</i></div>';
        document.getElementById('pairingHeader').style.display = 'none';
        document.getElementById('pairingList').innerHTML = '';
    }

    if (push) navigationStack.push({ page: 'ingredient', data: name });
}

function goBack() {
    if (navigationStack.length > 1) {
        navigationStack.pop(); 
        const prev = navigationStack[navigationStack.length - 1]; 
        if (prev.page === 'home') resetApp();
        else if (prev.page === 'ingredient') showIngredient(prev.data, false);
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
        let ingStr = '';
        if (recipe.ingredients) {
            ingStr = recipe.ingredients.map(i => 
                `<span style="cursor:pointer;text-decoration:underline;" onclick="showIngredient('${i.name}')">${i.name}</span>: ${i.qty}`
            ).join('<br>');
        }
        card.innerHTML = `<div class="recipe-name">${recipe.name}</div><div style="font-size:14px;color:#555;">${ingStr}</div>`;
        container.appendChild(card);
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

// --- 渲染國家/菜系 (新版) ---
function renderCuisines() { 
    const grid = document.getElementById('cuisineGrid'); 
    grid.innerHTML = ''; 

    if (cuisineList.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:#999;">尚未設定國家清單 (data/cuisines_list.json)</div>';
        return;
    }

    cuisineList.forEach(c => { 
        const div = document.createElement('div'); 
        div.className = 'cuisine-card'; 
        
        // 嘗試從 pairings 裡抓出前 4 個權重高的食材當作簡介
        let topIngredients = '';
        if (c.pairings && c.pairings.length > 0) {
            // 排序：權重高的在前 -> 取前4個 -> 轉成字串
            const picks = c.pairings
                .sort((a,b) => b.weight - a.weight)
                .slice(0, 4)
                .map(p => p.name)
                .join('、');
            topIngredients = `<div style="font-size:12px; font-weight:normal; color:#666; margin-top:5px;">${picks}...</div>`;
        }

        div.innerHTML = `<div>${c.name}</div>${topIngredients}`;
        
        // 點擊後直接跳轉到該國家的詳細頁面 (像食材一樣顯示)
        div.onclick = () => { 
            navigationStack = [{ page: 'home', data: null }];
            showIngredient(c.name, true); 
        }; 
        grid.appendChild(div); 
    }); 
}