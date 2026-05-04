/*
================================================================================
EKHOBOT CHAT WIDGET
================================================================================
Frontend chat interface for EkhoBot virtual assistant.

Features:
  - Floating chat bubble launcher with speech bubble
  - Topic-based quick-reply chips for common questions
  - Multi-language selector in header with dropdown
  - Alert system integration for campus notifications
  - Automatic URL and social media link detection
  - Mobile-responsive design
  - 5-column chip layout with curated options

Usage: Include this file in any CSUCI webpage to add EkhoBot chat
================================================================================
*/

/*
================================================================================
CONFIGURATION
================================================================================
*/

const BACKEND_URL = 'http://localhost:3000/chat';

// Conversation state
let history = [];           // Chat message history for Claude API
let currentTopic = 'root';  // Current chip category being displayed
let chatInitialized = false; // Whether initial greeting has been shown
let currentLanguage = 'en'; // Current selected language

/*
Language options for dropdown selector
All 15 languages with their prompts to switch bot responses
*/
const LANGUAGES = [
  { label: 'English', code: 'en', prompt: 'Please respond to me in English from now on.' },
  { label: 'Español', code: 'es', prompt: 'Respóndeme en español de ahora en adelante.' },
  { label: '日本語', code: 'ja', prompt: 'これからは日本語で答えてください。' },
  { label: 'Français', code: 'fr', prompt: 'Veuillez me répondre en français.' },
  { label: 'Tagalog', code: 'tl', prompt: 'Pakisagot sa akin sa Tagalog mula ngayon.' },
  { label: 'Português', code: 'pt', prompt: 'Por favor responda-me em português.' },
  { label: '中文', code: 'zh', prompt: '请用普通话回答我。' },
  { label: '한국어', code: 'ko', prompt: '앞으로 한국어로 대답해 주세요.' },
  { label: 'Tiếng Việt', code: 'vi', prompt: 'Vui lòng trả lời tôi bằng tiếng Việt.' },
  { label: 'العربية', code: 'ar', prompt: 'من فضلك أجبني باللغة العربية.' },
  { label: 'हिन्दी', code: 'hi', prompt: 'कृपया मुझे हिंदी में जवाब दें।' },
  { label: 'فارسی', code: 'fa', prompt: 'لطفاً به فارسی پاسخ دهید.' },
  { label: 'Русский', code: 'ru', prompt: 'Пожалуйста, отвечай мне по-русски.' },
  { label: 'Deutsch', code: 'de', prompt: 'Bitte antworte mir auf Deutsch.' },
  { label: 'Italiano', code: 'it', prompt: 'Per favore rispondimi in italiano.' },
];

/*
================================================================================
STYLES
================================================================================
All CSS for the chat widget is injected dynamically
*/

const style = document.createElement('style');
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@400;500;600&display=swap');

  /* Launcher: floating bubble + speech bubble */
  #ekho-launcher {
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    display: flex; flex-direction: row; align-items: flex-end; gap: 10px;
    transition: opacity 0.2s;
  }
  #ekho-launcher.hidden { opacity: 0; pointer-events: none; }

  /* Speech bubble */
  #ekho-speech {
    background: #fff; color: #1a1a1a;
    font-family: 'Source Sans 3', sans-serif;
    font-size: 13px; font-weight: 600;
    padding: 8px 14px; border-radius: 18px 18px 18px 4px;
    border: 1.5px solid #E8E9EA;
    box-shadow: 0 4px 16px rgba(0,0,0,0.10);
    white-space: nowrap; cursor: pointer;
    align-self: center; position: relative;
    animation: ekho-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    transform-origin: center right;
  }
  #ekho-speech::after {
    content: ''; position: absolute;
    right: -9px; bottom: 12px;
    width: 0; height: 0;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-left: 9px solid #fff;
  }
  @keyframes ekho-pop {
    0% { opacity: 0; transform: scale(0.7); }
    100% { opacity: 1; transform: scale(1); }
  }

  /* Chat bubble button */
  #ekho-bubble {
    width: 60px; height: 60px; border-radius: 50%;
    background: #C8102E; border: 3px solid #fff;
    box-shadow: 0 4px 18px rgba(200,16,46,0.40);
    cursor: pointer; display: flex;
    align-items: center; justify-content: center;
    transition: background 0.15s, transform 0.15s;
    outline: none; padding: 0;
  }
  #ekho-bubble:hover { background: #a00d24; transform: scale(1.06); }

  /* Chat window */
  #ekho-window {
    position: fixed; bottom: 0; right: 0;
    width: min(420px, 100vw); height: min(700px, 100vh);
    background: #fff;
    border-radius: 14px 14px 0 0;
    border: 1px solid #E8E9EA; border-bottom: none;
    box-shadow: 0 -4px 28px rgba(0,0,0,0.12);
    display: none; flex-direction: column;
    font-family: 'Source Sans 3', sans-serif;
    overflow: hidden; z-index: 9998;
  }

  /* Desktop responsive sizing */
  @media (min-width: 600px) {
    #ekho-window {
      bottom: 24px; right: 24px;
      width: min(420px, calc(100vw - 48px));
      height: min(700px, calc(100vh - 48px));
      border-radius: 14px;
      border-bottom: 1px solid #E8E9EA;
      box-shadow: 0 8px 36px rgba(0,0,0,0.13);
    }
  }

  @media (min-width: 900px) {
    #ekho-window {
      width: min(450px, calc(100vw - 48px));
      height: min(750px, calc(100vh - 48px));
    }
  }

  /* Alert banner */
  #ekho-alert {
    background: #C8102E; color: #fff;
    font-size: 12px;
    font-family: 'Source Sans 3', sans-serif;
    font-weight: 600; padding: 8px 14px;
    text-align: center; display: none;
    flex-shrink: 0;
    border-bottom: 1px solid #a00d24;
    animation: ekho-pulse 2s infinite;
  }
  @keyframes ekho-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.85; }
  }

  /* Header with language selector */
  #ekho-header {
    background: #C8102E;
    padding: 0 14px; height: 58px;
    display: flex; align-items: center; gap: 11px;
    border-bottom: 2px solid #a00d24; flex-shrink: 0;
    position: relative;
  }

  .ekho-logo {
    width: 36px; height: 36px; border-radius: 50%;
    background: #fff;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }

  .ekho-header-text { flex: 1; }
  .ekho-header-title {
    font-family: 'Libre Baskerville', serif;
    font-size: 16px; font-weight: 700;
    color: #fff; letter-spacing: 0.01em; margin: 0;
  }
  .ekho-header-sub {
    font-size: 11px; color: rgba(255,255,255,0.65);
    margin: 2px 0 0; letter-spacing: 0.03em;
    text-transform: uppercase; font-weight: 500;
  }

  /* Language selector button */
  #ekho-lang-btn {
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    padding: 5px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-family: 'Source Sans 3', sans-serif;
    transition: background 0.15s;
    white-space: nowrap;
  }
  #ekho-lang-btn:hover {
    background: rgba(255,255,255,0.25);
  }

  /* Language dropdown menu */
  #ekho-lang-dropdown {
    position: absolute;
    top: 56px;
    right: 48px;
    background: #fff;
    border: 1px solid #E8E9EA;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    display: none;
    flex-direction: column;
    max-height: 300px;
    overflow-y: auto;
    z-index: 10000;
    min-width: 140px;
  }
  #ekho-lang-dropdown.show {
    display: flex;
  }
  .ekho-lang-option {
    padding: 10px 14px;
    font-size: 13px;
    color: #1a1a1a;
    cursor: pointer;
    border-bottom: 1px solid #F7F7F8;
    transition: background 0.1s;
    font-family: 'Source Sans 3', sans-serif;
  }
  .ekho-lang-option:last-child {
    border-bottom: none;
  }
  .ekho-lang-option:hover {
    background: #F7F7F8;
  }
  .ekho-lang-option.active {
    background: #C8102E;
    color: #fff;
    font-weight: 600;
  }

  #ekho-close {
    background: none; border: none; cursor: pointer;
    color: rgba(255,255,255,0.7); font-size: 18px;
    padding: 4px; line-height: 1;
  }
  #ekho-close:hover { color: #fff; }

  /* Messages area */
  #ekho-messages {
    flex: 1;
    overflow-y: auto;
    padding: 13px;
    display: flex;
    flex-direction: column;
    gap: 9px;
    background: #F7F7F8;
    scrollbar-width: thin;
    scrollbar-color: #E8E9EA transparent;
    min-height: 0;
  }
  #ekho-messages::before {
    content: '';
    flex: 1;
  }

  /* Message rows */
  .ekho-row { display: flex; align-items: flex-end; gap: 6px; padding: 0 2px; }
  .ekho-row.user { flex-direction: row-reverse; padding: 0; }

  .ekho-avatar {
    width: 26px; height: 26px; border-radius: 50%;
    background: #C8102E; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }

  /* Message bubbles */
  .ekho-msg {
    max-width: 80%; padding: 9px 13px;
    font-size: 14px; line-height: 1.55; border-radius: 14px;
  }
  .ekho-msg.bot {
    background: #fff; color: #1a1a1a;
    border: 1px solid #E8E9EA;
    border-bottom-left-radius: 3px;
  }
  .ekho-msg.user {
    background: #C8102E; color: #fff;
    border-bottom-right-radius: 3px; margin-right: 0;
  }
  .ekho-msg.hint {
    background: transparent; color: #A7A9AC;
    border: none; font-size: 12px;
    font-style: italic; padding: 1px 3px;
  }
  .ekho-msg.coming-soon {
    background: #f9f9f9; color: #6b6d6f;
    border: 1px solid #E8E9EA;
    border-bottom-left-radius: 3px; font-size: 13px;
  }

  /* Chip bar - 5 columns for cleaner layout */
  #ekho-chip-bar {
    padding: 6px 8px; background: #fff;
    border-top: 1px solid #E8E9EA;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 3px;
    flex-shrink: 0;
  }

  /* Chips with consistent font size */
  .ekho-chip {
    font-size: 11px; 
    padding: 6px 4px; 
    border-radius: 20px;
    border: 1.5px solid #C8102E; 
    color: #C8102E;
    background: #fff; 
    cursor: pointer;
    font-family: 'Source Sans 3', sans-serif; 
    font-weight: 600;
    transition: all 0.15s; 
    white-space: nowrap;
    overflow: hidden; 
    text-overflow: ellipsis; 
    text-align: center;
  }
  .ekho-chip:hover { background: #C8102E; color: #fff; }
  .ekho-chip.home { border-color: #C8102E; color: #C8102E; background: #fff; }
  .ekho-chip.home:hover { background: #C8102E; color: #fff; }
  .ekho-chip.future { border-color: #A7A9AC; color: #A7A9AC; background: #F7F7F8; }
  .ekho-chip.future:hover { background: #A7A9AC; color: #fff; border-color: #A7A9AC; }

  /* Input area */
  #ekho-input-area {
    padding: 9px 12px; background: #fff;
    display: flex; gap: 8px; align-items: center;
    border-top: 1px solid #E8E9EA; flex-shrink: 0;
  }

  #ekho-input {
    flex: 1; border: 1.5px solid #E8E9EA; border-radius: 20px;
    padding: 9px 15px; font-size: 14px;
    font-family: 'Source Sans 3', sans-serif;
    background: #F7F7F8; color: #1a1a1a; outline: none;
    transition: border-color 0.15s;
  }
  #ekho-input:focus { border-color: #C8102E; background: #fff; }
  #ekho-input::placeholder { color: #A7A9AC; }

  #ekho-send {
    width: 40px; height: 40px; border-radius: 50%;
    background: #C8102E; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background 0.15s;
  }
  #ekho-send:hover { background: #a00d24; }

  /* Typing indicator */
  .ekho-typing {
    display: flex; gap: 3px; align-items: center;
    padding: 9px 13px; background: #fff;
    border: 1px solid #E8E9EA; border-radius: 14px;
    border-bottom-left-radius: 3px; width: fit-content;
  }
  .ekho-typing span {
    width: 5px; height: 5px; border-radius: 50%;
    background: #A7A9AC; animation: ekho-blink 1.2s infinite;
  }
  .ekho-typing span:nth-child(2) { animation-delay: 0.2s; }
  .ekho-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes ekho-blink { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }
`;
document.head.appendChild(style);

/*
================================================================================
SVG ICONS
================================================================================
Dolphin icons in different colors for different contexts
*/

const dolphinWhite = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 8C20 8 18 4 12 4C7 4 4 7.5 4 12C4 14 4.5 15.5 5.5 16.5C4.5 17.5 3 18 3 18C3 18 5.5 18.5 7.5 17.5C8.8 18.4 10.3 19 12 19C17 19 20.5 15.5 20 11" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 6C17 6 19 5 21 6C21 6 20 8 18 8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const dolphinRed = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 8C20 8 18 4 12 4C7 4 4 7.5 4 12C4 14 4.5 15.5 5.5 16.5C4.5 17.5 3 18 3 18C3 18 5.5 18.5 7.5 17.5C8.8 18.4 10.3 19 12 19C17 19 20.5 15.5 20 11" stroke="#C8102E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 6C17 6 19 5 21 6C21 6 20 8 18 8" stroke="#C8102E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const dolphinBubble = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M20 8C20 8 18 4 12 4C7 4 4 7.5 4 12C4 14 4.5 15.5 5.5 16.5C4.5 17.5 3 18 3 18C3 18 5.5 18.5 7.5 17.5C8.8 18.4 10.3 19 12 19C17 19 20.5 15.5 20 11" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 6C17 6 19 5 21 6C21 6 20 8 18 8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/*
================================================================================
CHIP SETS - CURATED OPTIONS
================================================================================
Each topic shows 10 most commonly used options at CSUCI
This keeps the UI clean and reduces cognitive load for users
*/

const CHIP_SETS = {
  root: [
    { label: 'Admissions', prompt: 'Tell me about admissions at CSUCI', topic: 'admissions' },
    { label: 'Financial Aid', prompt: 'What financial aid is available at CSUCI?', topic: 'financialaid' },
    { label: 'Advising', prompt: 'Tell me about academic advising at CSUCI', topic: 'advising' },
    { label: 'Counseling', prompt: 'What counseling services does CSUCI offer?', topic: 'counseling' },
    { label: 'Housing', prompt: 'Tell me about student housing at CSUCI', topic: 'housing' },
    { label: 'Programs', prompt: 'What academic programs does CSUCI offer?', topic: 'programs' },
    { label: 'Events', prompt: 'What events are happening on campus?', topic: 'events' },
    { label: 'Services', prompt: 'What student services are available at CSUCI?', topic: 'services' },
    { label: 'Parking', prompt: 'Tell me about parking at CSUCI', topic: 'parking' },
    { label: 'Departments', prompt: 'I need to contact a CSUCI department.', topic: 'departments' },
  ],
  advising: [
    { label: 'Meet Advisor', prompt: 'How do I meet with an academic advisor at CSUCI?', topic: 'advising' },
    { label: 'Degree Plan', prompt: 'How do I plan my degree at CSUCI?', topic: 'advising' },
    { label: 'Change Major', prompt: 'How do I change my major at CSUCI?', topic: 'advising' },
    { label: 'Grad Reqs', prompt: 'What are the graduation requirements at CSUCI?', topic: 'advising' },
    { label: 'Add/Drop', prompt: 'How do I add or drop classes at CSUCI?', topic: 'advising' },
    { label: 'GE Reqs', prompt: 'What are the GE requirements at CSUCI?', topic: 'advising' },
    { label: 'Transfer Cr.', prompt: 'How do I transfer credits to CSUCI?', topic: 'advising' },
    { label: 'Waitlist', prompt: 'How does the class waitlist work at CSUCI?', topic: 'advising' },
    { label: 'Units Req.', prompt: 'How many units do I need to graduate from CSUCI?', topic: 'advising' },
    { label: 'Double Major', prompt: 'Can I double major at CSUCI?', topic: 'advising' },
  ],
  counseling: [
    { label: 'Appointment', future: true },
    { label: 'Crisis Help', prompt: 'What crisis support is available at CSUCI?', topic: 'counseling' },
    { label: 'Anxiety', prompt: 'How can CSUCI help with anxiety and stress?', topic: 'counseling' },
    { label: 'Group Therapy', prompt: 'Does CSUCI offer group therapy?', topic: 'counseling' },
    { label: 'After Hours', prompt: 'What mental health support is available after hours at CSUCI?', topic: 'counseling' },
    { label: 'Wellness', prompt: 'What wellness programs does CSUCI offer?', topic: 'counseling' },
    { label: 'Basic Needs', prompt: 'What basic needs support does CSUCI offer?', topic: 'counseling' },
    { label: 'LGBTQ+', prompt: 'What LGBTQ+ support is available at CSUCI?', topic: 'counseling' },
    { label: 'Contact', prompt: 'How do I contact CSUCI Student Counseling?', topic: 'counseling' },
    { label: 'Confidential?', prompt: 'Is CSUCI counseling confidential?', topic: 'counseling' },
  ],
  admissions: [
    { label: 'How to Apply', prompt: 'How do I apply to CSUCI?', topic: 'admissions' },
    { label: 'Transfer', prompt: 'How do I transfer to CSUCI?', topic: 'admissions' },
    { label: 'Deadlines', prompt: 'What are the application deadlines at CSUCI?', topic: 'admissions' },
    { label: 'Requirements', prompt: 'What are the admission requirements for CSUCI?', topic: 'admissions' },
    { label: 'International', prompt: 'How do international students apply to CSUCI?', topic: 'admissions' },
    { label: 'Campus Tour', prompt: 'How do I schedule a campus tour at CSUCI?', topic: 'admissions' },
    { label: 'App Status', prompt: 'How do I check my application status at CSUCI?', topic: 'admissions' },
    { label: 'GPA Required', prompt: 'What GPA do I need to get into CSUCI?', topic: 'admissions' },
    { label: 'Contact', prompt: 'How do I contact the CSUCI Admissions Office?', topic: 'admissions' },
    { label: 'Orientation', prompt: 'When is new student orientation at CSUCI?', topic: 'admissions' },
  ],
  financialaid: [
    { label: 'FAFSA', prompt: 'How do I complete the FAFSA for CSUCI?', topic: 'financialaid' },
    { label: 'Scholarships', prompt: 'What scholarships are available at CSUCI?', topic: 'financialaid' },
    { label: 'Cal Grant', prompt: 'How does Cal Grant work at CSUCI?', topic: 'financialaid' },
    { label: 'Work-Study', prompt: 'Does CSUCI offer work-study programs?', topic: 'financialaid' },
    { label: 'Deadlines', prompt: 'What are the financial aid deadlines at CSUCI?', topic: 'financialaid' },
    { label: 'Dream Act', prompt: 'How does the California Dream Act apply at CSUCI?', topic: 'financialaid' },
    { label: 'Tuition', prompt: 'What are the tuition and fees at CSUCI?', topic: 'financialaid' },
    { label: 'Aid Appeal', prompt: 'How do I appeal financial aid at CSUCI?', topic: 'financialaid' },
    { label: 'Pell Grant', prompt: 'How do I qualify for a Pell Grant at CSUCI?', topic: 'financialaid' },
    { label: 'Contact', prompt: 'How do I contact CSUCI Financial Aid Office?', topic: 'financialaid' },
  ],
  events: [
    { label: 'Calendar', future: true },
    { label: 'Clubs', prompt: 'What student clubs are at CSUCI?', topic: 'events' },
    { label: 'Orientation', prompt: 'When is new student orientation at CSUCI?', topic: 'events' },
    { label: 'Sports', prompt: 'What sports exist at CSUCI?', topic: 'events' },
    { label: 'Commencement', prompt: 'When is graduation at CSUCI?', topic: 'events' },
    { label: 'Campus Life', prompt: 'What is campus life like at CSUCI?', topic: 'events' },
    { label: 'Cultural', prompt: 'What cultural events are held at CSUCI?', topic: 'events' },
    { label: 'Volunteer', prompt: 'How do I volunteer or get service hours at CSUCI?', topic: 'events' },
    { label: 'Greek Life', prompt: 'Does CSUCI have fraternities or sororities?', topic: 'events' },
    { label: 'Fitness', prompt: 'What fitness facilities does CSUCI have?', topic: 'events' },
  ],
  housing: [
    { label: 'On-Campus', prompt: 'What on-campus housing does CSUCI offer?', topic: 'housing' },
    { label: 'Off-Campus', prompt: 'Are there off-campus housing resources at CSUCI?', topic: 'housing' },
    { label: 'Costs', prompt: 'How much does CSUCI housing cost?', topic: 'housing' },
    { label: 'Apply', prompt: 'How do I apply for CSUCI housing?', topic: 'housing' },
    { label: 'Meal Plans', prompt: 'What meal plans are available at CSUCI?', topic: 'housing' },
    { label: 'Roommates', prompt: 'How does CSUCI match roommates?', topic: 'housing' },
    { label: 'Move-In', prompt: 'When are the move-in dates for CSUCI housing?', topic: 'housing' },
    { label: 'Dining', prompt: 'Where can I eat on campus at CSUCI?', topic: 'housing' },
    { label: 'Contact', prompt: 'How do I contact the CSUCI Housing Office?', topic: 'housing' },
    { label: 'Parking', prompt: 'Is parking available for CSUCI residents?', topic: 'housing' },
  ],
  programs: [
    { label: 'Undergrad', prompt: 'What undergrad majors does CSUCI offer?', topic: 'programs' },
    { label: 'Graduate', prompt: 'What graduate programs does CSUCI offer?', topic: 'programs' },
    { label: 'Online', prompt: 'Does CSUCI offer online degrees?', topic: 'programs' },
    { label: 'Minors', prompt: 'What minors does CSUCI offer?', topic: 'programs' },
    { label: 'Business', prompt: 'What business programs does CSUCI offer?', topic: 'programs' },
    { label: 'STEM', prompt: 'What STEM programs does CSUCI offer?', topic: 'programs' },
    { label: 'Education', prompt: 'What education programs does CSUCI offer?', topic: 'programs' },
    { label: 'Nursing', prompt: 'Does CSUCI offer nursing?', topic: 'programs' },
    { label: 'CS / IT', prompt: 'What computer science programs does CSUCI offer?', topic: 'programs' },
    { label: 'Study Abroad', prompt: 'What study abroad programs does CSUCI offer?', topic: 'programs' },
  ],
  departments: [
    { label: 'Admissions', prompt: 'How do I contact CSUCI Admissions?', topic: 'departments' },
    { label: 'Financial Aid', prompt: 'How do I contact CSUCI Financial Aid?', topic: 'departments' },
    { label: 'Registrar', prompt: 'How do I contact the CSUCI Registrar?', topic: 'departments' },
    { label: 'IT Help Desk', prompt: 'How do I contact the CSUCI IT Help Desk?', topic: 'departments' },
    { label: 'Health Ctr', prompt: 'How do I contact CSUCI Student Health Services?', topic: 'departments' },
    { label: 'Housing', prompt: 'How do I contact the CSUCI Housing Office?', topic: 'departments' },
    { label: 'Advising', prompt: 'How do I contact Academic Advising at CSUCI?', topic: 'departments' },
    { label: 'Campus Police', prompt: 'How do I contact CSUCI Campus Police?', topic: 'departments' },
    { label: 'Library', prompt: 'How do I contact the CSUCI library?', topic: 'departments' },
    { label: 'Career Ctr', prompt: 'How do I contact the CSUCI Career Center?', topic: 'departments' },
  ],
  parking: [
    { label: 'Buy Permit', prompt: 'How do I buy a parking permit at CSUCI?', topic: 'parking' },
    { label: 'Visitor', prompt: 'Where can visitors park at CSUCI?', topic: 'parking' },
    { label: 'Campus Map', prompt: 'Where can I find a campus map for CSUCI?', topic: 'parking' },
    { label: 'ADA Parking', prompt: 'Where is ADA parking at CSUCI?', topic: 'parking' },
    { label: 'Citations', prompt: 'How do I dispute a parking citation at CSUCI?', topic: 'parking' },
    { label: 'Daily Permit', prompt: 'How do I buy a daily parking permit at CSUCI?', topic: 'parking' },
    { label: 'Cost', prompt: 'How much does a parking permit cost at CSUCI?', topic: 'parking' },
    { label: 'Contact', prompt: 'How do I contact CSUCI Parking Services?', topic: 'parking' },
    { label: 'Transit', prompt: 'What public transit options are near CSUCI?', topic: 'parking' },
    { label: 'Shuttle', prompt: 'Does CSUCI offer a shuttle service?', topic: 'parking' },
  ],
  services: [
    { label: 'Tutoring', prompt: 'What tutoring does CSUCI offer?', topic: 'services' },
    { label: 'Writing Ctr', prompt: 'How do I use the CSUCI writing center?', topic: 'services' },
    { label: 'Disability', prompt: 'What disability services does CSUCI provide?', topic: 'services' },
    { label: 'Food Pantry', prompt: 'Does CSUCI have a food pantry?', topic: 'services' },
    { label: 'Career Help', prompt: 'What career resources does CSUCI offer?', topic: 'services' },
    { label: 'Library', prompt: 'How do I access the CSUCI library?', topic: 'services' },
    { label: 'Veterans', prompt: 'What services does CSUCI offer for veterans?', topic: 'services' },
    { label: 'LGBTQ+', prompt: 'What LGBTQ+ support is available at CSUCI?', topic: 'services' },
    { label: 'International', prompt: 'What services exist for international students at CSUCI?', topic: 'services' },
    { label: 'Health', prompt: 'What student health services does CSUCI offer?', topic: 'services' },
  ],
};

/*
================================================================================
CHIP SET DETECTION
================================================================================
*/

/*
FUNCTION: detectChipSet
PURPOSE: Analyze bot response and determine which chip set to display next
PARAMETERS: t (string) - Bot's response text
RETURNS: String key for CHIP_SETS
*/
function detectChipSet(t) {
  t = t.toLowerCase();
  if (t.match(/advis|degree plan|change major|graduation req|add.drop|transfer credit|waitlist|units/)) return 'advising';
  if (t.match(/counsel|mental health|anxiety|stress|therapy|wellness|crisis/)) return 'counseling';
  if (t.match(/admission|apply|application|transfer|enrollment|freshman|acceptance/)) return 'admissions';
  if (t.match(/financial aid|fafsa|scholarship|grant|work.study|loan|tuition|fee|pell/)) return 'financialaid';
  if (t.match(/event|calendar|orientation|club|activity|sport|commencement|intramural/)) return 'events';
  if (t.match(/hous|dorm|resident|apartment|meal plan|dining/)) return 'housing';
  if (t.match(/major|program|degree|minor|certificate|graduate|undergrad|nursing|cs|stem/)) return 'programs';
  if (t.match(/contact|phone|email|office hours|registrar|it help|campus police|dean/)) return 'departments';
  if (t.match(/park|permit|map|lot|visitor|ada|shuttle|ev charging|carpool/)) return 'parking';
  if (t.match(/tutor|writing|disabilit|food|pantry|career|library|veteran|lgbtq|printing/)) return 'services';
  return 'root';
}

/*
================================================================================
DOM CREATION
================================================================================
*/

// Launcher (speech bubble + chat bubble)
const launcher = document.createElement('div');
launcher.id = 'ekho-launcher';

const speech = document.createElement('div');
speech.id = 'ekho-speech';
speech.textContent = 'Need some help? 🐬';
speech.onclick = () => openChat();

const bubble = document.createElement('div');
bubble.id = 'ekho-bubble';
bubble.title = 'Chat with EkhoBot';
bubble.innerHTML = dolphinBubble;
bubble.onclick = () => openChat();

launcher.appendChild(speech);
launcher.appendChild(bubble);

// Chat window with language selector
const win = document.createElement('div');
win.id = 'ekho-window';
win.innerHTML = `
  <div id="ekho-header">
    <div class="ekho-logo">${dolphinRed}</div>
    <div class="ekho-header-text">
      <p class="ekho-header-title">EkhoBot</p>
      <p class="ekho-header-sub">CSU Channel Islands</p>
    </div>
    <button id="ekho-lang-btn">EN | ES | 日本語</button>
    <button id="ekho-close">&#x2715;</button>
  </div>
  <div id="ekho-lang-dropdown"></div>
  <div id="ekho-alert"></div>
  <div id="ekho-messages"></div>
  <div id="ekho-chip-bar"></div>
  <div id="ekho-input-area">
    <input id="ekho-input" type="text" placeholder="Ask EkhoBot anything..." />
    <button id="ekho-send">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
    </button>
  </div>
`;

document.body.appendChild(launcher);
document.body.appendChild(win);

// Build language dropdown with all options
const dropdown = document.getElementById('ekho-lang-dropdown');
LANGUAGES.forEach(lang => {
  const opt = document.createElement('div');
  opt.className = 'ekho-lang-option';
  opt.textContent = lang.label;
  if (lang.code === 'en') opt.classList.add('active');
  opt.onclick = () => selectLanguage(lang);
  dropdown.appendChild(opt);
});

/*
================================================================================
LANGUAGE SELECTOR
================================================================================
*/

let dropdownOpen = false;

/*
Language button click handler
When clicked:
1. Opens/closes dropdown
2. Shows multilingual greeting asking which language to use
*/
document.getElementById('ekho-lang-btn').onclick = (e) => {
  e.stopPropagation();
  dropdownOpen = !dropdownOpen;
  dropdown.classList.toggle('show', dropdownOpen);
  
  // Show multilingual greeting when dropdown opens (after chat initialized)
  if (dropdownOpen && chatInitialized) {
    addBotMessage("Which language would you like me to use?\n¿En qué idioma te gustaría que te ayude?\nどの言語でお手伝いしましょうか？");
  }
};

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (dropdownOpen && !dropdown.contains(e.target)) {
    dropdownOpen = false;
    dropdown.classList.remove('show');
  }
});

/*
FUNCTION: selectLanguage
PURPOSE: Handle language selection from dropdown
PARAMETERS: lang (object) - Selected language with code, label, and prompt
PROCESS:
  1. Update current language state
  2. Highlight selected language in dropdown
  3. Close dropdown
  4. Show user's selection as message
  5. Send language prompt to backend
  6. Bot responds in selected language from now on
*/
function selectLanguage(lang) {
  currentLanguage = lang.code;
  
  // Update active state in dropdown
  dropdown.querySelectorAll('.ekho-lang-option').forEach(opt => {
    opt.classList.remove('active');
    if (opt.textContent === lang.label) {
      opt.classList.add('active');
    }
  });
  
  // Close dropdown
  dropdownOpen = false;
  dropdown.classList.remove('show');
  
  // Show selection in chat and switch language
  addUserMessage(lang.label);
  history.push({ role: 'user', content: lang.prompt });
  showTyping();
  fetchReply('root');
}

/*
================================================================================
ALERT SYSTEM
================================================================================
*/

/*
FUNCTION: setAlert
PURPOSE: Display or hide campus-wide alert banner
PARAMETERS: message (string) - Alert text, empty string to hide
*/
function setAlert(message) {
  const alertBar = document.getElementById('ekho-alert');
  if (message) {
    alertBar.textContent = '🚨 ' + message;
    alertBar.style.display = 'block';
  } else {
    alertBar.style.display = 'none';
  }
}

/*
================================================================================
CHAT WINDOW CONTROLS
================================================================================
*/

/*
FUNCTION: openChat
PURPOSE: Show chat window and fetch active alerts
*/
async function openChat() {
  win.style.display = 'flex';
  win.style.flexDirection = 'column';
  launcher.classList.add('hidden');

  // Fetch active alerts from backend
  try {
    const res = await fetch('http://localhost:3000/alert');
    const data = await res.json();
    setAlert(data.alert);
  } catch (e) {
    // Silent fail if backend unreachable
  }

  // Show welcome message on first open
  if (!chatInitialized) {
    chatInitialized = true;
    addBotMessage("Hi! I'm EkhoBot, your CSUCI virtual assistant. What can I help you with today?\n\nTambién puedo ayudarte en español. 日本語でもお手伝いできます。");
    addHint("Choose a topic below or type your question.");
    renderChips('root');
  }
}

/*
FUNCTION: closeChat
PURPOSE: Hide chat window and show launcher
*/
function closeChat() {
  win.style.display = 'none';
  launcher.classList.remove('hidden');
  // Close language dropdown if open
  dropdownOpen = false;
  dropdown.classList.remove('show');
}

// Event listeners
document.getElementById('ekho-close').onclick = closeChat;
document.getElementById('ekho-send').onclick = sendMessage;
document.getElementById('ekho-input').onkeydown = e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
};
// Prevent keyboard shortcuts from affecting parent page
document.getElementById('ekho-input').addEventListener('keydown', e => {
  e.stopPropagation();
});

/*
================================================================================
CHIP RENDERING - 5 COLUMN LAYOUT
================================================================================
*/

/*
FUNCTION: renderChips
PURPOSE: Display 10 curated chips + Home button in 5-column grid
PARAMETERS: topicKey (string) - Which chip set to display

Layout:
  - Root: 10 chips (2 rows of 5)
  - Sub-topics: 10 chips + Home button (fills 11 spots in 5-column grid)
*/
function renderChips(topicKey) {
  currentTopic = topicKey;
  const bar = document.getElementById('ekho-chip-bar');
  bar.innerHTML = '';
  
  const chips = CHIP_SETS[topicKey] || CHIP_SETS.root;
  const isRoot = topicKey === 'root';
  
  // Show first 10 chips (most commonly used at CSUCI)
  chips.slice(0, 10).forEach(c => addChipBtn(bar, c));
  
  // Add Home button if not on root (11th button)
  if (!isRoot) {
    const home = document.createElement('button');
    home.className = 'ekho-chip home';
    home.textContent = '🏠 Home';
    home.onclick = () => renderChips('root');
    bar.appendChild(home);
  }
}

/*
FUNCTION: addChipBtn
PURPOSE: Create and append a single chip button
PARAMETERS: bar (element) - Container to append to
            chip (object) - Chip configuration with label, prompt, topic
*/
function addChipBtn(bar, chip) {
  const { label, prompt, topic, future } = chip;
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.title = label;
  
  if (future) {
    // Coming soon feature
    btn.className = 'ekho-chip future';
    btn.onclick = () => addComingSoon(label);
  } else {
    // Normal chip - sends question and shows response
    btn.className = 'ekho-chip';
    btn.onclick = () => {
      addUserMessage(label);
      history.push({ role: 'user', content: prompt });
      showTyping();
      fetchReply(topic);
    };
  }
  
  bar.appendChild(btn);
}

/*
================================================================================
SOCIAL MEDIA LINK DETECTION
================================================================================
Map of social media patterns to URLs for automatic linking
*/
const socialMap = {
  'instagram: @csuci': 'https://www.instagram.com/csuci',
  'twitter/x: @csuci': 'https://twitter.com/csuci',
  'twitter: @csuci': 'https://twitter.com/csuci',
  'facebook: csu channel islands': 'https://www.facebook.com/CSUChannelIslands',
  'youtube: youtube.com/user/ciwatch': 'https://www.youtube.com/user/ciwatch',
  'pinterest: @csuci': 'https://www.pinterest.com/csuci',
  '@csuci': 'https://www.instagram.com/csuci',
};

/*
================================================================================
MESSAGE DISPLAY FUNCTIONS
================================================================================
*/

/*
FUNCTION: addBotMessage
PURPOSE: Display bot message with automatic link detection
PARAMETERS: text (string) - Message text with newlines

Automatically converts URLs and social media mentions into clickable links
*/
function addBotMessage(text) {
  const msgs = document.getElementById('ekho-messages');
  const row = document.createElement('div');
  row.className = 'ekho-row';
  
  const avatar = document.createElement('div');
  avatar.className = 'ekho-avatar';
  avatar.innerHTML = dolphinWhite;
  
  const msg = document.createElement('div');
  msg.className = 'ekho-msg bot';

  // Process each line separately to preserve line breaks
  text.split('\n').forEach((line, i) => {
    if (i > 0) msg.appendChild(document.createElement('br'));
    
    const lineLower = line.toLowerCase().trim();
    let matched = false;

    // Check for social media patterns
    for (const [key, url] of Object.entries(socialMap)) {
      if (lineLower.includes(key)) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          // Split at colon and make second part a link
          msg.appendChild(document.createTextNode(line.slice(0, colonIdx + 1) + ' '));
          const a = document.createElement('a');
          a.href = url;
          a.textContent = line.slice(colonIdx + 1).trim();
          a.target = '_blank';
          a.style.cssText = 'color:#C8102E;font-weight:600;text-decoration:none;';
          a.onmouseover = () => a.style.textDecoration = 'underline';
          a.onmouseout = () => a.style.textDecoration = 'none';
          msg.appendChild(a);
          matched = true;
          break;
        }
      }
    }

    // If no social media match, check for regular URLs
    if (!matched) {
      if (line.match(/https?:\/\/|www\.|csuci\.edu/i)) {
        // Split line by URLs and linkify them
        const parts = line.split(/((?:https?:\/\/|www\.)\S+|csuci\.edu\S*)/gi);
        parts.forEach(part => {
          if (part.match(/https?:\/\/|www\.|csuci\.edu/i)) {
            const a = document.createElement('a');
            a.href = part.startsWith('http') ? part : 'https://' + part;
            a.textContent = part;
            a.target = '_blank';
            a.style.cssText = 'color:#C8102E;text-decoration:underline;word-break:break-all;';
            msg.appendChild(a);
          } else {
            msg.appendChild(document.createTextNode(part));
          }
        });
      } else {
        // Plain text line
        msg.appendChild(document.createTextNode(line));
      }
    }
  });

  row.appendChild(avatar);
  row.appendChild(msg);
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

/*
FUNCTION: addComingSoon
PURPOSE: Display "coming soon" message for unimplemented features
PARAMETERS: name (string) - Feature name
*/
function addComingSoon(name) {
  const msgs = document.getElementById('ekho-messages');
  const row = document.createElement('div');
  row.className = 'ekho-row';
  
  const avatar = document.createElement('div');
  avatar.className = 'ekho-avatar';
  avatar.innerHTML = dolphinWhite;
  
  const msg = document.createElement('div');
  msg.className = 'ekho-msg coming-soon';
  msg.textContent = `${name} is coming soon — this feature is in development.`;
  
  row.appendChild(avatar);
  row.appendChild(msg);
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

/*
FUNCTION: addHint
PURPOSE: Display grey hint text message
PARAMETERS: text (string) - Hint text
*/
function addHint(text) {
  const msgs = document.getElementById('ekho-messages');
  const msg = document.createElement('div');
  msg.className = 'ekho-msg hint';
  msg.textContent = text;
  msgs.appendChild(msg);
  msgs.scrollTop = msgs.scrollHeight;
}

/*
FUNCTION: addUserMessage
PURPOSE: Display user message (right-aligned, red background)
PARAMETERS: text (string) - User's message
*/
function addUserMessage(text) {
  const msgs = document.getElementById('ekho-messages');
  const row = document.createElement('div');
  row.className = 'ekho-row user';
  
  const msg = document.createElement('div');
  msg.className = 'ekho-msg user';
  msg.textContent = text;
  
  row.appendChild(msg);
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

/*
FUNCTION: showTyping
PURPOSE: Display animated typing indicator
*/
function showTyping() {
  const msgs = document.getElementById('ekho-messages');
  const row = document.createElement('div');
  row.className = 'ekho-row';
  row.id = 'ekho-typing-row';
  
  const avatar = document.createElement('div');
  avatar.className = 'ekho-avatar';
  avatar.innerHTML = dolphinWhite;
  
  const typing = document.createElement('div');
  typing.className = 'ekho-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  
  row.appendChild(avatar);
  row.appendChild(typing);
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

/*
FUNCTION: removeTyping
PURPOSE: Remove typing indicator
*/
function removeTyping() {
  document.getElementById('ekho-typing-row')?.remove();
}

/*
================================================================================
MESSAGE SENDING
================================================================================
*/

/*
FUNCTION: sendMessage
PURPOSE: Send user's typed message to backend
*/
async function sendMessage() {
  const input = document.getElementById('ekho-input');
  const text = input.value.trim();
  if (!text) return;
  
  input.value = '';
  addUserMessage(text);
  history.push({ role: 'user', content: text });
  showTyping();
  await fetchReply(null);
}

/*
FUNCTION: fetchReply
PURPOSE: Call backend API and display response
PARAMETERS: forcedTopic (string|null) - Override chip detection

Process:
  1. Send conversation history to backend
  2. Backend uses vector search + Claude AI
  3. Display response
  4. Show relevant chip set based on response content
*/
async function fetchReply(forcedTopic) {
  try {
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history })
    });
    
    const data = await res.json();
    removeTyping();
    addBotMessage(data.reply);
    history.push({ role: 'assistant', content: data.reply });
    
    // Show relevant chips based on response or forced topic
    renderChips(forcedTopic || detectChipSet(data.reply));
    
  } catch (e) {
    removeTyping();
    addBotMessage('EkhoBot is offline right now. Try again shortly!');
    renderChips('root');
  }
}
