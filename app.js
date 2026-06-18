const DEFAULT_CITY = "Mumbai";
const DEFAULT_LAT = 19.0760;
const DEFAULT_LON = 72.8777;

const weatherCodeMap = {
    0: { emoji: "☀️", desc: "Clear Sky", theme: "day-clear" },
    1: { emoji: "🌤️", desc: "Mainly Clear", theme: "day-clear" },
    2: { emoji: "⛅", desc: "Partly Cloudy", theme: "day-cloudy" },
    3: { emoji: "☁️", desc: "Overcast", theme: "day-cloudy" },
    61: { emoji: "🌧️", desc: "Slight Rain", theme: "day-rain" },
    63: { emoji: "🌧️", desc: "Moderate Rain", theme: "day-rain" },
    95: { emoji: "⛈️", desc: "Thunderstorm", theme: "day-rain" }
};

function getWeatherMeta(code, isNight) {
    if (isNight) return { emoji: "🌙", desc: "Night Clear", theme: "night" };
    return weatherCodeMap[code] || { emoji: "🌤️", desc: "Partly Cloudy", theme: "day-cloudy" };
}

const loadingSpinner = document.getElementById('loading');
const searchInput = document.getElementById('city-search');
const suggestionsList = document.getElementById('search-suggestions');
const canvas = document.getElementById('tempChart');
const ctx = canvas.getContext('2d');

let rawForecastData = null;

window.addEventListener('DOMContentLoaded', () => {
    initGeolocation();
    setupSearchDebounce();
    setupResizeHandler();
});

// Requirement 1: Geolocation API with Fallback
function initGeolocation() {
    toggleLoading(true);
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                fetchWeatherData(position.coords.latitude, position.coords.longitude, "Local Weather");
            },
            () => {
                fetchWeatherData(DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY);
            }
        );
    } else {
        fetchWeatherData(DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY);
    }
}

// Requirement 2: Fetch Data Layer
async function fetchWeatherData(lat, lon, locationName) {
    toggleLoading(true);
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,relative_humidity_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability,time&timezone=auto`;
        const response = await fetch(url);
        const data = await response.json();
        
        rawForecastData = data;
        document.getElementById('location-title').textContent = locationName;
        
        renderCurrentWeather(data.current_weather, data.hourly);
        renderForecastGrid(data.daily);
        renderCanvasChart(data.hourly);
    } catch (error) {
        console.error("API error:", error);
    } finally {
        toggleLoading(false);
    }
}

// Requirement 3: Dynamic Theme Gradients
function renderCurrentWeather(current, hourly) {
    const isNight = current.is_day === 0;
    const meta = getWeatherMeta(current.weather_code, isNight);
    
    document.getElementById('current-panel').className = `panel left-panel ${meta.theme}`;
    document.getElementById('current-icon').textContent = meta.emoji;
    document.getElementById('current-temp').textContent = `${Math.round(current.temperature)}°C`;
    document.getElementById('current-desc').textContent = meta.desc;
    
    const currentHour = new Date().getHours();
    document.getElementById('humidity').textContent = hourly.relative_humidity_2m[currentHour] || '--';
    document.getElementById('wind-speed').textContent = current.windspeed;
}

// Requirement 4: 7-Day Forecast Expandable Grid
function renderForecastGrid(daily) {
    const grid = document.getElementById('forecast-grid');
    grid.innerHTML = '';
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    daily.time.forEach((timeStr, index) => {
        const date = new Date(timeStr);
        const dayName = index === 0 ? 'Today' : weekdays[date.getDay()];
        const meta = getWeatherMeta(daily.weather_code[index], false);

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
            <div class="forecast-summary">
                <span style="width: 80px; font-weight: bold;">${dayName}</span>
                <span>${meta.emoji}</span>
                <span style="font-size: 0.8rem; opacity: 0.7;">💧 ${daily.precipitation_probability[index]}%</span>
                <span><strong>${Math.round(daily.temperature_2m_max[index])}°</strong> / ${Math.round(daily.temperature_2m_min[index])}°</span>
            </div>
            <div class="hourly-container"></div>
        `;

        card.addEventListener('click', () => {
            const isExpanded = card.classList.contains('expanded');
            document.querySelectorAll('.forecast-card').forEach(c => c.classList.remove('expanded'));
            if (!isExpanded) {
                card.classList.add('expanded');
                populateHourlyData(card.querySelector('.hourly-container'), index);
            }
        });

        grid.appendChild(card);
    });
}

function populateHourlyData(container, dayIndex) {
    if (!rawForecastData) return;
    container.innerHTML = '';
    const start = dayIndex * 24;
    for (let i = start; i < start + 24; i += 4) { // 4-hour intervals
        const time = new Date(rawForecastData.hourly.time[i]);
        const formatTime = time.toLocaleTimeString([], { hour: '2-digit' });
        const temp = Math.round(rawForecastData.hourly.temperature_2m[i]);
        const icon = getWeatherMeta(rawForecastData.hourly.weather_code[i], false).emoji;

        container.innerHTML += `
            <div class="hourly-item">
                <div>${formatTime}</div>
                <div style="margin: 3px 0;">${icon}</div>
                <div><b>${temp}°C</b></div>
            </div>
        `;
    }
}

// Requirement 5: Pure Canvas 2D Chart
function renderCanvasChart(hourly) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = 200;
    const pad = { top: 25, right: 15, bottom: 25, left: 35 };

    const temps = hourly.temperature_2m.slice(0, 24);
    const max = Math.max(...temps) + 1;
    const min = Math.min(...temps) - 1;

    const getX = (i) => pad.left + (i / 23) * (w - pad.left - pad.right);
    const getY = (val) => pad.top + (1 - (val - min) / (max - min)) * (h - pad.top - pad.bottom);

    ctx.clearRect(0, 0, w, h);

    // Background Gradient Area Fill
    const fillGrad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    fillGrad.addColorStop(0, 'rgba(86, 204, 242, 0.3)');
    fillGrad.addColorStop(1, 'rgba(86, 204, 242, 0)');
    ctx.beginPath();
    ctx.moveTo(getX(0), h - pad.bottom);
    for(let i=0; i<24; i++) ctx.lineTo(getX(i), getY(temps[i]));
    ctx.lineTo(getX(23), h - pad.bottom);
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Plot Line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(temps[0]));
    for(let i=1; i<24; i++) ctx.lineTo(getX(i), getY(temps[i]));
    ctx.strokeStyle = '#56ccf2';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Graph Text Metrics
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 24; i += 6) {
        ctx.fillText(i + ":00", getX(i), h - 8);
    }
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(max) + "°C", pad.left - 8, pad.top + 4);
    ctx.fillText(Math.round(min) + "°C", pad.left - 8, h - pad.bottom);
}

// Requirement 6: Debounced City Search Input
function setupSearchDebounce() {
    let timer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(timer);
        const val = e.target.value.trim();
        if (val.length < 2) { suggestionsList.innerHTML = ''; return; }
        timer = setTimeout(() => fetchGeocoding(val), 400);
    });
}

async function fetchGeocoding(query) {
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=4&format=json`);
        const data = await res.json();
        renderSuggestions(data.results || []);
    } catch (err) { console.error(err); }
}

function renderSuggestions(results) {
    suggestionsList.innerHTML = '';
    results.forEach(city => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = `${city.name}, ${city.country || ''}`;
        div.addEventListener('click', () => {
            searchInput.value = city.name;
            suggestionsList.innerHTML = '';
            fetchWeatherData(city.latitude, city.longitude, city.name);
        });
        suggestionsList.appendChild(div);
    });
}

// Requirement 7: Debounced Window Resize Canvas Refresh
function setupResizeHandler() {
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (rawForecastData) renderCanvasChart(rawForecastData.hourly);
        }, 150);
    });
}

function toggleLoading(visible) {
    loadingSpinner.classList.toggle('active', visible);
}
