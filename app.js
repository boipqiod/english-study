document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const cardGrid = document.getElementById('card-grid');
    const scrollContainer = document.getElementById('scroll-container');
    const spacer = document.getElementById('spacer');
    const daySelect = document.getElementById('day-select');
    const searchInput = document.getElementById('search-input');
    const voiceSelect = document.getElementById('voice-select');
    const fontSelect = document.getElementById('font-select');
    
    // Modal Elements
    const modal = document.getElementById('example-modal');
    const modalWord = document.getElementById('modal-word');
    const modalMeaning = document.getElementById('modal-meaning');
    const modalNuance = document.getElementById('modal-nuance-content');
    const modalExamples = document.getElementById('modal-examples-content');
    const modalClose = document.getElementById('modal-close');

    // State
    let allWords = [];
    let filteredWords = [];
    const WORDS_PER_DAY = 50;
    let voices = [];
    let activeCardId = null;

    // Virtual Scroll State
    let itemsPerRow = 1;
    let rowHeight = 176; // 160px card + 16px gap
    let isVirtualScrolling = false;
    let resizeTimeout;
    let lastStartIndex = -1;
    let lastEndIndex = -1;

    // ---------------------------------------------------------
    // 1. Initialization & Data Loading
    // ---------------------------------------------------------

    // Load Data
    if (typeof VOCA_DATA !== 'undefined') {
        allWords = VOCA_DATA.sort((a, b) => parseInt(a.id) - parseInt(b.id));
        initDaySelect(allWords);

        // Initial render logic
        filteredWords = [...allWords];
        initVirtualScroller();
        updateVirtualScroll();
    } else {
        console.error('VOCA_DATA not found. Make sure data.js is loaded.');
    }

    // Initialize Font from LocalStorage
    const savedFont = localStorage.getItem('preferredFont');
    if (savedFont) {
        fontSelect.value = savedFont;
        applyFont(savedFont);
    }

    // TTS Voice Loading
    function loadVoices() {
        voices = window.speechSynthesis.getVoices();
        voiceSelect.innerHTML = '';
        
        // Filter for English voices
        const englishVoices = voices.filter(voice => voice.lang.includes('en'));
        
        if (englishVoices.length === 0) {
            const option = document.createElement('option');
            option.textContent = "No English voices found";
            voiceSelect.appendChild(option);
            return;
        }

        englishVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });

        // Try to select saved voice or default premium voice
        const savedVoiceName = localStorage.getItem('preferredVoice');
        let selectedVoice = null;

        if (savedVoiceName) {
            selectedVoice = englishVoices.find(v => v.name === savedVoiceName);
        }

        if (!selectedVoice) {
            selectedVoice = englishVoices.find(v => v.name.includes('Google US English')) || 
                            englishVoices.find(v => v.name.includes('Samantha')) ||
                            englishVoices[0];
        }
        
        if (selectedVoice) {
            voiceSelect.value = selectedVoice.name;
        }
    }

    // Init Voices
    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }

    // ---------------------------------------------------------
    // 2. Event Listeners (Global UI)
    // ---------------------------------------------------------

    // Modal Close
    modalClose.addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    // Filter Inputs
    daySelect.addEventListener('change', filterWordsFn);
    searchInput.addEventListener('input', filterWordsFn);

    // Font Switcher
    fontSelect.addEventListener('change', (e) => {
        const font = e.target.value;
        applyFont(font);
        localStorage.setItem('preferredFont', font);
    });

    // Voice Switcher (Save preference)
    voiceSelect.addEventListener('change', (e) => {
        localStorage.setItem('preferredVoice', e.target.value);
    });

    // Virtual Scroll Resize Listener
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            calculateDimensions();
            updateVirtualScroll();
        }, 100);
    });

    // Scroll Listener
    if (scrollContainer) {
        scrollContainer.addEventListener('scroll', () => {
            if (isVirtualScrolling) {
                renderVirtualSlice();
            }
        });
    }

    // ---------------------------------------------------------
    // 3. Helper Functions
    // ---------------------------------------------------------

    function applyFont(font) {
        const root = document.documentElement;
        if (font === 'Playfair Display') {
            root.style.setProperty('--font-body', `'Playfair Display', serif`);
            root.style.setProperty('--font-heading', `'Playfair Display', serif`);
        } else if (font === 'Noto Sans KR') {
             root.style.setProperty('--font-body', `'Noto Sans KR', sans-serif`);
             root.style.setProperty('--font-heading', `'Noto Sans KR', sans-serif`);
        } else if (font === 'Inter') {
            root.style.setProperty('--font-body', `'Inter', system-ui, sans-serif`);
            root.style.setProperty('--font-heading', `'Playfair Display', serif`);
        } else {
            root.style.setProperty('--font-body', font);
            root.style.setProperty('--font-heading', font);
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
        // Reset active card on filter change
        activeCardId = null;
        
        const selectedDay = daySelect.value;
        const searchTerm = searchInput.value.toLowerCase().trim();

        filteredWords = allWords.filter(word => {
            const id = parseInt(word.id);
            // Day Filter
            let dayMatch = true;
            if (selectedDay !== 'all') {
                const day = parseInt(selectedDay);
                const start = (day - 1) * WORDS_PER_DAY + 1;
                const end = day * WORDS_PER_DAY;
                dayMatch = id >= start && id <= end;
            }
            // Search Filter
            let searchMatch = true;
            if (searchTerm) {
                searchMatch = word.word.toLowerCase().includes(searchTerm) || 
                              word.meaning.includes(searchTerm);
            }
            return dayMatch && searchMatch;
        });

        // Reset scroll to top when filter changes
        if (scrollContainer) {
            scrollContainer.scrollTop = 0;
        }

        // Force update since data changed
        lastStartIndex = -1;
        lastEndIndex = -1;
        updateVirtualScroll();
    }

    function playAudio(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // Cancel previous

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;

            // Apply selected voice
            const selectedVoiceName = voiceSelect.value;
            const selectedVoice = voices.find(voice => voice.name === selectedVoiceName);
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }

            window.speechSynthesis.speak(utterance);
        } else {
            alert('Your browser does not support text-to-speech.');
        }
    }

    function openModal(word) {
        modalWord.textContent = word.word;
        modalMeaning.textContent = word.meaning;
        
        // Render Nuance
        if (word.nuance && word.nuance.length > 0) {
            modalNuance.innerHTML = word.nuance.map(n => `<div class="nuance-item">${n}</div>`).join('');
            document.getElementById('modal-nuance-section').style.display = 'block';
        } else {
            modalNuance.innerHTML = '';
            document.getElementById('modal-nuance-section').style.display = 'none';
        }

        // Render Examples
        if (word.examples && word.examples.length > 0) {
            modalExamples.innerHTML = word.examples.map(ex => `<div class="example-item">${ex}</div>`).join('');
        } else {
            modalExamples.innerHTML = '<p class="text-secondary">No examples available.</p>';
        }

        modal.classList.remove('hidden');
    }

    // ---------------------------------------------------------
    // 4. Virtual Scrolling Implementation
    // ---------------------------------------------------------

    function initVirtualScroller() {
        calculateDimensions();
        isVirtualScrolling = true;
    }

    function calculateDimensions() {
        // We need to know how many columns are in the grid to calculate row count.
        // The card width is minmax(180px, 1fr) with 16px gap.
        // A simple way is to check the computed style of the grid.
        if (!cardGrid) return;

        const gridStyle = window.getComputedStyle(cardGrid);
        const gridColumns = gridStyle.gridTemplateColumns.split(' ').length;
        itemsPerRow = gridColumns > 0 ? gridColumns : 1;

        // Row height is fixed in CSS (160px) + gap (1rem = 16px)
        // We can measure it dynamically or hardcode it since CSS is fixed.
        // Let's assume 176px for stability.
        rowHeight = 176;
    }

    function updateVirtualScroll() {
        if (!isVirtualScrolling) return;

        const totalItems = filteredWords.length;
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

        const scrollTop = scrollContainer.scrollTop;
        const clientHeight = scrollContainer.clientHeight;

        // Calculate visible row range
        // Add buffer to render slightly outside view for smoother scrolling
        const bufferRows = 2;

        let startRow = Math.floor(scrollTop / rowHeight) - bufferRows;
        if (startRow < 0) startRow = 0;

        let endRow = Math.ceil((scrollTop + clientHeight) / rowHeight) + bufferRows;

        const totalRows = Math.ceil(filteredWords.length / itemsPerRow);
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

        const visibleItems = filteredWords.slice(startIndex, endIndex);

        // Render these items
        renderCards(visibleItems);

        // Position the grid to match the scroll position
        // We translate the grid down to where the startRow should start
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

            // Card Click (Toggle / Exclusive)
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                
                if (activeCardId === word.id) {
                    // Close active card
                    activeCardId = null;
                    card.classList.remove('active');
                } else {
                    // Open new card
                    // If there was another active card in the DOM, close it
                    const previousActive = cardGrid.querySelector('.word-card.active');
                    if (previousActive) {
                        previousActive.classList.remove('active');
                    }
                    
                    activeCardId = word.id;
                    card.classList.add('active');
                }
            });

            // Speak Button
            const speakBtn = card.querySelector('.btn-speak');
            speakBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playAudio(word.word);
            });

            // Example Button
            const exampleBtn = card.querySelector('.btn-example');
            exampleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openModal(word);
            });

            cardGrid.appendChild(card);
        });
    }
});
