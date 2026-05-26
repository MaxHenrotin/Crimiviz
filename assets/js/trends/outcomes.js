import * as d3 from 'd3';

export function initOutcomesChart(data, containerSelector) {
    const container = d3.select(containerSelector);
    container.selectAll("*").remove();

    if (!data || data.length === 0) return;

    const cfg = {
        w: 760,
        h: 400,
        margin: { top: 25, right: 35, bottom: 40, left: 160 },
        baseline: 0.251,
        colorAbove: "#7a1010",
        colorBelow: "#2a1f12",
        x: d => d.arrestRate,
        y: d => d.category
    };

    cfg.innerWidth = cfg.w - cfg.margin.left - cfg.margin.right;
    cfg.innerHeight = cfg.h - cfg.margin.top - cfg.margin.bottom;

    // MATCHING LOGIC: Uses d.type and d.rate from arrest_rates.json
    let dataset = data.map(d => ({
        category: d.type || d.primary_type || d.category || d.key,
        arrestRate: d.rate !== undefined ? +d.rate : (+d.arrest_rate || 0)
    })).filter(d => d.category !== undefined && d.category !== null);

    if (d3.max(dataset, cfg.x) > 1.0) {
        dataset.forEach(d => { d.arrestRate = d.arrestRate / 100; });
    }

    dataset.sort((a, b) => b.arrestRate - a.arrestRate);

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${cfg.w} ${cfg.h}`)
        .style("width", "100%")
        .style("height", "auto")
        .style("overflow", "visible")
        .append("g")
        .attr("transform", `translate(${cfg.margin.left}, ${cfg.margin.top})`);

    const xScale = d3.scaleLinear().domain([0, Math.max(d3.max(dataset, cfg.x) || 0, cfg.baseline) * 1.05]).range([0, cfg.innerWidth]);
    const yScale = d3.scaleBand().domain(dataset.map(cfg.y)).range([0, cfg.innerHeight]).padding(0.4);

    svg.append("g")
        .selectAll("line")
        .data(dataset).enter().append("line")
        .attr("x1", 0).attr("x2", cfg.innerWidth)
        .attr("y1", d => yScale(cfg.y(d)) + yScale.bandwidth() / 2).attr("y2", d => yScale(cfg.y(d)) + yScale.bandwidth() / 2)
        .attr("stroke", cfg.colorBelow).attr("stroke-width", 0.3).attr("opacity", 0.15);

    const baselineX = xScale(cfg.baseline);
    svg.append("line")
        .attr("x1", baselineX).attr("x2", baselineX).attr("y1", 0).attr("y2", cfg.innerHeight)
        .attr("stroke", cfg.colorBelow).attr("stroke-width", 1.2).attr("stroke-dasharray", "4 4").attr("opacity", 0.6);

    svg.append("text")
        .attr("x", baselineX + 6).attr("y", -6).attr("fill", cfg.colorBelow).attr("opacity", 0.7).attr("font-family", "var(--mono, monospace)").attr("font-size", "10px").attr("font-weight", "500")
        .text(`Baseline (${d3.format(".1%")(cfg.baseline)})`);

    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${cfg.innerHeight})`)
        .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => d3.format(".0%")(d)).tickSizeOuter(0))
        .call(g => g.select(".domain").attr("stroke", cfg.colorBelow).attr("stroke-width", 0.8).attr("opacity", 0.4))
        .call(g => g.selectAll(".tick text").attr("fill", cfg.colorBelow).attr("font-family", "var(--mono, monospace)").attr("font-size", "11px").attr("dy", "10px"));

    svg.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale).tickSize(0))
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick text")
            .attr("fill", cfg.colorBelow).attr("font-family", "var(--sans, system-ui, sans-serif)").attr("font-size", "11px").attr("font-weight", "500").attr("dx", "-8px")
            .text(t => {
                const str = t || "Unknown";
                return str.toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase());
            })
        );

    const dotGroups = svg.selectAll(".dot-group").data(dataset).enter().append("g").attr("class", "dot-group");

    dotGroups.append("circle")
        .attr("cx", d => xScale(cfg.x(d))).attr("cy", d => yScale(cfg.y(d)) + yScale.bandwidth() / 2).attr("r", 5.5)
        .attr("fill", d => cfg.x(d) >= cfg.baseline ? cfg.colorAbove : cfg.colorBelow)
        .attr("opacity", d => cfg.x(d) >= cfg.baseline ? 0.95 : 0.45)
        .attr("stroke", "#f5eedf").attr("stroke-width", 1)
        .style("transition", "transform 0.2s ease, opacity 0.2s ease")
        .on("mouseover", function() { d3.select(this).attr("opacity", 1).attr("r", 7); })
        .on("mouseout", function(event, d) { d3.select(this).attr("opacity", cfg.x(d) >= cfg.baseline ? 0.95 : 0.45).attr("r", 5.5); });

    dotGroups.append("text")
        .attr("x", d => xScale(cfg.x(d)) + 9).attr("y", d => yScale(cfg.y(d)) + yScale.bandwidth() / 2).attr("dy", "0.36em")
        .attr("fill", d => cfg.x(d) >= cfg.baseline ? cfg.colorAbove : cfg.colorBelow).attr("opacity", d => cfg.x(d) >= cfg.baseline ? 1 : 0.6)
        .attr("font-family", "var(--mono, monospace)").attr("font-size", "11px").attr("font-weight", "500")
        .text(d => d3.format(".1%")(cfg.x(d)));
}