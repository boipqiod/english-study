document.addEventListener('DOMContentLoaded', () => {
    // ---------------------------------------------------------
    // STATE & CONSTANTS
    // ---------------------------------------------------------
    const WORDS_PER_DAY = 50;
    
    let state = {
        allWords: [],
        filteredWords: [], // For List View
        wrongAnswers: JSON.parse(localStorage.getItem('boca_wrong_answers') || '[]'),
        
        // Settings
        currentDay: 'all',
        
        // Flashcard State
        fcState: {
            playlist: [], // words to study
            currentIndex: 0,
            isFlipped: false
        },

        // Quiz State
        quizState: {
            questions: [],
            currentQuestionIndex: 0,
            score: 0,
            isFinished: false,
            mode: 'en-to-kr',      // 'en-to-kr' or 'kr-to-en'
            questionCount: 20,     // 10, 20, 30, or 'all'
            source: 'day',         // 'day' or 'wrong'
            wrongThisRound: []     // track wrong answers for this quiz session
        }
    };

    let voices = [];
    let activeCardId = null;

    // Virtual Scroll State
    let itemsPerRow = 1;
    let rowHeight = 176; // 160px card + 16px gap
    let isVirtualScrolling = false;
    let resizeTimeout;
    let lastStartIndex = -1;
    let lastEndIndex = -1;

    // DOM Elements - Global
    const views = {
        list: document.getElementById('view-list'),
        flashcard: document.getElementById('view-flashcard'),
        quiz: document.getElementById('view-quiz'),
        mynote: document.getElementById('view-mynote')
    };

    const cardGrid = document.getElementById('card-grid');
    const scrollContainer = document.getElementById('scroll-container');
    const spacer = document.getElementById('spacer');
    const daySelect = document.getElementById('day-select');
    const searchInput = document.getElementById('search-input');
    const voiceSelect = document.getElementById('voice-select');
    const fontSelect = document.getElementById('font-select');
    const navItems = document.querySelectorAll('.nav-item');

    // DOM Elements - Modal
    const modal = document.getElementById('example-modal');
    const modalWord = document.getElementById('modal-word');
    const modalMeaning = document.getElementById('modal-meaning');
    const modalNuance = document.getElementById('modal-nuance-content');
    const modalExamples = document.getElementById('modal-examples-content');
    const modalClose = document.getElementById('modal-close');

    // ---------------------------------------------------------
    // 1. INITIALIZATION
    // ---------------------------------------------------------

    function init() {
        if (typeof VOCA_DATA !== 'undefined') {
            state.allWords = VOCA_DATA.sort((a, b) => parseInt(a.id) - parseInt(b.id));
            state.filteredWords = [...state.allWords];
            initDaySelect(state.allWords);

            // Initialize Virtual Scroller for List View
            initVirtualScroller();
            updateVirtualScroll();
        } else {
            console.error('VOCA_DATA not found.');
        }

        loadFontPreference();
        loadVoices();
        setupNavigation();
        setupEventListeners();
        setupHamburger();
        setupBottomNavAutoHide();

        // Voice Loading (Async)
        if (speechSynthesis.onvoiceschanged !== undefined) {
             speechSynthesis.onvoiceschanged = loadVoices;
        }
    }

    // ---------------------------------------------------------
    // HAMBURGER MENU (Mobile)
    // ---------------------------------------------------------
    function setupHamburger() {
        const hamburgerBtn = document.getElementById('hamburger-btn');
        const controlsPanel = document.getElementById('controls-panel');
        if (!hamburgerBtn || !controlsPanel) return;

        hamburgerBtn.addEventListener('click', () => {
            hamburgerBtn.classList.toggle('active');
            controlsPanel.classList.toggle('open');
        });

        // Close menu when a control is used (day select, font, voice)
        [daySelect, fontSelect, voiceSelect].forEach(el => {
            el.addEventListener('change', () => {
                if (window.innerWidth <= 640) {
                    hamburgerBtn.classList.remove('active');
                    controlsPanel.classList.remove('open');
                }
            });
        });
    }

    // ---------------------------------------------------------
    // BOTTOM NAV AUTO-HIDE (Mobile)
    // ---------------------------------------------------------
    function setupBottomNavAutoHide() {
        const bottomNav = document.querySelector('.bottom-nav');
        if (!bottomNav || !scrollContainer) return;

        let lastScrollY = 0;
        let hideTimeout;

        scrollContainer.addEventListener('scroll', () => {
            if (window.innerWidth > 640) return;

            const currentScrollY = scrollContainer.scrollTop;
            if (currentScrollY > lastScrollY && currentScrollY > 50) {
                // Scrolling down - hide
                bottomNav.classList.add('nav-hidden');
            } else {
                // Scrolling up - show
                bottomNav.classList.remove('nav-hidden');
            }
            lastScrollY = currentScrollY;

            // Auto-show after stopping scroll
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                bottomNav.classList.remove('nav-hidden');
            }, 2000);
        });
    }

    // ---------------------------------------------------------
    // 2. NAVIGATION & TABS
    // ---------------------------------------------------------

    function setupNavigation() {
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const targetId = item.dataset.target; // e.g., 'view-list'
                // Find button if icon was clicked
                const targetBtn = e.target.closest('.nav-item');
                if (targetBtn) {
                     switchTab(targetBtn.dataset.target);
                }
            });
        });
    }

    function switchTab(tabId) {
        // Update Nav UI
        navItems.forEach(nav => {
            if (nav.dataset.target === tabId) nav.classList.add('active');
            else nav.classList.remove('active');
        });

        // Switch View visibility
        Object.keys(views).forEach(key => {
            const view = views[key];
            if (view.id === tabId) {
                view.classList.remove('hidden');
                view.classList.add('active');
            } else {
                view.classList.add('hidden');
                view.classList.remove('active');
            }
        });

        // Tab Specific Init
        if (tabId === 'view-list') {
            // CRITICAL: Recalculate virtual scroll when view becomes visible
            // use setTimeout to ensure layout is applied
            setTimeout(() => {
                calculateDimensions();
                updateVirtualScroll();
                // Force a render
                lastStartIndex = -1;
                renderVirtualSlice();
            }, 50);
        } else if (tabId === 'view-flashcard') {
            initFlashcardMode();
        } else if (tabId === 'view-quiz') {
            showQuizSetup(); // Show setup screen instead of starting quiz directly
        } else if (tabId === 'view-mynote') {
            initMyNoteMode();
        }
    }

    // ---------------------------------------------------------
    // 3. VIRTUAL SCROLLING (List View)
    // ---------------------------------------------------------

    function initVirtualScroller() {
        calculateDimensions();
        isVirtualScrolling = true;
    }

    function calculateDimensions() {
        if (!cardGrid || views.list.classList.contains('hidden')) return;

        const gridStyle = window.getComputedStyle(cardGrid);

        // If display: none, gridTemplateColumns might not be accurate.
        // We rely on switchTab to recall this when visible.
        const gridColumns = gridStyle.gridTemplateColumns.split(' ').length;
        itemsPerRow = gridColumns > 0 ? gridColumns : 1;

        // Row height: card height + gap (mobile: 130px + 8px, desktop: 160px + 16px)
        if (window.innerWidth <= 640) {
            rowHeight = 138; // 130px card + 8px gap
        } else {
            rowHeight = 176; // 160px card + 16px gap
        }
    }

    function updateVirtualScroll() {
        if (!isVirtualScrolling) return;

        const totalItems = state.filteredWords.length;
        const totalRows = Math.ceil(totalItems / itemsPerRow);
        const totalHeight = totalRows * rowHeight;

        // Set spacer height to simulate full scrollable area
        if (spacer) {
            spacer.style.height = `${totalHeight}px`;
        }
        
        renderVirtualSlice();
    }

    function renderVirtualSlice() {
        if (!scrollContainer || !cardGrid) return;
        
        // If container is hidden, scrollHeight might be 0, return.
        if(scrollContainer.offsetParent === null) return;

        const scrollTop = scrollContainer.scrollTop;
        const clientHeight = scrollContainer.clientHeight;

        // Calculate visible row range
        const bufferRows = 2;

        let startRow = Math.floor(scrollTop / rowHeight) - bufferRows;
        if (startRow < 0) startRow = 0;

        let endRow = Math.ceil((scrollTop + clientHeight) / rowHeight) + bufferRows;

        const totalRows = Math.ceil(state.filteredWords.length / itemsPerRow);
        if (endRow > totalRows) endRow = totalRows;

        // Calculate item indices
        const startIndex = startRow * itemsPerRow;
        const endIndex = endRow * itemsPerRow;

        // Optimization: Only render if indices changed
        if (startIndex === lastStartIndex && endIndex === lastEndIndex) {
            return;
        }

        lastStartIndex = startIndex;
        lastEndIndex = endIndex;

        const visibleItems = state.filteredWords.slice(startIndex, endIndex);

        // Render these items
        renderCards(visibleItems);

        // Position the grid to match the scroll position
        const offsetY = startRow * rowHeight;
        cardGrid.style.transform = `translateY(${offsetY}px)`;
    }

    function renderCards(words) {
        cardGrid.innerHTML = '';
        
        words.forEach(word => {
            const card = document.createElement('div');
            card.className = 'word-card';
            if (word.id === activeCardId) {
                card.classList.add('active');
            }
            
            const posHtml = word.pos 
                ? word.pos.split(',').map(p => `<span class="pos-tag">${p.trim()}</span>`).join('') 
                : '';

            card.innerHTML = `
                <div class="card-number">#${word.id}</div>
                <div class="english-word">${word.word}</div>
                
                <div class="meta-info">
                    <div class="pronunciation">${word.pronunciation || ''}</div>
                    <div class="pos-tags">${posHtml}</div>
                </div>

                <div class="meaning-container">
                    <div class="meaning-text">${word.meaning}</div>
                    <div class="action-row">
                        <button class="btn-icon btn-speak" title="Listen">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                        </button>
                        <button class="btn-example">예문 보기</button>
                    </div>
                </div>
            `;

            // Card Click Event
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                
                if (activeCardId === word.id) {
                    activeCardId = null;
                    card.classList.remove('active');
                } else {
                    const previousActive = cardGrid.querySelector('.word-card.active');
                    if (previousActive) previousActive.classList.remove('active');
                    activeCardId = word.id;
                    card.classList.add('active');
                }
            });

            // Speak Btn
            const speakBtn = card.querySelector('.btn-speak');
            speakBtn.addEventListener('click', (e) => { e.stopPropagation(); playAudio(word.word); });

            // Example Btn
            const exampleBtn = card.querySelector('.btn-example');
            exampleBtn.addEventListener('click', (e) => { e.stopPropagation(); openModal(word); });

            cardGrid.appendChild(card);
        });
    }

    // ---------------------------------------------------------
    // 4. FLASHCARD Logic
    // ---------------------------------------------------------
    
    function initFlashcardMode() {
        const currentList = getWordsForCurrentDay();
        state.fcState.playlist = shuffleArray([...currentList]);
        state.fcState.currentIndex = 0;
        state.fcState.isFlipped = false;
        
        renderFlashcard();
    }

    function renderFlashcard() {
        const { playlist, currentIndex, isFlipped } = state.fcState;
        const cardEl = document.getElementById('flashcard-main');
        
        if (playlist.length === 0) {
            cardEl.innerHTML = '<div class="card-face card-front">No words available for this selection.</div>';
            return;
        }

        const word = playlist[currentIndex];
        
        if (isFlipped) cardEl.classList.add('flipped');
        else cardEl.classList.remove('flipped');

        // Re-inject content or update
        // Since we are replacing content, let's just re-render internal safe
        cardEl.innerHTML = `
            <div class="card-face card-front">
                <span class="fc-word">${word.word}</span>
                <span class="fc-hint">#${currentIndex + 1} / ${playlist.length}</span>
                <span class="fc-hint" style="font-size: 0.7rem; margin-top: 5px;">Tap to Flip</span>
            </div>
            <div class="card-face card-back">
                <span class="fc-meaning">${word.meaning}</span>
                <p class="fc-example">${(word.examples && word.examples[0]) || ''}</p>
                <div class="fc-actions" style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                    <button class="btn-icon btn-speak">🔊</button>
                    <button class="btn-example" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">예문 보기</button>
                </div>
            </div>
        `;
        
        cardEl.onclick = (e) => {
            if (e.target.closest('button')) return;
            state.fcState.isFlipped = !state.fcState.isFlipped;
            cardEl.classList.toggle('flipped', state.fcState.isFlipped);
        };

        // Bind events
        const speakBtn = cardEl.querySelector('.btn-speak');
        if (speakBtn) speakBtn.onclick = (e) => { e.stopPropagation(); playAudio(word.word); };

        const exampleBtn = cardEl.querySelector('.btn-example');
        if (exampleBtn) exampleBtn.onclick = (e) => { e.stopPropagation(); openModal(word); };
    }

    const fcPrevBtn = document.getElementById('fc-btn-prev');
    const fcNextBtn = document.getElementById('fc-btn-next');
    const fcFlipBtn = document.getElementById('fc-btn-flip');

    if (fcPrevBtn) {
        fcPrevBtn.addEventListener('click', () => {
             if (state.fcState.currentIndex > 0) {
                state.fcState.currentIndex--;
                state.fcState.isFlipped = false;
                renderFlashcard();
            }
        });
        fcNextBtn.addEventListener('click', () => {
             if (state.fcState.currentIndex < state.fcState.playlist.length - 1) {
                state.fcState.currentIndex++;
                state.fcState.isFlipped = false;
                renderFlashcard();
            }
        });
        fcFlipBtn.addEventListener('click', () => {
             state.fcState.isFlipped = !state.fcState.isFlipped;
             document.getElementById('flashcard-main').classList.toggle('flipped', state.fcState.isFlipped);
        });
    }

    // ---------------------------------------------------------
    // 5. QUIZ Logic
    // ---------------------------------------------------------
    
    function showQuizSetup() {
        document.getElementById('quiz-setup').classList.remove('hidden');
        document.getElementById('quiz-game').classList.add('hidden');
        document.getElementById('quiz-result').classList.add('hidden');
        
        setupToggleButtons();
    }

    function setupToggleButtons() {
        // Mode
        document.querySelectorAll('[data-mode]').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.quizState.mode = btn.dataset.mode;
            };
        });
        // Count
        document.querySelectorAll('[data-count]').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('[data-count]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.quizState.questionCount = btn.dataset.count === 'all' ? 'all' : parseInt(btn.dataset.count);
            };
        });
        // Source
        document.querySelectorAll('[data-source]').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('[data-source]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.quizState.source = btn.dataset.source;
            };
        });
    }

    document.getElementById('btn-start-quiz').addEventListener('click', startQuiz);

    function startQuiz() {
        const { mode, questionCount, source } = state.quizState;
        
        let wordPool = [];
        if (source === 'wrong') {
            wordPool = state.allWords.filter(w => state.wrongAnswers.includes(w.id));
            if (wordPool.length < 4) {
                alert('Not enough wrong answers! Need at least 4.');
                return;
            }
        } else {
            wordPool = getWordsForCurrentDay();
            if (wordPool.length < 4) {
                alert('Not enough words! Need at least 4.');
                return;
            }
        }

        const quizLength = questionCount === 'all' ? wordPool.length : Math.min(questionCount, wordPool.length);
        const shuffledWords = shuffleArray([...wordPool]).slice(0, quizLength);
        
        state.quizState.questions = shuffledWords.map(target => {
            const otherWords = state.allWords.filter(w => w.id !== target.id);
             if (mode === 'en-to-kr') {
                const wrongOptions = shuffleArray(otherWords).slice(0, 3).map(w => w.meaning);
                const options = shuffleArray([target.meaning, ...wrongOptions]);
                return { word: target, question: target.word, options: options, correctAnswer: target.meaning };
            } else {
                const wrongOptions = shuffleArray(otherWords).slice(0, 3).map(w => w.word);
                const options = shuffleArray([target.word, ...wrongOptions]);
                return { word: target, question: target.meaning, options: options, correctAnswer: target.word };
            }
        });
        
        state.quizState.currentQuestionIndex = 0;
        state.quizState.score = 0;
        state.quizState.wrongThisRound = [];

        document.getElementById('quiz-setup').classList.add('hidden');
        document.getElementById('quiz-game').classList.remove('hidden');
        document.getElementById('quiz-mode-label').textContent = mode === 'en-to-kr' ? '영어 → 한글' : '한글 → 영어';
        
        renderQuizQuestion();
    }

    function renderQuizQuestion() {
        const { questions, currentQuestionIndex, score } = state.quizState;
        
        const progressPercent = ((currentQuestionIndex) / questions.length) * 100;
        document.getElementById('quiz-progress-fill').style.width = `${progressPercent}%`;
        document.getElementById('quiz-score-val').textContent = `${score}`;

        if (currentQuestionIndex >= questions.length) {
            finishQuiz();
            return;
        }

        const q = questions[currentQuestionIndex];
        document.getElementById('quiz-question').textContent = q.question;
        
        const optEl = document.getElementById('quiz-options');
        optEl.innerHTML = '';
        q.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn-option';
            btn.textContent = opt;
            btn.onclick = () => handleQuizAnswer(btn, opt, q);
            optEl.appendChild(btn);
        });
    }

    function handleQuizAnswer(btnElement, selectedOption, questionObj) {
        const isCorrect = selectedOption === questionObj.correctAnswer;
        const allBtns = document.getElementById('quiz-options').querySelectorAll('button');
        allBtns.forEach(b => b.disabled = true);

        if (isCorrect) {
            btnElement.classList.add('correct');
            state.quizState.score += 10;
        } else {
            btnElement.classList.add('wrong');
            allBtns.forEach(b => { if (b.textContent === questionObj.correctAnswer) b.classList.add('correct'); });
            saveWrongAnswer(questionObj.word.id);
            state.quizState.wrongThisRound.push(questionObj.word);
        }

        setTimeout(() => {
            state.quizState.currentQuestionIndex++;
            renderQuizQuestion();
        }, 1200);
    }

    function finishQuiz() {
        const { questions, score, wrongThisRound } = state.quizState;
        const totalPossible = questions.length * 10;
        const accuracy = Math.round((score / totalPossible) * 100) || 0;
        
        document.getElementById('quiz-game').classList.add('hidden');
        document.getElementById('quiz-result').classList.remove('hidden');
        document.getElementById('final-score').textContent = score;
        document.getElementById('final-total').textContent = totalPossible;
        document.getElementById('final-accuracy').textContent = accuracy;
        document.getElementById('quiz-progress-fill').style.width = `100%`;

        const wrongSummary = document.getElementById('wrong-summary');
        const wrongList = document.getElementById('wrong-list');
        const retryBtn = document.getElementById('btn-retry-wrong');
        
        if (wrongThisRound.length > 0) {
            wrongSummary.classList.remove('hidden');
            wrongList.innerHTML = wrongThisRound.map(w => 
                `<li><span class="word-en">${w.word}</span><span class="word-kr">${w.meaning}</span></li>`
            ).join('');
            retryBtn.classList.remove('hidden');
        } else {
            wrongSummary.classList.add('hidden');
            retryBtn.classList.add('hidden');
        }
    }

    document.getElementById('btn-restart-quiz').addEventListener('click', showQuizSetup);
    document.getElementById('btn-retry-wrong').addEventListener('click', () => {
        state.quizState.source = 'wrong';
        document.querySelectorAll('[data-source]').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-source="wrong"]').classList.add('active');
        startQuiz();
    });

    // ---------------------------------------------------------
    // 6. MY NOTE Logic
    // ---------------------------------------------------------

    function saveWrongAnswer(wordId) {
        if (!state.wrongAnswers.includes(wordId)) {
            state.wrongAnswers.push(wordId);
            localStorage.setItem('boca_wrong_answers', JSON.stringify(state.wrongAnswers));
        }
    }

    function initMyNoteMode() {
        const grid = document.getElementById('mynote-grid');
        grid.innerHTML = '';
        
        if (state.wrongAnswers.length === 0) {
            grid.innerHTML = '<p class="text-secondary" style="grid-column: 1/-1; text-align: center;">No wrong answers yet! keep up the good work. 🎉</p>';
            return;
        }

        const wrongWords = state.allWords.filter(w => state.wrongAnswers.includes(w.id));
        
        wrongWords.forEach(word => {
            // For now, simple cards without virtual scroll for My Note
            const card = document.createElement('div');
            card.className = 'word-card';
            card.innerHTML = `
                <div class="card-number">#${word.id}</div>
                <div class="english-word">${word.word}</div>
                <div class="meaning-container" style="display:flex"><div class="meaning-text">${word.meaning}</div></div>
            `;
            grid.appendChild(card);
        });
    }

    // ---------------------------------------------------------
    // 7. COMMON & EVENT
    // ---------------------------------------------------------

    function setupEventListeners() {
        // Modal
        modalClose.addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

        // Filter Inputs
        daySelect.addEventListener('change', filterWordsFn);
        searchInput.addEventListener('input', filterWordsFn);

        // Settings
        fontSelect.addEventListener('change', (e) => {
            applyFont(e.target.value);
            localStorage.setItem('preferredFont', e.target.value);
        });
        voiceSelect.addEventListener('change', (e) => localStorage.setItem('preferredVoice', e.target.value));
        
        // Window Resize for Virtual Scroll
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                calculateDimensions();
                updateVirtualScroll();
            }, 100);
        });

        // Scroll
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', () => {
                if (isVirtualScrolling) renderVirtualSlice();
            });
        }
    }

    function initDaySelect(words) {
         const totalIDs = words.map(w => parseInt(w.id));
         const maxID = Math.max(...totalIDs);
         const totalDays = Math.ceil(maxID / WORDS_PER_DAY);
         for (let i = 1; i <= totalDays; i++) {
             const option = document.createElement('option');
             option.value = i;
             option.textContent = `Day ${i} (${(i-1)*WORDS_PER_DAY + 1}-${i*WORDS_PER_DAY})`;
             daySelect.appendChild(option);
         }
    }

    function filterWordsFn() {
        activeCardId = null;
        const selectedDay = daySelect.value;
        const searchTerm = searchInput.value.toLowerCase().trim();

        // If taking quiz source from current day, update it?? 
        // Logic for Quiz tracks `daySelect` independently in getWordsForCurrentDay. 
        // Here we just filter the list view.
        state.filteredWords = state.allWords.filter(word => {
            const id = parseInt(word.id);
            let dayMatch = true;
            if (selectedDay !== 'all') {
                const day = parseInt(selectedDay);
                const start = (day - 1) * WORDS_PER_DAY + 1;
                const end = day * WORDS_PER_DAY;
                dayMatch = id >= start && id <= end;
            }
            let searchMatch = true;
            if (searchTerm) {
                searchMatch = word.word.toLowerCase().includes(searchTerm) || word.meaning.includes(searchTerm);
            }
            return dayMatch && searchMatch;
        });

        if (scrollContainer) scrollContainer.scrollTop = 0;
        lastStartIndex = -1;
        lastEndIndex = -1;
        updateVirtualScroll();
    }

    function getWordsForCurrentDay() {
        // Reuse logic or refactor
        const selectedDay = daySelect.value;
        if (selectedDay === 'all') return state.allWords;
        const day = parseInt(selectedDay);
        const start = (day - 1) * WORDS_PER_DAY + 1;
        const end = day * WORDS_PER_DAY;
        return state.allWords.filter(w => parseInt(w.id) >= start && parseInt(w.id) <= end);
    }
    
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function playAudio(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            const selectedVoiceName = voiceSelect.value;
            const selectedVoice = voices.find(v => v.name === selectedVoiceName);
            if (selectedVoice) utterance.voice = selectedVoice;
            window.speechSynthesis.speak(utterance);
        }
    }

    function loadVoices() {
        voices = window.speechSynthesis.getVoices();
        voiceSelect.innerHTML = '';
        const enVoices = voices.filter(v => v.lang.includes('en'));
        if (enVoices.length === 0) {
             const o = document.createElement('option'); o.textContent = "Default"; voiceSelect.appendChild(o); 
             return;
        }
        enVoices.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.name; opt.textContent = v.name; 
            voiceSelect.appendChild(opt);
        });
        const saved = localStorage.getItem('preferredVoice');
        if (saved && enVoices.some(v => v.name === saved)) voiceSelect.value = saved;
    }

    function loadFontPreference() {
        const saved = localStorage.getItem('preferredFont');
        if (saved) { fontSelect.value = saved; applyFont(saved); }
    }
    
    function applyFont(font) {
         const root = document.documentElement;
         if (font === 'Playfair Display') {
             root.style.setProperty('--font-body', `'Playfair Display', serif`);
             root.style.setProperty('--font-heading', `'Playfair Display', serif`);
         } else if (font === 'Noto Sans KR') {
              root.style.setProperty('--font-body', `'Noto Sans KR', sans-serif`);
              root.style.setProperty('--font-heading', `'Noto Sans KR', sans-serif`);
         } else {
             root.style.setProperty('--font-body', font);
             root.style.setProperty('--font-heading', font);
         }
    }
    
    function openModal(word) {
        modalWord.textContent = word.word;
        modalMeaning.textContent = word.meaning;
        if (word.nuance && word.nuance.length > 0) {
            modalNuance.innerHTML = word.nuance.map(n => `<div class="nuance-item">${n}</div>`).join('');
            document.getElementById('modal-nuance-section').style.display = 'block';
        } else {
            document.getElementById('modal-nuance-section').style.display = 'none';
        }
        if (word.examples && word.examples.length > 0) {
            modalExamples.innerHTML = word.examples.map(ex => `<div class="example-item">${ex}</div>`).join('');
        } else {
            modalExamples.innerHTML = '<p class="text-secondary">No examples available.</p>';
        }
        modal.classList.remove('hidden');
    }

    // Initialize the app
    init();
});
