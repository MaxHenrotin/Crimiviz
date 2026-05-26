import * as d3 from 'd3';

export function initDailyRhythmChart(data, containerSelector) {
    const container = d3.select(containerSelector);
    container.selectAll("*").remove();

    if (!data || data.length === 0) return;

    const cfg = {
        w: 760,
        h: 340,
        margin: { top: 25, right: 30, bottom: 40, left: 55 },
        colorArea: "#2a1f12",
        colorLine: "#7a1010",
        colorDaylight: "#ffd9d9",
        x: d => d.hour,
        y: d => d.share
    };

    cfg.innerWidth = cfg.w - cfg.margin.left - cfg.margin.right;
    cfg.innerHeight = cfg.h - cfg.margin.top - cfg.margin.bottom;

    // Roll up values by hour across separate type objects
    const rolled = d3.rollups(data, v => d3.sum(v, d => d.n || 0), d => d.hour);
    
    let dataset = rolled.map(([hour, count]) => ({
        hour: +hour,
        share: +count
    }));

    dataset.sort((a, b) => a.hour - b.hour);

    const totalVolume = d3.sum(dataset, d => d.share);
    if (totalVolume > 0) {
        dataset.forEach(d => { d.share = d.share / totalVolume; });
    }

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${cfg.w} ${cfg.h}`)
        .style("width", "100%")
        .style("height", "auto")
        .style("overflow", "visible")
        .append("g")
        .attr("transform", `translate(${cfg.margin.left}, ${cfg.margin.top})`);

    const xScale = d3.scaleLinear().domain([0, 23]).range([0, cfg.innerWidth]);
    const yScale = d3.scaleLinear().domain([0, d3.max(dataset, cfg.y) * 1.1]).range([cfg.innerHeight, 0]);

    svg.append("rect")
        .attr("x", xScale(6)).attr("width", xScale(18) - xScale(6))
        .attr("y", 0).attr("height", cfg.innerHeight)
        .attr("fill", cfg.colorDaylight).attr("opacity", 0.25);

    svg.append("g")
        .attr("class", "chart-grid")
        .selectAll("line")
        .data(yScale.ticks(5))
        .enter().append("line")
        .attr("x1", 0).attr("x2", cfg.innerWidth)
        .attr("y1", d => yScale(d)).attr("y2", d => yScale(d))
        .attr("stroke", cfg.colorArea).attr("stroke-width", 0.4).attr("opacity", 0.2).attr("stroke-dasharray", "3 3");

    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${cfg.innerHeight})`)
        .call(d3.axisBottom(xScale).tickValues([0, 4, 8, 12, 16, 20, 23]).tickFormat(d => d.toString().padStart(2, '0') + ":00").tickSizeOuter(0))
        .call(g => g.select(".domain").attr("stroke", cfg.colorArea).attr("stroke-width", 0.8).attr("opacity", 0.4))
        .call(g => g.selectAll(".tick text").attr("fill", cfg.colorArea).attr("font-family", "var(--mono, monospace)").attr("font-size", "11px").attr("dy", "10px"));

    svg.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => d3.format(".1%")(d)))
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick text").attr("fill", cfg.colorArea).attr("font-family", "var(--mono, monospace)").attr("font-size", "11px"));

    svg.append("path").datum(dataset).attr("fill", cfg.colorArea).attr("opacity", 0.12).attr("d", d3.area().x(d => xScale(cfg.x(d))).y0(cfg.innerHeight).y1(d => yScale(cfg.y(d))).curve(d3.curveMonotoneX));
    svg.append("path").datum(dataset).attr("fill", "none").attr("stroke", cfg.colorLine).attr("stroke-width", 2.0).attr("stroke-linecap", "round").attr("d", d3.line().x(d => xScale(cfg.x(d))).y(d => yScale(cfg.y(d))).curve(d3.curveMonotoneX));

    const focus = svg.append("g").attr("class", "focus").style("display", "none");
    focus.append("line").attr("class", "v-track").attr("y1", 0).attr("y2", cfg.innerHeight).attr("stroke", cfg.colorLine).attr("stroke-width", 0.6).attr("stroke-dasharray", "2 2");
    focus.append("circle").attr("r", 5).attr("fill", cfg.colorLine).attr("stroke", "#f5eedf").attr("stroke-width", 1.5);

    svg.append("rect")
        .attr("class", "mouse-capture").attr("width", cfg.innerWidth).attr("height", cfg.innerHeight).attr("fill", "none").attr("pointer-events", "all").style("cursor", "crosshair")
        .on("mouseover", () => focus.style("display", null))
        .on("mouseout", () => focus.style("display", "none"))
        .on("mousemove", function(event) {
            const mouseX = d3.pointer(event, this)[0];
            const targetHour = Math.max(0, Math.min(23, Math.round(xScale.invert(mouseX))));
            const d = dataset.find(item => item.hour === targetHour) || dataset[targetHour];
            if (!d) return;
            focus.attr("transform", `translate(${xScale(cfg.x(d))}, 0)`);
            focus.select("circle").attr("cy", yScale(cfg.y(d)));
        });
}