document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const cardGrid = document.getElementById('card-grid');
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
    const WORDS_PER_DAY = 50;
    let voices = [];
    let currentActiveCard = null;

    // ---------------------------------------------------------
    // 1. Initialization & Data Loading
    // ---------------------------------------------------------

    // Load Data
    if (typeof VOCA_DATA !== 'undefined') {
        allWords = VOCA_DATA.sort((a, b) => parseInt(a.id) - parseInt(b.id));
        initDaySelect(allWords);
        renderCards(allWords);
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
    daySelect.addEventListener('change', filterWords);
    searchInput.addEventListener('input', filterWords);

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


    // ---------------------------------------------------------
    // 3. Helper Functions
    // ---------------------------------------------------------

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

    function filterWords() {
        // Reset active card on filter change
        currentActiveCard = null;
        
        const selectedDay = daySelect.value;
        const searchTerm = searchInput.value.toLowerCase().trim();

        const filtered = allWords.filter(word => {
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
        renderCards(filtered);
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
    // 4. Rendering
    // ---------------------------------------------------------

    function renderCards(words) {
        cardGrid.innerHTML = '';
        currentActiveCard = null; 
        
        words.forEach(word => {
            const card = document.createElement('div');
            card.className = 'word-card';
            
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
                
                if (currentActiveCard === card) {
                    card.classList.remove('active');
                    currentActiveCard = null;
                } else {
                    if (currentActiveCard) {
                        currentActiveCard.classList.remove('active');
                    }
                    card.classList.add('active');
                    currentActiveCard = card;
                    
                    // Auto-play audio on open? (Optional, disabled for now)
                    // playAudio(word.word); 
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
