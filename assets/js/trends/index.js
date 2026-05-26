import * as d3 from 'd3';
import { initSeasonalityChart } from './seasonality.js';
import { initDailyRhythmChart } from './dailyRhythm.js';
import { initCompositionChart } from './composition.js';
import { initOutcomesChart } from './outcomes.js';

/**
 * Core Orchestrator for the Crimiviz Trends section.
 * Fetches files asynchronously from the data/ directory.
 */
export async function initTrendsSection() {
  const panel = document.getElementById('panel-trends');
  if (!panel) return;

  console.log("Trends Module drawing loop triggered. Fetching data...");

  try {
    const [seasonalityData, hourlyData, compositionData, outcomeData] = await Promise.all([
      d3.json("data/seasonality.json"),
      d3.json("data/time_of_day.json"),
      d3.json("data/crime_types.json"),
      d3.json("data/arrest_rates.json")
    ]);

    console.log("Trends data fetched successfully! Evicting placeholders and drawing charts...");

    // Fire the rendering modules
    initSeasonalityChart(seasonalityData, '#chart-seasonality');
    initDailyRhythmChart(hourlyData, '#chart-time-of-day');
    initCompositionChart(compositionData, '#chart-types');
    initOutcomesChart(outcomeData, '#chart-arrest');

  } catch (err) {
    console.error("Trends dashboard failed to render data maps:", err);
  }
}

// 1. Force instant global window attachment so main.js can see it immediately
window.initTrendsSection = initTrendsSection;

// 2. Automated Trigger Fallback: If the user is already on the trends tab, 
// or if your teammate's tab switcher misses the call, check the DOM and draw!
if (document.body.getAttribute('data-tab') === 'trends' || window.location.hash === '#trends') {
  initTrendsSection();
}

// 3. Listen to your teammate's tab layout modifications directly from the DOM
const tabStrip = document.querySelector('.tabs');
if (tabStrip) {
  tabStrip.addEventListener('click', (e) => {
    const targetButton = e.target.closest('.tab');
    if (targetButton && targetButton.getAttribute('data-tab') === 'trends') {
      // Defer execution by 50ms to ensure the panel has finished unhiding in the DOM
      setTimeout(initTrendsSection, 50);
    }
  });
}