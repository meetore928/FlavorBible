// --- 核心資料 ---
let flavorDB = {};
let onlineRecipes = [];

// 國家/菜系資料庫 (靜態)
const cuisineDB = [
    { name: "義大利料理", keyIngredients: ["番茄", "羅勒", "大蒜", "橄欖油"] },
    { name: "法國料理", keyIngredients: ["奶油", "紅蔥頭", "百里香", "紅酒"] },
    { name: "泰國料理", keyIngredients: ["檸檬草", "魚露", "椰奶", "青檸"] },
    { name: "日本料理", keyIngredients: ["醬油", "味醂", "柴魚片", "味噌"] },
    { name: "台灣料理", keyIngredients: ["醬油", "米酒", "麻油", "九層塔 (羅勒)"] }
];

// 筆記標籤
const noteLabels = { 
    season: "季節", taste: "味道", tips: "小秘訣", 
    affinities: "對味組合", notes: "筆記", 
    function: "功能質性", volume: "分量感", intensity: "風味強度", techniques: "調理方式", avoid: "避免"
};

// 導航堆疊
let navigationStack = [{ page: 'home', data: null }];

// --- 初始化 (GitHub 自動載入 - 增強除錯版) ---
document.addEventListener('DOMContentLoaded', async () => {
    const emptyState = document.getElementById('emptyState');
    let errorLog = []; // 用來收集錯誤訊息

    // 1. 載入食材
    try {
        const listRes = await fetch('data/list.json');
        if (!listRes.ok) throw new Error(`找不到 data/list.json (狀態碼: ${listRes.status})`);
        
        const ingList = await listRes.json();
        
        // 使用 Promise.allSettled：即使一個檔案失敗，其他檔案也會繼續載入
        const tasks = ingList.map(async (name) => {
            try {
                // 注意：GitHub 嚴格區分大小寫，檔案名必須與 list.json 完全一致
                const res = await fetch(`data/ingredients/${name}.json`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                flavorDB[name] = data;
            } catch (err) {
                console.warn(`讀取失敗: ${name}`, err);
                errorLog.push(`❌ 找不到食材檔: ingredients/${name}.json`);
            }
        });
        await Promise.all(tasks);

    } catch (e) {
        errorLog.push(`❌ 嚴重錯誤: 無法讀取食材清單 list.json (${e.message})`);
    }

    // 2. 載入食譜 (非必要，失敗不影響主程式)
    try {
        const recListRes = await fetch('data/recipes_list.json');
        if (recListRes.ok) {
            const recList = await recListRes.json();
            const recTasks = recList.map(async (name) => {
                try {
                    const res = await fetch(`data/recipes/${name}.json`);
                    if (res.ok) onlineRecipes.push(await res.json());
                } catch (err) { console.warn("食譜讀取失敗", name); }
            });
            await Promise.all(recTasks);
        }
    } catch (e) { console.log("無食譜清單，跳過"); }

    // 3. 更新畫面與回報狀態
    if (Object.keys(flavorDB).length > 0) {
        emptyState.innerHTML = '資料庫同步完成，請輸入食材。';
        // 如果有部分檔案遺失，顯示黃色警告
        if (errorLog.length > 0) {
            emptyState.innerHTML += `<br><br><div style="color:#d9534f; text-align:left; font-size:14px; background:#fff0f0; padding:10px; border-radius:5px;">
                <strong>部分檔案讀取失敗：</strong><br>${errorLog.join('<br>')}
                <br><small>(請檢查 GitHub 上的檔名大小寫是否與 list.json 完全一致)</small>
            </div>`;
        }
    } else {
        // 如果完全沒有資料，顯示紅色錯誤
        emptyState.innerHTML = `<div style="color:red; font-weight:bold;">無法讀取任何資料</div>
        <div style="text-align:left; margin-top:10px; font-size:14px;">
            可能原因：<br>
            1. data 資料夾未上傳成功<br>
            2. list.json 格式錯誤 (檢查是否有多餘逗號)<br>
            3. 檔名大小寫不符<br><br>
            <strong>詳細錯誤：</strong><br>${errorLog.join('<br>')}
        </div>`;
    }

    renderCuisines();
    renderOnlineRecipes();
});

// --- 核心功能函數 ---

function triggerSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    // 搜尋時清空歷史堆疊
    navigationStack = [{ page: 'home', data: null }];

    if (flavorDB[query]) {
        showIngredient(query, true);
    } else {
        // 嘗試英文搜尋
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
        for (const [k, label] of Object.entries(noteLabels)) {
            if (data.meta && data.meta[k]) {
                notes.innerHTML += `<div class="note-item"><span class="note-label">${label}</span>${data.meta[k]}</div>`;
            }
        }
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

function renderCuisines() { 
    const grid = document.getElementById('cuisineGrid'); 
    grid.innerHTML = ''; 
    cuisineDB.forEach(c => { 
        const div = document.createElement('div'); 
        div.className = 'cuisine-card'; 
        div.innerText = c.name; 
        div.onclick = () => { 
            navigationStack = [{ page: 'home', data: null }];
            showIngredient(c.name, true); 
        }; 
        grid.appendChild(div); 
    }); 
}