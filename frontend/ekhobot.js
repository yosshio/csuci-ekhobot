const BACKEND_URL = 'http://localhost:3000/chat';
let history = [];
let currentTopic = 'root';
let chipsExpanded = false;

const style = document.createElement('style');
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@400;500;600&display=swap');

  #ekho-bubble {
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    width: 56px; height: 56px; border-radius: 50%;
    background: #C8102E; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(200,16,46,0.35);
    transition: background 0.15s, transform 0.15s, opacity 0.2s;
  }
  #ekho-bubble:hover { background: #a00d24; transform: scale(1.05); }
  #ekho-bubble.hidden { opacity: 0; pointer-events: none; }

  #ekho-window {
    position: fixed;
    bottom: 0; right: 0;
    width: min(480px, 100vw);
    height: min(700px, 100vh);
    background: #ffffff;
    border-radius: 16px 16px 0 0;
    border: 1px solid #E8E9EA;
    border-bottom: none;
    box-shadow: 0 -4px 32px rgba(0,0,0,0.12);
    display: none; flex-direction: column;
    font-family: 'Source Sans 3', sans-serif;
    overflow: hidden;
    z-index: 9998;
    transition: height 0.2s ease, width 0.2s ease;
  }

  @media (min-width: 600px) {
    #ekho-window {
      bottom: 24px; right: 24px;
      width: min(460px, calc(100vw - 48px));
      height: min(680px, calc(100vh - 48px));
      border-radius: 16px;
      border-bottom: 1px solid #E8E9EA;
      box-shadow: 0 8px 40px rgba(0,0,0,0.14);
    }
  }

  @media (min-width: 900px) {
    #ekho-window {
      width: min(520px, calc(100vw - 48px));
      height: min(720px, calc(100vh - 48px));
    }
  }

  #ekho-header {
    background: #C8102E; padding: 0 18px; height: 54px;
    display: flex; align-items: center; gap: 10px;
    border-bottom: 2px solid #a00d24; flex-shrink: 0;
  }

  .ekho-logo {
    width: 34px; height: 34px; border-radius: 50%; background: #fff;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }

  .ekho-header-text { flex: 1; }
  .ekho-header-title {
    font-family: 'Libre Baskerville', serif; font-size: 15px; font-weight: 700;
    color: #fff; letter-spacing: 0.01em; margin: 0;
  }
  .ekho-header-sub {
    font-size: 10px; color: rgba(255,255,255,0.65); margin: 1px 0 0;
    letter-spacing: 0.03em; text-transform: uppercase; font-weight: 500;
  }

  #ekho-close {
    background: none; border: none; cursor: pointer;
    color: rgba(255,255,255,0.7); font-size: 18px; padding: 4px; line-height: 1;
  }
  #ekho-close:hover { color: #fff; }

  #ekho-messages {
    flex: 1; overflow-y: auto; padding: 16px 14px;
    display: flex; flex-direction: column; gap: 11px;
    background: #F7F7F8; scrollbar-width: thin; scrollbar-color: #E8E9EA transparent;
  }

  .ekho-row { display: flex; align-items: flex-end; gap: 7px; padding: 0 4px; }
  .ekho-row.user { flex-direction: row-reverse; padding: 0; }

  .ekho-avatar {
    width: 28px; height: 28px; border-radius: 50%; background: #C8102E;
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  }

  .ekho-msg {
    max-width: 78%; padding: 10px 14px;
    font-size: 13.5px; line-height: 1.6; border-radius: 16px;
  }
  .ekho-msg.bot {
    background: #fff; color: #1a1a1a;
    border: 1px solid #E8E9EA; border-bottom-left-radius: 4px;
  }
  .ekho-msg.user {
    background: #C8102E; color: #fff;
    border-bottom-right-radius: 4px; margin-right: 0;
  }
  .ekho-msg.hint {
    background: transparent; color: #B0B0B0;
    border: none; font-size: 12px; font-style: italic; padding: 2px 4px;
  }
  .ekho-msg.coming-soon {
    background: #fff8e6; color: #92610a;
    border: 1px solid #f5d97a; border-bottom-left-radius: 4px;
    font-size: 13px;
  }

  #ekho-chip-bar {
    padding: 8px 12px; background: #fff;
    border-top: 1px solid #F0F0F0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    flex-shrink: 0;
  }

  .ekho-chip {
    font-size: 11.5px; padding: 6px 6px; border-radius: 20px;
    border: 1.5px solid #C8102E; color: #C8102E;
    background: #fff; cursor: pointer;
    font-family: 'Source Sans 3', sans-serif; font-weight: 500;
    transition: all 0.15s; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; text-align: center;
  }
  .ekho-chip:hover { background: #C8102E; color: #fff; }

  .ekho-chip.secondary {
    border-color: #A7A9AC; color: #6b6d6f;
  }
  .ekho-chip.secondary:hover { background: #A7A9AC; color: #fff; border-color: #A7A9AC; }

  .ekho-chip.future {
    border-color: #C8A000; color: #92610a; background: #fffbf0;
  }
  .ekho-chip.future:hover { background: #C8A000; color: #fff; border-color: #C8A000; }

  #ekho-input-area {
    padding: 10px 14px; background: #fff;
    display: flex; gap: 9px; align-items: center;
    border-top: 1px solid #E8E9EA; flex-shrink: 0;
  }

  #ekho-input {
    flex: 1; border: 1.5px solid #E8E9EA; border-radius: 24px;
    padding: 9px 16px; font-size: 13.5px;
    font-family: 'Source Sans 3', sans-serif;
    background: #F7F7F8; color: #1a1a1a; outline: none;
    transition: border-color 0.15s;
  }
  #ekho-input:focus { border-color: #C8102E; background: #fff; }
  #ekho-input::placeholder { color: #B0B0B0; }

  #ekho-send {
    width: 36px; height: 36px; border-radius: 50%;
    background: #C8102E; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background 0.15s;
  }
  #ekho-send:hover { background: #a00d24; }

  .ekho-typing {
    display: flex; gap: 4px; align-items: center;
    padding: 11px 15px; background: #fff;
    border: 1px solid #E8E9EA; border-radius: 16px;
    border-bottom-left-radius: 4px; width: fit-content;
  }
  .ekho-typing span {
    width: 6px; height: 6px; border-radius: 50%;
    background: #A7A9AC; animation: ekho-blink 1.2s infinite;
  }
  .ekho-typing span:nth-child(2) { animation-delay: 0.2s; }
  .ekho-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes ekho-blink { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }
`;
document.head.appendChild(style);

const dolphinWhite = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 8C20 8 18 4 12 4C7 4 4 7.5 4 12C4 14 4.5 15.5 5.5 16.5C4.5 17.5 3 18 3 18C3 18 5.5 18.5 7.5 17.5C8.8 18.4 10.3 19 12 19C17 19 20.5 15.5 20 11" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 6C17 6 19 5 21 6C21 6 20 8 18 8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const dolphinRed = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 8C20 8 18 4 12 4C7 4 4 7.5 4 12C4 14 4.5 15.5 5.5 16.5C4.5 17.5 3 18 3 18C3 18 5.5 18.5 7.5 17.5C8.8 18.4 10.3 19 12 19C17 19 20.5 15.5 20 11" stroke="#C8102E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 6C17 6 19 5 21 6C21 6 20 8 18 8" stroke="#C8102E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const CHIP_SETS = {
  root: [
    { label: 'Admissions',       prompt: 'Tell me about admissions at CSUCI',                  topic: 'admissions' },
    { label: 'Financial Aid',    prompt: 'What financial aid options are available at CSUCI?',  topic: 'financialaid' },
    { label: 'Academic Advising',prompt: 'Tell me about academic advising at CSUCI',            topic: 'advising' },
    { label: 'Counseling',       prompt: 'What counseling and mental health services does CSUCI offer?', topic: 'counseling' },
    { label: 'Event Calendar',   future: true },
    { label: 'Book Appointment', future: true },
    { label: 'Housing',          prompt: 'Tell me about student housing at CSUCI',              topic: 'housing' },
    { label: 'Academic Programs',prompt: 'What academic programs does CSUCI offer?',            topic: 'programs' },
    { label: 'Contact a Dept',   prompt: 'I need to contact a CSUCI department. Which one?',   topic: 'departments' },
    { label: 'Student Services', prompt: 'What student services are available at CSUCI?',      topic: 'services' },
    { label: 'Parking & Maps',   prompt: 'Where can I find parking and campus maps at CSUCI?', topic: 'parking' },
    { label: 'Campus Events',    prompt: 'What events are happening on campus?',               topic: 'events' },
  ],
  advising: [
    { label: 'Meet an Advisor',  prompt: 'How do I meet with an academic advisor at CSUCI?',          topic: 'advising' },
    { label: 'Degree Planning',  prompt: 'How do I plan my degree at CSUCI?',                          topic: 'advising' },
    { label: 'Change Major',     prompt: 'How do I change my major at CSUCI?',                         topic: 'advising' },
    { label: 'Grad Requirements',prompt: 'What are the graduation requirements at CSUCI?',             topic: 'advising' },
    { label: 'Add/Drop Classes', prompt: 'How do I add or drop classes at CSUCI?',                    topic: 'advising' },
    { label: 'GE Requirements',  prompt: 'What are the general education requirements at CSUCI?',     topic: 'advising' },
    { label: 'Probation',        prompt: 'What is academic probation and how does it work at CSUCI?', topic: 'advising' },
    { label: 'Transfer Credits', prompt: 'How do I transfer credits to CSUCI?',                       topic: 'advising' },
    { label: 'Book Appointment', future: true },
    { label: 'Study Abroad',     prompt: 'What study abroad options does CSUCI offer?',               topic: 'advising' },
  ],
  counseling: [
    { label: 'Book Appointment', future: true },
    { label: 'Crisis Support',   prompt: 'What crisis support resources are available at CSUCI?',       topic: 'counseling' },
    { label: 'Anxiety & Stress', prompt: 'How can CSUCI help with anxiety and stress management?',      topic: 'counseling' },
    { label: 'Group Therapy',    prompt: 'Does CSUCI offer group therapy or support groups?',           topic: 'counseling' },
    { label: 'After Hours',      prompt: 'What mental health support is available after hours at CSUCI?', topic: 'counseling' },
    { label: 'Wellness',         prompt: 'What wellness programs does CSUCI offer?',                    topic: 'counseling' },
    { label: 'Basic Needs',      prompt: 'What basic needs support does CSUCI offer?',                 topic: 'counseling' },
    { label: 'LGBTQ+ Support',   prompt: 'What LGBTQ+ mental health support is available at CSUCI?',   topic: 'counseling' },
    { label: 'Contact Us',       prompt: 'How do I contact CSUCI Student Counseling Services?',        topic: 'counseling' },
    { label: 'Online Resources', prompt: 'What online mental health resources does CSUCI provide?',    topic: 'counseling' },
  ],
  admissions: [
    { label: 'How to Apply',     prompt: 'How do I apply to CSUCI as a new student?',          topic: 'admissions' },
    { label: 'Transfer',         prompt: 'How do I transfer to CSUCI from another college?',   topic: 'admissions' },
    { label: 'Deadlines',        prompt: 'What are the application deadlines at CSUCI?',       topic: 'admissions' },
    { label: 'Requirements',     prompt: 'What are the admission requirements for CSUCI?',     topic: 'admissions' },
    { label: 'International',    prompt: 'How do international students apply to CSUCI?',      topic: 'admissions' },
    { label: 'Campus Tours',     prompt: 'How do I schedule a campus tour at CSUCI?',          topic: 'admissions' },
    { label: 'Waitlist',         prompt: 'How does the CSUCI admissions waitlist work?',       topic: 'admissions' },
    { label: 'App Status',       prompt: 'How do I check my application status at CSUCI?',     topic: 'admissions' },
    { label: 'High School',      prompt: 'Does CSUCI have programs for high school students?', topic: 'admissions' },
    { label: 'Early Decision',   prompt: 'Does CSUCI offer early decision or early action?',   topic: 'admissions' },
  ],
  financialaid: [
    { label: 'FAFSA',            prompt: 'How do I complete the FAFSA for CSUCI?',             topic: 'financialaid' },
    { label: 'Scholarships',     prompt: 'What scholarships are available at CSUCI?',          topic: 'financialaid' },
    { label: 'Cal Grant',        prompt: 'How does Cal Grant work at CSUCI?',                  topic: 'financialaid' },
    { label: 'Work-Study',       prompt: 'Does CSUCI offer work-study programs?',              topic: 'financialaid' },
    { label: 'Deadlines',        prompt: 'What are the financial aid deadlines at CSUCI?',     topic: 'financialaid' },
    { label: 'Dream Act',        prompt: 'How does the California Dream Act apply at CSUCI?',  topic: 'financialaid' },
    { label: 'Loans',            prompt: 'What student loan options are available at CSUCI?',  topic: 'financialaid' },
    { label: 'Tuition & Fees',   prompt: 'What are the tuition and fees at CSUCI?',            topic: 'financialaid' },
    { label: 'Aid Appeal',       prompt: 'How do I appeal my financial aid decision at CSUCI?',topic: 'financialaid' },
    { label: 'Disbursement',     prompt: 'When does financial aid get disbursed at CSUCI?',    topic: 'financialaid' },
  ],
  events: [
    { label: 'View Calendar',    future: true },
    { label: 'Clubs',            prompt: 'What student clubs and organizations are at CSUCI?',  topic: 'events' },
    { label: 'Orientation',      prompt: 'When is new student orientation at CSUCI?',           topic: 'events' },
    { label: 'Sports',           prompt: 'What sports and recreation options exist at CSUCI?',  topic: 'events' },
    { label: 'Commencement',     prompt: 'When is commencement and graduation at CSUCI?',       topic: 'events' },
    { label: 'Campus Life',      prompt: 'What is campus life like at CSUCI?',                  topic: 'events' },
    { label: 'Cultural Events',  prompt: 'What cultural events are held at CSUCI?',            topic: 'events' },
    { label: 'Volunteer',        prompt: 'How can I get community service hours at CSUCI?',    topic: 'events' },
    { label: 'Speaker Events',   prompt: 'Does CSUCI host guest speakers or lectures?',        topic: 'events' },
    { label: 'Greek Life',       prompt: 'Does CSUCI have fraternities or sororities?',        topic: 'events' },
  ],
  housing: [
    { label: 'On-Campus',        prompt: 'What on-campus housing options does CSUCI offer?',   topic: 'housing' },
    { label: 'Off-Campus',       prompt: 'Are there off-campus housing resources at CSUCI?',   topic: 'housing' },
    { label: 'Costs',            prompt: 'How much does student housing cost at CSUCI?',       topic: 'housing' },
    { label: 'How to Apply',     prompt: 'How do I apply for housing at CSUCI?',               topic: 'housing' },
    { label: 'Meal Plans',       prompt: 'What meal plan options are available at CSUCI?',     topic: 'housing' },
    { label: 'Roommates',        prompt: 'How does CSUCI match roommates?',                    topic: 'housing' },
    { label: 'Resident Life',    prompt: 'What is resident life like at CSUCI?',               topic: 'housing' },
    { label: 'Maintenance',      prompt: 'How do I submit a maintenance request at CSUCI?',    topic: 'housing' },
    { label: 'Move-In Dates',    prompt: 'When are the move-in dates for CSUCI housing?',      topic: 'housing' },
    { label: 'Guest Policy',     prompt: 'What is the guest policy for CSUCI housing?',        topic: 'housing' },
  ],
  programs: [
    { label: 'Undergrad',        prompt: 'What undergraduate majors are offered at CSUCI?',          topic: 'programs' },
    { label: 'Graduate',         prompt: 'What graduate programs does CSUCI offer?',                 topic: 'programs' },
    { label: 'Online',           prompt: 'Does CSUCI offer online degree programs?',                 topic: 'programs' },
    { label: 'Minors',           prompt: 'What minors does CSUCI offer?',                            topic: 'programs' },
    { label: 'Certificates',     prompt: 'What certificate programs does CSUCI offer?',              topic: 'programs' },
    { label: 'Business',         prompt: 'What business programs does CSUCI offer?',                 topic: 'programs' },
    { label: 'STEM',             prompt: 'What STEM programs does CSUCI offer?',                     topic: 'programs' },
    { label: 'Liberal Arts',     prompt: 'What liberal arts programs does CSUCI offer?',             topic: 'programs' },
    { label: 'Education',        prompt: 'What education programs does CSUCI offer?',                topic: 'programs' },
    { label: 'Nursing',          prompt: 'Does CSUCI offer a nursing program?',                      topic: 'programs' },
  ],
  departments: [
    { label: 'Admissions',       prompt: 'How do I contact the CSUCI Admissions Office? Include phone, email, and hours.',    topic: 'departments' },
    { label: 'Financial Aid',    prompt: 'How do I contact the CSUCI Financial Aid Office? Include phone, email, and hours.', topic: 'departments' },
    { label: 'Registrar',        prompt: 'How do I contact the CSUCI Registrar? Include phone, email, and hours.',            topic: 'departments' },
    { label: 'IT Help Desk',     prompt: 'How do I contact the CSUCI IT Help Desk for tech support?',                        topic: 'departments' },
    { label: 'Student Health',   prompt: 'How do I contact CSUCI Student Health Services?',                                  topic: 'departments' },
    { label: 'Housing Office',   prompt: 'How do I contact the CSUCI Housing Office?',                                       topic: 'departments' },
    { label: 'Advising',         prompt: 'How do I contact Academic Advising at CSUCI?',                                     topic: 'departments' },
    { label: 'Campus Police',    prompt: 'How do I contact CSUCI Campus Police or Public Safety?',                           topic: 'departments' },
    { label: 'Library',          prompt: 'How do I contact the CSUCI library?',                                              topic: 'departments' },
    { label: 'Career Center',    prompt: 'How do I contact the CSUCI Career Center?',                                        topic: 'departments' },
  ],
  parking: [
    { label: 'Buy Permit',       prompt: 'How do I buy a parking permit at CSUCI?',             topic: 'parking' },
    { label: 'Visitor',          prompt: 'Where can visitors park at CSUCI?',                   topic: 'parking' },
    { label: 'Campus Map',       prompt: 'Where can I find a campus map for CSUCI?',            topic: 'parking' },
    { label: 'ADA Parking',      prompt: 'Where is accessible parking located at CSUCI?',      topic: 'parking' },
    { label: 'EV Charging',      prompt: 'Does CSUCI have electric vehicle charging stations?', topic: 'parking' },
    { label: 'Citations',        prompt: 'How do I dispute a parking citation at CSUCI?',       topic: 'parking' },
    { label: 'Bike Parking',     prompt: 'Where can I park my bike at CSUCI?',                  topic: 'parking' },
    { label: 'Shuttle',          prompt: 'Does CSUCI offer a shuttle or transit service?',      topic: 'parking' },
    { label: 'After Hours',      prompt: 'What are the parking rules after hours at CSUCI?',    topic: 'parking' },
    { label: 'Carpool',          prompt: 'Does CSUCI offer carpool or rideshare programs?',     topic: 'parking' },
  ],
  services: [
    { label: 'Tutoring',         prompt: 'What tutoring resources does CSUCI offer?',                      topic: 'services' },
    { label: 'Writing Center',   prompt: 'How do I use the CSUCI writing center?',                         topic: 'services' },
    { label: 'Disability',       prompt: 'What disability support services does CSUCI provide?',           topic: 'services' },
    { label: 'Counseling',       prompt: 'What mental health and counseling services are at CSUCI?',       topic: 'counseling' },
    { label: 'Food Pantry',      prompt: 'What food pantry or basic needs support does CSUCI offer?',     topic: 'services' },
    { label: 'Career Help',      prompt: 'What career and internship resources does CSUCI offer?',         topic: 'services' },
    { label: 'Library',          prompt: 'How do I access the CSUCI library and its resources?',           topic: 'services' },
    { label: 'Veterans',         prompt: 'What services does CSUCI offer for veteran students?',           topic: 'services' },
    { label: 'LGBTQ+',           prompt: 'What LGBTQ+ support resources are available at CSUCI?',         topic: 'services' },
    { label: 'International',    prompt: 'What services are available for international students at CSUCI?', topic: 'services' },
  ],
};

function detectChipSet(t) {
  t = t.toLowerCase();
  if (t.match(/advis|degree plan|change major|graduation req|add.drop|transfer credit/)) return 'advising';
  if (t.match(/counsel|mental health|anxiety|stress|therapy|wellness|crisis/))            return 'counseling';
  if (t.match(/admission|apply|application|transfer|enrollment|freshman/))                return 'admissions';
  if (t.match(/financial aid|fafsa|scholarship|grant|work.study|loan|tuition|fee/))      return 'financialaid';
  if (t.match(/event|calendar|orientation|club|activity|sport|commencement/))             return 'events';
  if (t.match(/hous|dorm|resident|apartment|meal plan/))                                  return 'housing';
  if (t.match(/major|program|degree|minor|certificate|graduate|undergrad|nursing/))       return 'programs';
  if (t.match(/contact|phone|email|office hours|registrar|it help|campus police/))       return 'departments';
  if (t.match(/park|permit|map|lot|visitor|ada|shuttle|ev charging/))                     return 'parking';
  if (t.match(/tutor|writing|disabilit|food|pantry|career|library|veteran|lgbtq/))      return 'services';
  return 'root';
}

// Build DOM
const bubble = document.createElement('button');
bubble.id = 'ekho-bubble';
bubble.title = 'Chat with EkhoBot';
bubble.innerHTML = dolphinWhite;

const win = document.createElement('div');
win.id = 'ekho-window';
win.innerHTML = `
  <div id="ekho-header">
    <div class="ekho-logo">${dolphinRed}</div>
    <div class="ekho-header-text">
      <p class="ekho-header-title">EkhoBot</p>
      <p class="ekho-header-sub">CSU Channel Islands</p>
    </div>
    <button id="ekho-close">&#x2715;</button>
  </div>
  <div id="ekho-messages"></div>
  <div id="ekho-chip-bar"></div>
  <div id="ekho-input-area">
    <input id="ekho-input" type="text" placeholder="Ask EkhoBot anything..." />
    <button id="ekho-send">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
    </button>
  </div>
`;

document.body.appendChild(bubble);
document.body.appendChild(win);

function openChat() {
  win.style.display = 'flex';
  win.style.flexDirection = 'column';
  bubble.classList.add('hidden');
  if (history.length === 0) {
    addBotMessage("Hi! I'm EkhoBot, your CSUCI virtual assistant. What can I help you with today?");
    addHint("Don't see your topic? Just type it below.");
    renderChips('root', false);
  }
}

function closeChat() {
  win.style.display = 'none';
  bubble.classList.remove('hidden');
}

bubble.onclick = openChat;
document.getElementById('ekho-close').onclick = closeChat;
document.getElementById('ekho-send').onclick = sendMessage;
document.getElementById('ekho-input').onkeydown = e => { if (e.key === 'Enter') sendMessage(); };

function renderChips(topicKey, expanded) {
  currentTopic = topicKey;
  chipsExpanded = expanded;
  const bar = document.getElementById('ekho-chip-bar');
  bar.innerHTML = '';
  const chips = CHIP_SETS[topicKey] || CHIP_SETS.root;
  const isSubMenu = topicKey !== 'root';

  if (!expanded) {
    chips.slice(0, 4).forEach(c => addChipBtn(bar, c));
    const more = document.createElement('button');
    more.className = 'ekho-chip secondary';
    more.textContent = 'More...';
    more.onclick = () => renderChips(topicKey, true);
    bar.appendChild(more);
    if (isSubMenu) {
      const back = document.createElement('button');
      back.className = 'ekho-chip secondary';
      back.textContent = '← Back';
      back.onclick = () => renderChips('root', false);
      bar.appendChild(back);
    } else {
      bar.appendChild(document.createElement('div'));
    }
  } else {
    const all = [...chips];
    if (isSubMenu) all.push({ label: '← Back', isBack: true });
    const rem = all.length % 3;
    const pad = rem === 0 ? 0 : 3 - rem;
    all.forEach(c => {
      if (c.isBack) {
        const b = document.createElement('button');
        b.className = 'ekho-chip secondary';
        b.textContent = '← Back';
        b.onclick = () => renderChips('root', false);
        bar.appendChild(b);
      } else {
        addChipBtn(bar, c);
      }
    });
    for (let i = 0; i < pad; i++) bar.appendChild(document.createElement('div'));
  }
}

function addChipBtn(bar, chip) {
  const { label, prompt, topic, future } = chip;
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.title = label;
  if (future) {
    btn.className = 'ekho-chip future';
    btn.onclick = () => addComingSoon(label);
  } else {
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

function addBotMessage(text) {
  const msgs = document.getElementById('ekho-messages');
  const row = document.createElement('div');
  row.className = 'ekho-row';
  const avatar = document.createElement('div');
  avatar.className = 'ekho-avatar';
  avatar.innerHTML = dolphinWhite;
  const msg = document.createElement('div');
  msg.className = 'ekho-msg bot';
  msg.textContent = text;
  row.appendChild(avatar);
  row.appendChild(msg);
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function addComingSoon(name) {
  const msgs = document.getElementById('ekho-messages');
  const row = document.createElement('div');
  row.className = 'ekho-row';
  const avatar = document.createElement('div');
  avatar.className = 'ekho-avatar';
  avatar.innerHTML = dolphinWhite;
  const msg = document.createElement('div');
  msg.className = 'ekho-msg coming-soon';
  msg.textContent = `${name} is coming soon! This feature is currently in development.`;
  row.appendChild(avatar);
  row.appendChild(msg);
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function addHint(text) {
  const msgs = document.getElementById('ekho-messages');
  const msg = document.createElement('div');
  msg.className = 'ekho-msg hint';
  msg.textContent = text;
  msgs.appendChild(msg);
  msgs.scrollTop = msgs.scrollHeight;
}

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

function removeTyping() {
  document.getElementById('ekho-typing-row')?.remove();
}

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
    renderChips(forcedTopic || detectChipSet(data.reply), false);
  } catch (e) {
    removeTyping();
    addBotMessage('Sorry, EkhoBot is offline right now. Try again shortly!');
    renderChips('root', false);
  }
}