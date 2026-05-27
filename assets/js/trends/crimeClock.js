import * as d3 from 'd3';

export function initCrimeClockChart(data, containerSelector) {
    const parentContainer = d3.select(containerSelector);
    parentContainer.selectAll("*").remove();

    if (!data || data.length === 0) return;

    // ─── STAGE 1: DATA CLEANING & TOTAL AGGREGATION ────────────────────────
    const crimeDataMap = new Map();
    // Create a master baseline array to track the city's combined hourly totals
    const totalAllCrimesHourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));

    data.forEach(d => {
        let type = (d.type || d.primary_type || d.category || "").toUpperCase().trim();
        
        if (type === 'DOMESTIC VIOLENCE') return; // Drop outlier
        if (type === 'CRIM SEXUAL ASSAULT') type = 'CRIMINAL SEXUAL ASSAULT';

        const hour = +d.hour;
        const count = +(d.n || d.count || d.value || 0);
        if (isNaN(hour) || hour < 0 || hour > 23) return;

        // 1. Accumulate to individual crime type bucket
        if (!crimeDataMap.has(type)) {
            crimeDataMap.set(type, Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 })));
        }
        crimeDataMap.get(type)[hour].count += count;

        // 2. Accumulate directly into our global macro baseline array
        totalAllCrimesHourly[hour].count += count;
    });

    // Save the global accumulator map under a unique key identifier
    const TOTAL_KEY = "TOTAL_ALL_CRIMES";
    crimeDataMap.set(TOTAL_KEY, totalAllCrimesHourly);

    // Sort alpha list but omit the macro total key so we can pin it to the very top
    const crimeTypes = Array.from(crimeDataMap.keys())
        .filter(k => k !== TOTAL_KEY)
        .sort();
    
    // ─── STAGE 2: DROPDOWN SELECTION COMPONENT ─────────────────────────────
    parentContainer
        .style("height", "auto")
        .style("max-height", "none")
        .style("min-height", "auto")
        .style("display", "block")
        .style("padding", "20px 0");

    const controls = parentContainer.append("div")
        .attr("class", "crime-clock-controls")
        .style("margin-bottom", "35px")
        .style("font-family", "var(--sans, system-ui, sans-serif)")
        .style("font-size", "13px")
        .style("display", "flex")
        .style("align-items", "center")
        .style("gap", "10px");

    controls.append("label")
        .attr("for", "clock-crime-selector")
        .style("font-weight", "500")
        .style("color", "#2a1f12")
        .text("Isolate Offense Profile:");

    const selector = controls.append("select")
        .attr("id", "clock-crime-selector")
        .style("padding", "6px 12px")
        .style("font-family", "var(--sans, system-ui, sans-serif)")
        .style("font-size", "13px")
        .style("border", "1px solid rgba(42, 31, 18, 0.25)")
        .style("background-color", "#f5eedf")
        .style("color", "#2a1f12")
        .style("border-radius", "4px")
        .style("cursor", "pointer")
        .style("width", "auto")
        .style("max-width", "300px");

    // 🟢 PIN TOTAL ALL CRIMES OPTION RIGHT AT THE VERY TOP OF THE LIST
    selector.append("option")
        .attr("value", TOTAL_KEY)
        .text("All Crimes Combined");

    // Append the remaining individual categories alphabetically below it
    selector.selectAll(".sub-option")
        .data(crimeTypes)
        .enter()
        .append("option")
        .attr("class", "sub-option")
        .attr("value", d => d)
        .text(d => d.toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase()));

    // Floating dynamic label tracking box
    const labelHoverReadout = parentContainer.append("div")
        .attr("class", "clock-hover-readout")
        .style("margin-bottom", "15px")
        .style("font-family", "var(--sans, system-ui, sans-serif)")
        .style("font-size", "13px")
        .style("font-weight", "600")
        .style("color", "#7a1010")
        .text("Hover over the distribution to track timeline changes.");

    const chartSlot = parentContainer.append("div")
        .attr("class", "clock-svg-slot")
        .style("width", "100%")
        .style("height", "auto");

    // ─── STAGE 3: LINEAR RENDERING CANVAS ──────────────────────────────────
    const cfg = {
        w: 1160,
        h: 300,
        margin: { top: 15, right: 25, bottom: 35, left: 55 },
        colorArea: "#2a1f12",
        colorLine: "#7a1010",
        x: d => d.hour,
        y: d => d.share
    };

    cfg.innerWidth = cfg.w - cfg.margin.left - cfg.margin.right;
    cfg.innerHeight = cfg.h - cfg.margin.top - cfg.margin.bottom;

    function drawLinearClock(selectedType) {
        chartSlot.selectAll("*").remove();

        const hourlyData = crimeDataMap.get(selectedType);
        const totalVolume = d3.sum(hourlyData, d => d.count);
        
        let dataset = hourlyData.map(d => ({
            hour: d.hour,
            share: totalVolume > 0 ? d.count / totalVolume : 0
        }));

        dataset.sort((a, b) => a.hour - b.hour);

        const svg = chartSlot.append("svg")
            .attr("viewBox", `0 0 ${cfg.w} ${cfg.h}`)
            .style("width", "100%")
            .style("height", "auto")
            .style("overflow", "visible")
            .append("g")
            .attr("transform", `translate(${cfg.margin.left}, ${cfg.margin.top})`);

        // Coordinate scalers
        const xScale = d3.scaleLinear().domain([0, 23]).range([0, cfg.innerWidth]);
        const yScale = d3.scaleLinear().domain([0, d3.max(dataset, cfg.y) * 1.1]).range([cfg.innerHeight, 0]);

        // Background Dashed Gridlines
        svg.append("g")
            .attr("class", "chart-grid")
            .selectAll("line")
            .data(yScale.ticks(5))
            .enter().append("line")
            .attr("x1", 0).attr("x2", cfg.innerWidth)
            .attr("y1", d => yScale(d)).attr("y2", d => yScale(d))
            .attr("stroke", cfg.colorArea).attr("stroke-width", 0.4).attr("opacity", 0.18).attr("stroke-dasharray", "3 3");

        // Horizontal Timeline X-Axis
        svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${cfg.innerHeight})`)
            .call(d3.axisBottom(xScale).tickValues([0, 4, 8, 12, 16, 20, 23]).tickFormat(d => d.toString().padStart(2, '0') + ":00").tickSizeOuter(0))
            .call(g => g.select(".domain").attr("stroke", cfg.colorArea).attr("stroke-width", 0.8).attr("opacity", 0.4))
            .call(g => g.selectAll(".tick text").attr("fill", cfg.colorArea).attr("font-family", "var(--mono, monospace)").attr("font-size", "11px").attr("dy", "10px"));

        // Vertical Percentage Share Y-Axis
        svg.append("g")
            .attr("class", "y-axis")
            .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format(".1%")))
            .call(g => g.select(".domain").remove())
            .call(g => g.selectAll(".tick text").attr("fill", cfg.colorArea).attr("font-family", "var(--mono, monospace)").attr("font-size", "11px"));

        // Area Vector Path Fill
        svg.append("path")
            .datum(dataset)
            .attr("fill", cfg.colorArea)
            .attr("opacity", 0.08)
            .attr("d", d3.area().x(d => xScale(cfg.x(d))).y0(cfg.innerHeight).y1(d => yScale(cfg.y(d))).curve(d3.curveMonotoneX));

        // Primary Linear Trendline Path
        svg.append("path")
            .datum(dataset)
            .attr("fill", "none")
            .attr("stroke", cfg.colorLine)
            .attr("stroke-width", 2.2)
            .attr("stroke-linecap", "round")
            .attr("d", d3.line().x(d => xScale(cfg.x(d))).y(d => yScale(cfg.y(d))).curve(d3.curveMonotoneX));

        // ─── STAGE 4: INTERACTIVE MOUSE SELECTION LOOKUP TRACKERS ───────────
        const focusGroup = svg.append("g").style("display", "none");
        
        focusGroup.append("line")
            .attr("class", "v-track")
            .attr("y1", 0).attr("y2", cfg.innerHeight)
            .attr("stroke", cfg.colorLine).attr("stroke-width", 0.6).attr("stroke-dasharray", "2 2");

        const focusCircle = focusGroup.append("circle")
            .attr("r", 5)
            .attr("fill", cfg.colorLine)
            .attr("stroke", "#f5eedf")
            .attr("stroke-width", 1.5);

        svg.append("rect")
            .attr("class", "mouse-capture")
            .attr("width", cfg.innerWidth).attr("height", cfg.innerHeight)
            .attr("fill", "none").attr("pointer-events", "all")
            .style("cursor", "crosshair")
            .on("mouseover", () => focusGroup.style("display", null))
            .on("mouseout", () => {
                focusGroup.style("display", "none");
                labelHoverReadout.text("Hover over the distribution to track timeline changes.");
            })
            .on("mousemove", function(event) {
                const mouseX = d3.pointer(event, this)[0];
                const targetHour = Math.max(0, Math.min(23, Math.round(xScale.invert(mouseX))));
                const d = dataset.find(item => item.hour === targetHour) || dataset[targetHour];
                if (!d) return;

                focusGroup.attr("transform", `translate(${xScale(cfg.x(d))}, 0)`);
                focusCircle.attr("cy", yScale(cfg.y(d)));

                const hourString = d.hour.toString().padStart(2, '0') + ":00";
                labelHoverReadout.text(`Time window: ${hourString} Profile share: ${d3.format(".3%")(d.share)}`);
            });
    }

    // 🟢 DEFAULT THE INITAL RENDERING LENS VIEW TO THE COMBINED TOTAL
    drawLinearClock(TOTAL_KEY);

    // Watch drop menu configurations to redraw curves instantly
    selector.on("change", (e) => drawLinearClock(e.target.value));
}