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

// --- 導航堆疊 (History Stack) ---
// 預設基底是 'home'
let navigationStack = [{ page: 'home', data: null }];

// --- 初始化 (GitHub 自動載入) ---
document.addEventListener('DOMContentLoaded', async () => {
    const emptyState = document.getElementById('emptyState');
    
    try {
        // 1. 載入食材清單
        const ingListRes = await fetch('data/list.json');
        const ingList = await ingListRes.json();
        
        // 2. 載入食材檔案
        for (const name of ingList) {
            const dataRes = await fetch(`data/ingredients/${name}.json`);
            flavorDB[name] = await dataRes.json();
        }

        // 3. 載入食譜
        try {
            const recListRes = await fetch('data/recipes_list.json');
            const recList = await recListRes.json();
            for (const name of recList) {
                const dataRes = await fetch(`data/recipes/${name}.json`);
                onlineRecipes.push(await dataRes.json());
            }
        } catch (err) { console.log("無食譜資料"); }

        // UI 更新
        emptyState.innerHTML = 'GitHub 資料庫同步完成，請輸入食材。';
        renderCuisines();
        renderOnlineRecipes();

    } catch (e) {
        console.error(e);
        // 這就是您看到的錯誤訊息，上傳到 GitHub 後會自動消失
        emptyState.innerHTML = '偵測到離線或路徑錯誤。<br>若在本地開啟請忽略，上傳 GitHub 後即可正常運作。';
    }
});

// --- 核心功能函數 ---

// 1. 搜尋觸發 (邏輯修改：搜尋視為新的開始)
function triggerSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    // ★ 關鍵修改：搜尋時，清空歷史紀錄，只保留首頁
    navigationStack = [{ page: 'home', data: null }];

    if (flavorDB[query]) {
        showIngredient(query, true); // true = 加入堆疊
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

// 2. 顯示食材 (點擊觸發)
function showIngredient(name, push = true) {
    // 切換 UI
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-search').classList.add('active');
    
    const data = flavorDB[name];
    const resultDiv = document.getElementById('ingredientResult');
    const emptyDiv = document.getElementById('emptyState');
    
    document.getElementById('searchInput').value = name;
    emptyDiv.style.display = 'none';
    resultDiv.style.display = 'block';

    if (data) {
        // 有資料
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
                // ★ 關鍵：點擊推薦時，push = true (預設)，這樣會疊加歷史紀錄
                li.onclick = () => showIngredient(item.name);
                list.appendChild(li);
            });
        }
    } else {
        // 無資料
        document.getElementById('ingredientTitle').innerText = name;
        document.getElementById('notesContainer').innerHTML = '<div style="color:#999; padding:20px 0;"><i>資料庫尚未建立此項目。</i></div>';
        document.getElementById('pairingHeader').style.display = 'none';
        document.getElementById('pairingList').innerHTML = '';
    }

    // 加入歷史紀錄
    if (push) {
        navigationStack.push({ page: 'ingredient', data: name });
    }
}

// 3. 上一頁邏輯 (修正版)
function goBack() {
    // 如果堆疊裡有超過 1 頁 (例如：Home -> Apple)
    if (navigationStack.length > 1) {
        // 1. 移除當前頁 (Apple)
        navigationStack.pop(); 
        
        // 2. 偷看上一頁是什麼
        const prev = navigationStack[navigationStack.length - 1]; 

        // 3. 如果上一頁是 Home，代表要「完全清空」
        if (prev.page === 'home') {
            resetApp();
        } else if (prev.page === 'ingredient') {
            // 如果上一頁是食材，就顯示它 (push=false 代表不要再重複加入歷史)
            showIngredient(prev.data, false);
        } else {
            // 其他頁面 (食譜、國家)
            switchPage(prev.page, false); // false = 不 push
        }
    } else {
        // 如果已經到底了，就重置
        resetApp();
    }
}

// 4. 重置 App (回到乾淨首頁)
function resetApp() {
    // 重置堆疊
    navigationStack = [{ page: 'home', data: null }];
    
    // UI 重置
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById('page-search').classList.add('active');
    
    document.getElementById('searchInput').value = ''; // 清空搜尋框
    document.getElementById('ingredientResult').style.display = 'none'; // 隱藏結果
    document.getElementById('emptyState').style.display = 'block'; // 顯示提示文字
    
    // 關閉側邊欄
    document.getElementById('sidebar').classList.remove('active');
    document.querySelector('.sidebar-overlay').classList.remove('active');
}

// --- 其他 UI 函數 ---

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
    // 關閉選單
    document.getElementById('sidebar').classList.remove('active');
    document.querySelector('.sidebar-overlay').classList.remove('active');

    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active')); 
    document.getElementById(`page-${p}`).classList.add('active'); 
    
    if (push) {
        navigationStack.push({page: p, data: null}); 
    }
}

function handleEnter(e) { 
    if(e.key === 'Enter') triggerSearch(); 
}

function renderCuisines() { 
    const grid = document.getElementById('cuisineGrid'); 
    grid.innerHTML = ''; 
    cuisineDB.forEach(c => { 
        const div = document.createElement('div'); 
        div.className = 'cuisine-card'; 
        div.innerText = c.name; 
        div.onclick = () => { 
            // 點國家 -> 視為搜尋該國家 (堆疊重置)
            navigationStack = [{ page: 'home', data: null }];
            showIngredient(c.name, true); 
        }; 
        grid.appendChild(div); 
    }); 
}