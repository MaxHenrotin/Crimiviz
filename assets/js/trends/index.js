import * as d3 from 'd3';
import { initSeasonalityChart } from './seasonality.js';
import { initDailyRhythmChart } from './dailyRhythm.js';
import { initCompositionChart } from './composition.js';
import { initOutcomesChart } from './outcomes.js';
import { initCrimeClockChart } from './crimeClock.js';
import { initHistoricalStreamChart } from './historicalStream.js?v=1';

/**
 * Core Orchestrator for the Crimiviz Trends section.
 * Re-routes loaded array maps dynamically to all 6 layout canvases.
 */
export async function initTrendsSection() {
  const panel = document.getElementById('panel-trends');
  if (!panel) return;

  console.log("Trends Module awakened. Fetching data files from /data...");

  try {
    const [seasonalityData, hourlyData, compositionData, outcomeData] = await Promise.all([
      d3.json("data/seasonality.json"),
      d3.json("data/time_of_day.json"),
      d3.json("data/crime_types.json"),
      d3.json("data/arrest_rates.json")
    ]);

    console.log("All datasets fetched successfully! Instantiating 6 dashboards charts...");

    // Fire all core visualizations
    initSeasonalityChart(seasonalityData, '#chart-seasonality');
    initDailyRhythmChart(hourlyData, '#chart-time-of-day');
    initCompositionChart(compositionData, '#chart-types');
    initOutcomesChart(outcomeData, '#chart-arrest');
    initCrimeClockChart(hourlyData, '#chart-crime-clock');
    initHistoricalStreamChart(seasonalityData, '#chart-historical-stream');

  } catch (err) {
    console.error("Trends dashboard pipeline crashed during boot:", err);
  }
}

// Global window mounting frame link for main.js triggers
window.initTrendsSection = initTrendsSection;

if (document.body.getAttribute('data-tab') === 'trends' || window.location.hash === '#trends') {
  initTrendsSection();
}

const tabStrip = document.querySelector('.tabs');
if (tabStrip) {
  tabStrip.addEventListener('click', (e) => {
    const targetButton = e.target.closest('.tab');
    if (targetButton && targetButton.getAttribute('data-tab') === 'trends') {
      setTimeout(initTrendsSection, 50);
    }
  });
}