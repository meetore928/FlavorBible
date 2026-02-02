// --- 核心資料 ---
let flavorDB = {};
let onlineRecipes = [];

// 國家/菜系資料庫
const cuisineDB = [
    { name: "義大利料理", keyIngredients: ["番茄", "羅勒", "大蒜", "橄欖油"] },
    { name: "法國料理", keyIngredients: ["奶油", "紅蔥頭", "百里香", "紅酒"] },
    { name: "泰國料理", keyIngredients: ["檸檬草", "魚露", "椰奶", "青檸"] },
    { name: "日本料理", keyIngredients: ["醬油", "味醂", "柴魚片", "味噌"] },
    { name: "台灣料理", keyIngredients: ["醬油", "米酒", "麻油", "九層塔 (羅勒)"] }
];

// 筆記標籤對照表
const noteLabels = { 
    season: "季節", taste: "味道", tips: "小秘訣", 
    affinities: "對味組合", notes: "筆記", 
    function: "功能質性", volume: "分量感", intensity: "風味強度", techniques: "調理方式", avoid: "避免"
};

// 導航堆疊
let navigationStack = [{ page: 'search', data: null }];

// --- 初始化 (GitHub 自動載入邏輯) ---
document.addEventListener('DOMContentLoaded', async () => {
    const emptyState = document.getElementById('emptyState');
    
    try {
        // 1. 載入食材清單 (list.json)
        const ingListRes = await fetch('data/list.json');
        const ingList = await ingListRes.json();
        
        // 2. 逐一載入食材詳細檔
        for (const name of ingList) {
            const dataRes = await fetch(`data/ingredients/${name}.json`);
            flavorDB[name] = await dataRes.json();
        }

        // 3. 載入食譜清單與檔案
        try {
            const recListRes = await fetch('data/recipes_list.json');
            const recList = await recListRes.json();
            for (const name of recList) {
                const dataRes = await fetch(`data/recipes/${name}.json`);
                onlineRecipes.push(await dataRes.json());
            }
        } catch (err) {
            console.log("尚未建立食譜資料或路徑錯誤", err);
        }

        // 更新 UI
        emptyState.innerHTML = 'GitHub 資料庫同步完成，請輸入食材。';
        renderCuisines();
        renderOnlineRecipes();

    } catch (e) {
        console.error(e);
        emptyState.innerHTML = '偵測到離線或路徑錯誤，請確認 GitHub data 結構。<br>(需使用 Live Server 或 GitHub Pages)';
    }
});

// --- 功能函數 ---

function triggerSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (flavorDB[query]) {
        showIngredient(query);
    } else {
        // 嘗試英文搜尋
        for (const [key, val] of Object.entries(flavorDB)) {
            if (val.enName && val.enName.toLowerCase() === query.toLowerCase()) {
                showIngredient(key);
                return;
            }
        }
        // 若都找不到，顯示未建立頁面
        showIngredient(query); 
    }
}

function showIngredient(name, push = true) {
    // UI 切換
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-search').classList.add('active');
    
    const data = flavorDB[name];
    const resultDiv = document.getElementById('ingredientResult');
    const emptyDiv = document.getElementById('emptyState');
    
    document.getElementById('searchInput').value = name;
    emptyDiv.style.display = 'none';
    resultDiv.style.display = 'block';

    if (data) {
        // 資料已建立
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
        
        // 確保 pairings 存在再跑迴圈
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
        // 資料未建立
        document.getElementById('ingredientTitle').innerText = name;
        document.getElementById('notesContainer').innerHTML = '<div style="color:#999; padding:20px 0;"><i>資料庫尚未建立此項目。<br>請確認 GitHub data/ingredients/ 中是否有此檔案。</i></div>';
        document.getElementById('pairingHeader').style.display = 'none';
        document.getElementById('pairingList').innerHTML = '';
    }

    if (push) navigationStack.push({ page: 'ingredient', data: name });
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

// --- 基礎導航與 UI ---

function toggleMenu() { 
    document.getElementById('sidebar').classList.toggle('active'); 
    document.querySelector('.sidebar-overlay').classList.toggle('active'); 
}

function switchPage(p) { 
    toggleMenu(); 
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active')); 
    document.getElementById(`page-${p}`).classList.add('active'); 
    navigationStack.push({page:p, data:null}); 
}

function resetApp() { 
    location.reload(); 
}

function handleEnter(e) { 
    if(e.key === 'Enter') triggerSearch(); 
}

function goBack() { 
    if(navigationStack.length > 1) { 
        navigationStack.pop(); 
        const p = navigationStack[navigationStack.length-1]; 
        if(p.page === 'ingredient') showIngredient(p.data, false); 
        else switchPage(p.page); 
        navigationStack.pop(); // 避免重複 push
    } 
}

function renderCuisines() { 
    const grid = document.getElementById('cuisineGrid'); 
    grid.innerHTML = ''; // 清空避免重複渲染
    cuisineDB.forEach(c => { 
        const div = document.createElement('div'); 
        div.className = 'cuisine-card'; 
        div.innerText = c.name; 
        div.onclick = () => { 
            // 這裡簡單處理：直接搜尋該菜系名稱，或顯示該菜系食材列表
            // 您可以根據需求修改為顯示該菜系的詳細食材清單
            showIngredient(c.name); 
        }; 
        grid.appendChild(div); 
    }); 
}