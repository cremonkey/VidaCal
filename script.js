/**
 * AI Nutrition Tracker - Main Logic
 */

// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------
// IMPORTANT: Replace this with your actual OpenAI API Key
const OPENAI_API_KEY = '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';

// -----------------------------------------------------------------------------
// STATE MANAGEMENT
// -----------------------------------------------------------------------------
const state = {
    user: null,
    meals: [],
    todayCalories: 0
};

// -----------------------------------------------------------------------------
// DOM ELEMENTS
// -----------------------------------------------------------------------------
const onboardingSection = document.getElementById('onboarding-section');
const dashboardSection = document.getElementById('dashboard-section');
const onboardingForm = document.getElementById('onboarding-form');

// Dashboard Elements
const displayName = document.getElementById('display-name');
const caloriesConsumedEl = document.getElementById('calories-consumed');
const caloriesGoalEl = document.getElementById('calories-goal');
const calorieProgress = document.getElementById('calorie-progress');
const mealList = document.getElementById('meal-list');
const emptyState = document.getElementById('empty-state');
const resetBtn = document.getElementById('reset-btn');

// Camera/Upload Elements
const scanMealBtn = document.getElementById('scan-meal-btn');
const mealImageInput = document.getElementById('meal-image-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const cancelImageBtn = document.getElementById('cancel-image-btn');
const loadingIndicator = document.getElementById('loading-indicator');

// Scanner UI Elements
const scannerSection = document.getElementById('scanner-section');
const scannerShutterBtn = document.getElementById('scanner-shutter-btn');
const scannerGalleryBtn = document.getElementById('scanner-gallery-btn');
const closeScannerBtn = document.getElementById('close-scanner-btn');

// -----------------------------------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------------------------------
function init() {
    loadData();
    if (state.user) {
        showDashboard();
    } else {
        showOnboarding();
    }
}

// -----------------------------------------------------------------------------
// DATA PERSISTENCE
// -----------------------------------------------------------------------------
function loadData() {
    const storedUser = localStorage.getItem('nutriai_user');
    const storedMeals = localStorage.getItem('nutriai_meals');
    const storedDate = localStorage.getItem('nutriai_date');

    if (storedUser) {
        state.user = JSON.parse(storedUser);
    }

    // Reset meals if it's a new day
    const today = new Date().toDateString();
    if (storedDate === today) {
        if (storedMeals) {
            state.meals = JSON.parse(storedMeals);
        }
    } else {
        // New day, clear meals but keep user
        state.meals = [];
        localStorage.setItem('nutriai_date', today);
        saveMeals();
    }

    calculateTotalCalories();
}

function saveUser(user) {
    localStorage.setItem('nutriai_user', JSON.stringify(user));
    state.user = user;
}

function saveMeals() {
    localStorage.setItem('nutriai_meals', JSON.stringify(state.meals));
    localStorage.setItem('nutriai_date', new Date().toDateString());
}

// -----------------------------------------------------------------------------
// BMR CALCULATOR (Mifflin-St Jeor)
// -----------------------------------------------------------------------------
function calculateBMR(weight, height, age, gender) {
    // Men: (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) + 5
    // Women: (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) - 161
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    if (gender === 'male') {
        bmr += 5;
    } else {
        bmr -= 161;
    }
    // Sedentary multiplier (default for tracker baseline)
    return Math.round(bmr * 1.2);
}

// -----------------------------------------------------------------------------
// EVENT LISTENERS
// -----------------------------------------------------------------------------

// Onboarding Form Submit
if (onboardingForm) {
    onboardingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('user-name').value;
        const age = parseInt(document.getElementById('user-age').value);
        const weight = parseFloat(document.getElementById('user-weight').value);
        const height = parseFloat(document.getElementById('user-height').value);
        const gender = document.getElementById('user-gender').value;
        const disease = document.getElementById('user-disease').value;

        // Show loading state on button
        const submitBtn = onboardingForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Calculating with AI...';
        submitBtn.disabled = true;

        try {
            // Use AI to calculate personalized calorie goal
            const aiResult = await calculateCaloriesWithAI(weight, height, age, gender, disease);

            const userProfile = {
                name,
                age,
                weight,
                height,
                gender,
                disease,
                calorieGoal: aiResult.calorieGoal,
                aiRecommendation: aiResult.recommendation,
                aiRecommendationAR: aiResult.recommendationAR
            };

            saveUser(userProfile);
            showDashboard();
        } catch (error) {
            console.error('AI Calculation failed, using fallback:', error);
            // Fallback to BMR calculation
            const calorieGoal = calculateBMR(weight, height, age, gender);

            const userProfile = {
                name,
                age,
                weight,
                height,
                gender,
                disease,
                calorieGoal,
                aiRecommendation: null,
                aiRecommendationAR: null
            };

            saveUser(userProfile);
            showDashboard();
        } finally {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    });
}

// Reset Data (Debug/Dev)
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all data? (Profile & Meals)')) {
            localStorage.clear();
            location.reload();
        }
    });
}

// Camera/Upload Triggers - Scan Meal button opens the Scanner
if (scanMealBtn) {
    scanMealBtn.addEventListener('click', () => {
        if (scannerSection) {
            showScanner();
        } else {
            // Fallback if scanner section doesn't exist
            mealImageInput.click();
        }
    });
}

// File input change handler
if (mealImageInput) {
    mealImageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Show Preview
        const reader = new FileReader();
        reader.onload = (e) => {
            if (imagePreview) imagePreview.src = e.target.result;
            if (imagePreviewContainer) imagePreviewContainer.classList.remove('hidden');
            if (scanMealBtn) scanMealBtn.classList.add('hidden');
        };
        reader.readAsDataURL(file);

        // AI Analysis Trigger
        await handleImageAnalysis(file);
    });
}

if (cancelImageBtn) {
    cancelImageBtn.addEventListener('click', () => {
        resetScanState();
    });
}

// Scanner UI Event Listeners
if (closeScannerBtn) {
    closeScannerBtn.addEventListener('click', () => {
        showDashboard();
    });
}

if (scannerShutterBtn) {
    scannerShutterBtn.addEventListener('click', () => {
        if (mealImageInput) mealImageInput.click();
    });
}

if (scannerGalleryBtn) {
    scannerGalleryBtn.addEventListener('click', () => {
        if (mealImageInput) mealImageInput.click();
    });
}

// -----------------------------------------------------------------------------
// UI LOGIC
// -----------------------------------------------------------------------------
const analysisSection = document.getElementById('analysis-section');
const analysisImage = document.getElementById('analysis-image');
const analysisTime = document.getElementById('analysis-time');
const analysisCalories = document.getElementById('analysis-calories');
const analysisProtein = document.getElementById('analysis-protein');
const analysisCarbs = document.getElementById('analysis-carbs');
const analysisFats = document.getElementById('analysis-fats');
const barProtein = document.getElementById('bar-protein');
const barCarbs = document.getElementById('bar-carbs');
const barFats = document.getElementById('bar-fats');
const analysisFoodName = document.getElementById('analysis-food-name');
const analysisWarningCard = document.getElementById('analysis-warning-card');
const analysisWarningText = document.getElementById('analysis-warning-text');
const analysisAdviceText = document.getElementById('analysis-advice-text');
const backToDashBtn = document.getElementById('back-to-dash-btn');
const confirmLogBtn = document.getElementById('confirm-log-btn');

let currentAnalysisData = null; // Temp store for review

// -----------------------------------------------------------------------------
// UI LOGIC
// -----------------------------------------------------------------------------
function showOnboarding() {
    onboardingSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
    analysisSection.classList.add('hidden');
    scannerSection.classList.add('hidden');
}

function showDashboard() {
    onboardingSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    analysisSection.classList.add('hidden');
    scannerSection.classList.add('hidden');

    // Update Header Info
    displayName.textContent = state.user.name;
    caloriesGoalEl.textContent = state.user.calorieGoal;

    // Display AI Recommendation if available
    const aiCard = document.getElementById('ai-recommendation-card');
    const aiRecEN = document.getElementById('ai-recommendation-en');
    const aiRecAR = document.getElementById('ai-recommendation-ar');

    if (state.user.aiRecommendation && aiCard) {
        aiCard.classList.remove('hidden');
        if (aiRecEN) aiRecEN.textContent = state.user.aiRecommendation;
        if (aiRecAR) aiRecAR.textContent = state.user.aiRecommendationAR || '';
    } else if (aiCard) {
        aiCard.classList.add('hidden');
    }

    renderMeals();
    updateProgress();
}

function showScanner() {
    dashboardSection.classList.add('hidden');
    analysisSection.classList.add('hidden');
    scannerSection.classList.remove('hidden');
}

function showAnalysisResult(data, imageSrc) {
    dashboardSection.classList.add('hidden');
    scannerSection.classList.add('hidden'); // Ensure scanner is hidden
    analysisSection.classList.remove('hidden');
    window.scrollTo(0, 0);

    // Populate Data
    analysisImage.src = imageSrc;
    analysisTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    analysisCalories.textContent = data.calories;
    analysisFoodName.textContent = data.foodName;

    // Macros
    analysisProtein.textContent = data.macros.p;
    analysisCarbs.textContent = data.macros.c;
    analysisFats.textContent = data.macros.f;

    // Bars Animation (Simple percentage based on assumption: P=150g max, C=300g max, F=100g max for visual)
    setTimeout(() => {
        barProtein.style.width = `${Math.min((data.macros.p / 50) * 100, 100)}%`; // Arbitrary scale for visual
        barCarbs.style.width = `${Math.min((data.macros.c / 100) * 100, 100)}%`;
        barFats.style.width = `${Math.min((data.macros.f / 40) * 100, 100)}%`;
    }, 100);

    // Warning
    if (data.warning) {
        analysisWarningCard.classList.remove('hidden');
        analysisWarningText.textContent = data.warning;
    } else {
        analysisWarningCard.classList.add('hidden');
    }

    // Render Enhanced Nutrition Insights (Bilingual)
    const tipsEnContainer = document.getElementById('tips-en');
    const tipsArContainer = document.getElementById('tips-ar');
    const solutionsContainer = document.getElementById('solutions-list');

    // English Tips
    if (tipsEnContainer && data.tipsEN && Array.isArray(data.tipsEN)) {
        tipsEnContainer.innerHTML = data.tipsEN.map((tip, index) => `
            <div class="flex items-start gap-2 p-2 bg-blue-900/20 rounded-lg">
                <i class="fa-solid fa-check-circle text-blue-400 mt-0.5 text-xs"></i>
                <span>${tip}</span>
            </div>
        `).join('');
    }

    // Arabic Tips
    if (tipsArContainer && data.tipsAR && Array.isArray(data.tipsAR)) {
        tipsArContainer.innerHTML = data.tipsAR.map((tip, index) => `
            <div class="flex items-start gap-2 p-2 bg-purple-900/20 rounded-lg">
                <i class="fa-solid fa-check-circle text-purple-400 mt-0.5 text-xs"></i>
                <span>${tip}</span>
            </div>
        `).join('');
    }

    // Solutions (Bilingual)
    if (solutionsContainer && data.solutions && Array.isArray(data.solutions)) {
        solutionsContainer.innerHTML = data.solutions.map((sol, index) => `
            <div class="bg-yellow-900/20 border border-yellow-800/30 p-3 rounded-xl">
                <div class="flex items-center gap-2 text-yellow-200 text-sm mb-1">
                    <i class="fa-solid fa-lightbulb text-yellow-400 text-xs"></i>
                    <span>${sol.en}</span>
                </div>
                <div dir="rtl" class="text-right text-yellow-300/80 text-xs">
                    ${sol.ar}
                </div>
            </div>
        `).join('');
    }

    currentAnalysisData = data;
}

function renderMeals() {
    mealList.innerHTML = '';

    if (state.meals.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    // Sort latest first
    [...state.meals].reverse().forEach(meal => {
        const mealEl = document.createElement('div');
        mealEl.className = 'bg-surface p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between animate-fade-in';

        let warningBadge = '';
        if (meal.warning) {
            warningBadge = `<div class="mt-2 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-100"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${meal.warning}</div>`;
        }

        mealEl.innerHTML = `
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <h4 class="font-bold text-gray-800 capitalize">${meal.foodName}</h4>
                </div>
                <div class="text-xs text-gray-400 mt-1 flex gap-2">
                    <span>P: ${meal.macros.p}g</span>
                    <span>C: ${meal.macros.c}g</span>
                    <span>F: ${meal.macros.f}g</span>
                </div>
                ${warningBadge}
            </div>
            <div class="text-right">
                <span class="block font-bold text-primary text-lg">+${meal.calories}</span>
                <span class="text-xs text-gray-400">kcal</span>
            </div>
        `;
        mealList.appendChild(mealEl);
    });
}

function updateProgress() {
    calculateTotalCalories();
    caloriesConsumedEl.textContent = state.todayCalories;

    const percentage = Math.min((state.todayCalories / state.user.calorieGoal) * 100, 100);
    calorieProgress.style.width = `${percentage}%`;

    // Dynamic color based on progress
    if (percentage > 100) {
        calorieProgress.className = 'bg-red-500 h-4 rounded-full transition-all duration-1000 ease-out relative';
    } else {
        calorieProgress.className = 'bg-gradient-to-r from-primary to-green-400 h-4 rounded-full transition-all duration-1000 ease-out relative';
    }
}

function calculateTotalCalories() {
    state.todayCalories = state.meals.reduce((total, meal) => total + meal.calories, 0);
}

function resetScanState() {
    imagePreviewContainer.classList.add('hidden');
    loadingIndicator.classList.add('hidden');
    scanMealBtn.classList.remove('hidden');
    mealImageInput.value = '';
}

// -----------------------------------------------------------------------------
// EVENT LISTENERS (Updated)
// -----------------------------------------------------------------------------
if (backToDashBtn) {
    backToDashBtn.addEventListener('click', () => {
        currentAnalysisData = null;
        showDashboard();
    });
}

if (confirmLogBtn) {
    confirmLogBtn.addEventListener('click', () => {
        if (currentAnalysisData) {
            state.meals.push(currentAnalysisData);
            saveMeals();
            currentAnalysisData = null;
            showDashboard();
        }
    });
}

// -----------------------------------------------------------------------------
// AI CALORIE CALCULATION
// -----------------------------------------------------------------------------
async function calculateCaloriesWithAI(weight, height, age, gender, disease) {
    // If no API key, use fallback BMR
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_API_KEY_HERE') {
        console.warn('No API Key provided. Using BMR formula.');
        const bmr = calculateBMR(weight, height, age, gender);
        return {
            calorieGoal: bmr,
            recommendation: "Based on standard BMR calculation (Mifflin-St Jeor equation).",
            recommendationAR: "بناءً على حساب معدل الأيض الأساسي (معادلة ميفلين-سانت جيور)."
        };
    }

    const prompt = `
        You are a professional nutritionist AI. Calculate the optimal daily calorie intake for this person:
        
        - Weight: ${weight} kg
        - Height: ${height} cm
        - Age: ${age} years
        - Gender: ${gender}
        - Chronic Disease: ${disease || 'None'}
        
        Consider the following:
        1. Use Mifflin-St Jeor equation as a baseline
        2. Apply a sedentary activity multiplier (1.2)
        3. IMPORTANT: Adjust the calories based on the chronic disease:
           - Diabetes: May need lower carb focus, adjusted calories
           - Hypertension: Consider sodium-conscious intake
           - Heart Disease: Heart-healthy calorie target
           - Kidney Disease: May need protein-adjusted intake
        4. Provide a professional recommendation explaining why this calorie target is optimal
        
        Return ONLY raw JSON in this exact format:
        {
            "calorieGoal": 0,
            "recommendation": "Professional explanation in English about why this calorie target is optimal for this person's health condition",
            "recommendationAR": "شرح احترافي بالعربية عن سبب اختيار هذا الهدف من السعرات الحرارية"
        }
    `;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "user", content: prompt }
                ],
                max_tokens: 400
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        return JSON.parse(content.replace(/```json|```/g, '').trim());

    } catch (error) {
        console.error('AI Calorie Calculation Error:', error);
        // Fallback to BMR
        const bmr = calculateBMR(weight, height, age, gender);
        return {
            calorieGoal: bmr,
            recommendation: "Calculated using standard BMR formula due to AI service unavailability.",
            recommendationAR: "تم الحساب باستخدام معادلة BMR القياسية بسبب عدم توفر خدمة الذكاء الاصطناعي."
        };
    }
}

// -----------------------------------------------------------------------------
// AI INTEGRATION (Updated)
// -----------------------------------------------------------------------------

// Helper: Convert File to Base64
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]); // remove data:image/...;base64,
    reader.onerror = error => reject(error);
});

async function handleImageAnalysis(file) {
    loadingIndicator.classList.remove('hidden');

    try {
        const base64Image = await toBase64(file);
        // Create a local URL for preview
        const localImageSrc = URL.createObjectURL(file);

        const analysisResult = await analyzeImageWithAI(base64Image);

        if (analysisResult) {
            // Show Analysis Screen instead of saving immediately
            resetScanState(); // Hide loader
            showAnalysisResult(analysisResult, localImageSrc);
        } else {
            alert('Could not analyze the image. Please try again.');
            resetScanState();
        }

    } catch (error) {
        console.error("Error during analysis:", error);
        alert(`Analysis Error: ${error.message}`);
        resetScanState();
    }
}

async function analyzeImageWithAI(base64Image) {
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_API_KEY_HERE') {
        console.warn('No API Key provided. Returning mock data.');
        return mockAnalysis();
    }

    const systemPrompt = `
        You are a professional nutritionist AI. Analyze this food image carefully.
        
        User Health Profile: ${state.user.disease || 'None'}
        
        Provide the following in your response:
        1. Identify the meal name
        2. Estimate calories, protein (g), carbs (g), fat (g)
        3. If the food conflicts with the user's health condition, provide a warning
        4. Provide 3 professional nutrition tips in ENGLISH
        5. Provide the SAME 3 tips translated to ARABIC
        6. Provide 2 actionable solutions/recommendations for healthier eating
        
        Return ONLY raw JSON in this EXACT format: 
        { 
            "foodName": "Meal name here",
            "calories": 0, 
            "macros": {"p": 0, "c": 0, "f": 0}, 
            "warning": "Health warning if applicable, or empty string",
            "tipsEN": [
                "First professional nutrition tip in English",
                "Second professional nutrition tip in English", 
                "Third professional nutrition tip in English"
            ],
            "tipsAR": [
                "النصيحة الأولى بالعربية",
                "النصيحة الثانية بالعربية",
                "النصيحة الثالثة بالعربية"
            ],
            "solutions": [
                {"en": "Solution 1 in English", "ar": "الحل الأول بالعربية"},
                {"en": "Solution 2 in English", "ar": "الحل الثاني بالعربية"}
            ]
        }
    `;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: systemPrompt },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                        ]
                    }
                ],
                max_tokens: 800
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        return JSON.parse(content.replace(/```json|```/g, '').trim());

    } catch (error) {
        throw error;
    }
}

function mockAnalysis() {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                foodName: "Grilled Salmon & Quinoa",
                calories: 520,
                macros: { p: 35, c: 45, f: 18 },
                warning: "High Sodium Warning: 1200mg. Exceeds limit for Hypertension.",
                tipsEN: [
                    "Salmon is rich in Omega-3 fatty acids which support heart and brain health.",
                    "Quinoa provides complete protein with all 9 essential amino acids.",
                    "Consider adding leafy greens for extra vitamins and fiber."
                ],
                tipsAR: [
                    "السلمون غني بأحماض أوميغا-3 الدهنية التي تدعم صحة القلب والدماغ.",
                    "الكينوا توفر بروتين كامل مع جميع الأحماض الأمينية الأساسية التسعة.",
                    "فكر في إضافة الخضروات الورقية للحصول على فيتامينات وألياف إضافية."
                ],
                solutions: [
                    { en: "Reduce salt by using herbs and lemon for flavor", ar: "قلل الملح باستخدام الأعشاب والليمون للنكهة" },
                    { en: "Pair with steamed vegetables instead of fried sides", ar: "قدم مع خضروات مطهوة بالبخار بدلاً من المقليات" }
                ]
            });
        }, 2000);
    });
}

// Start
init();
