// Configuration & Defaults
const DEFAULT_CITY = "Mumbai";
const DEFAULT_LAT = 19.0760;
const DEFAULT_LON = 72.8777;

// WMO Code Map to Emoji, Descriptions, and Style themes
const weatherCodeMap = {
    0: { emoji: "☀️", desc: "Clear Sky", theme: "day-clear" },
    1: { emoji: "🌤️", desc: "Mainly Clear", theme: "day-clear" },
    2: { emoji: "⛅", desc: "Partly Cloudy", theme: "day-cloudy" },
    3: { emoji: "☁️", desc: "Overcast", theme: "day-cloudy" },
    45: { emoji: "🌫️", desc: "Foggy", theme: "day-cloudy" },
    48: { emoji: "🌫️", desc: "Depositing Rime Fog", theme: "day-cloudy" },
    51: { emoji: "🌦️", desc: "Light Drizzle", theme: "day-rain" },
    61: { emoji: "🌧️", desc: "Slight Rain", theme: "day-rain" },
    63: { emoji: "🌧️", desc: "Moderate Rain", theme: "day-rain" },
    80: { emoji: "🌦️", desc: "Slight Rain Showers", theme: "day-rain" },
    95: { emoji: "⛈️", desc: "Thunderstorm", theme: "day-rain" }
};

function getWeatherMeta(code, isNight) {
    if (isNight) return { emoji: "🌙", desc: "Night Clear", theme: "night" };
    return weatherCodeMap[code] || { emoji: "🌈", desc: "Weather", theme: "day-clear" };
}

// DOM Elements
const loadingSpinner = document.getElementById('loading');
const searchInput = document.getElementById('city-search');
const suggestionsList = document.getElementById('search-suggestions');
const canvas = document.getElementById('tempChart');
const ctx = canvas.getContext('2d');

let rawForecastData = null; // Store fetched API responses globally

// --- App Initialization ---
window.addEventListener('DOMContentLoaded', () => {
    initGeolocation();
    setupSearchDebounce();
    setupResizeHandler();
});

// 1. Geolocation Setup
function initGeolocation() {
    toggleLoading(true);
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                fetchWeatherData(position.coords.latitude, position.coords.longitude, "Your Location");
            },
            () => {
                // Fallback to default city
                fetchWeatherData(DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY);
            }
        );
    } else {
        fetchWeatherData(DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY);
    }
}

// 2. Data Fetching Layer (Open-Meteo)
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
        console.error("Error retrieving weather data: ", error);
    } finally {
        toggleLoading(false);
    }
}

// 3. UI Rendering: Current Card
function renderCurrentWeather(current, hourly) {
    const isNight = current.is_day === 0;
    const meta = getWeatherMeta(current.weather_code, isNight);
    
    const currentCard = document.getElementById('current-weather');
    currentCard.className = `weather-card ${meta.theme}`;
    
    document.getElementById('current-icon').textContent = meta.emoji;
    document.getElementById('current-temp').textContent = `${Math.round(current.temperature)}°C`;
    document.getElementById('current-desc').textContent = meta.desc;
    
    // Get modern records from matching current hour sequence index
    const nowIndex = new Date().getHours();
    document.getElementById('humidity').textContent = hourly.relative_humidity_2m[nowIndex] || '--';
    document.getElementById('wind-speed').textContent = current.windspeed;
}

// 4. UI Rendering: 7-Day Accordion Grid
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
            <h3>${dayName}</h3>
            <div class="weather-emoji">${meta.emoji}</div>
            <div><strong>${Math.round(daily.temperature_2m_max[index])}°C</strong> / ${Math.round(daily.temperature_2m_min[index])}°C</div>
            <div style="font-size:0.85rem; margin-top:0.3rem; opacity:0.8;">💧 ${daily.precipitation_probability[index]}%</div>
            <div class="hourly-container"></div>
        `;

        // Interactive expansion behavior
        card.addEventListener('click', (e) => {
            if(e.target.closest('.hourly-item')) return; // Avoid re-triggering closures if child arrays are target click sources
            
            const isExpanded = card.classList.contains('expanded');
            document.querySelectorAll('.forecast-card').forEach(c => c.classList.remove('expanded'));
            
            if (!isExpanded) {
                card.classList.add('expanded');
                populateHourlySubpanel(card.querySelector('.hourly-container'), index);
            }
        });

        grid.appendChild(card);
    });
}

function populateHourlySubpanel(container, dayIndex) {
    if (!rawForecastData) return;
    container.innerHTML = '';
    
    const startHour = dayIndex * 24;
    const endHour = startHour + 24;
    
    for (let i = startHour; i < endHour; i += 3) { // Show data points in 3-hour steps for clean width sizing
        const time = new Date(rawForecastData.hourly.time[i]);
        const formattedHour = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const temp = Math.round(rawForecastData.hourly.temperature_2m[i]);
        const code = rawForecastData.hourly.weather_code[i];
        const emoji = getWeatherMeta(code, time.getHours() < 6 || time.getHours() > 18).emoji;

        const item = document.createElement('div');
        item.className = 'hourly-item';
        item.innerHTML = `
            <div style="font-size:0.8rem; opacity:0.7">${formattedHour}</div>
            <div style="font-size:1.2rem; margin:0.2rem 0">${emoji}</div>
            <div style="font-weight:bold">${temp}°C</div>
        `;
        container.appendChild(item);
    }
}

// 5. Native Canvas Line Chart Engine
function renderCanvasChart(hourly) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Auto scale canvas pixel resolution calculations to bypass screen blurring
    canvas.width = rect.width * dpr;
    canvas.height = 220 * dpr;
    ctx.scale(dpr, dpr);

    const widths = rect.width;
    const heights = 220;
    const padding = { top: 30, right: 20, bottom: 30, left: 40 };

    // Segment data metrics down to initial 24 hour windows
    const temps = hourly.temperature_2m.slice(0, 24);
    const labels = hourly.time.slice(0, 24).map(t => new Date(t).getHours() + ":00");

    const maxTemp = Math.max(...temps) + 2;
    const minTemp = Math.min(...temps) - 2;
    const tempRange = maxTemp - minTemp;

    // Mapping coordinate generators
    const getX = (index) => padding.left + (index / (temps.length - 1)) * (widths - padding.left - padding.right);
    const getY = (val) => padding.top + (1 - (val - minTemp) / tempRange) * (heights - padding.top - padding.bottom);

    ctx.clearRect(0, 0, widths, heights);

    // Render underlying area metric gradients
    const areaGradient = ctx.createLinearGradient(0, padding.top, 0, heights - padding.bottom);
    areaGradient.addColorStop(0, 'rgba(86, 204, 242, 0.4)');
    areaGradient.addColorStop(1, 'rgba(86, 204, 242, 0.0)');

    ctx.beginPath();
    ctx.moveTo(getX(0), heights - padding.bottom);
    for (let i = 0; i < temps.length; i++) {
        ctx.lineTo(getX(i), getY(temps[i]));
    }
    ctx.lineTo(getX(temps.length - 1), heights - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = areaGradient;
    ctx.fill();

    // Trace path data line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(temps[0]));
    for (let i = 1; i < temps.length; i++) {
        ctx.lineTo(getX(i), getY(temps[i]));
    }
    ctx.strokeStyle = '#56ccf2';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Render localized axis labels and baseline text indicators
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';

    // Print time interval segments on structural axis
    for (let i = 0; i < temps.length; i += 4) {
        ctx.fillText(labels[i], getX(i), heights - 10);
    }

    // Graph Y-Axis markers 
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(maxTemp)}°C`, padding.left - 10, padding.top + 5);
    ctx.fillText(`${Math.round(minTemp)}°C`, padding.left - 10, heights - padding.bottom);
}

// 6. Input Debouncer Engine & Geocoding Search Lookups
function setupSearchDebounce() {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        if (query.length < 2) {
            suggestionsList.innerHTML = '';
            return;
        }

        debounceTimer = setTimeout(() => {
            executeGeocodingSearch(query);
        }, 400); // 400ms delay window
    });

    // Close options list dropdown if user clicks out
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) suggestionsList.innerHTML = '';
    });
}

async function executeGeocodingSearch(query) {
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
        const response = await fetch(url);
        const data = await response.json();
        
        renderSearchSuggestions(data.results || []);
    } catch (err) {
        console.error("Geocoding fetch error:", err);
    }
}

function renderSearchSuggestions(results) {
    suggestionsList.innerHTML = '';
    results.forEach(city => {
        const countryModifier = city.country ? `, ${city.country}` : '';
        const regionModifier = city.admin1 ? `, ${city.admin1}` : '';
        
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = `${city.name}${regionModifier}${countryModifier}`;
        
        div.addEventListener('click', () => {
            searchInput.value = city.name;
            suggestionsList.innerHTML = '';
            fetchWeatherData(city.latitude, city.longitude, city.name);
        });
        suggestionsList.appendChild(div);
    });
}

// 7. Event Resizing Debouncer Setup
function setupResizeHandler() {
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (rawForecastData) {
                renderCanvasChart(rawForecastData.hourly);
            }
        }, 150);
    });
}

function toggleLoading(show) {
    loadingSpinner.classList.toggle('active', show);
}
