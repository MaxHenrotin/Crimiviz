import * as d3 from 'd3';

export function initCompositionChart(data, containerSelector) {
    const container = d3.select(containerSelector);
    container.selectAll("*").remove();

    if (!data || data.length === 0) return;

    const cfg = {
        w: 760,
        h: 400,
        margin: { top: 25, right: 35, bottom: 40, left: 160 },
        colorTop10: "#7a1010",
        colorTail: "#2a1f12",
        x: d => d.share,
        y: d => d.category
    };

    cfg.innerWidth = cfg.w - cfg.margin.left - cfg.margin.right;
    cfg.innerHeight = cfg.h - cfg.margin.top - cfg.margin.bottom;

    // MATCHING LOGIC: Uses d.type and d.n from crime_types.json
    let rawDataset = data.map(d => ({
        category: d.type || d.primary_type || d.category || d.key,
        count: +d.n || +d.count || +d.value || 0
    })).filter(d => d.category !== undefined && d.category !== null);

    const totalVolume = d3.sum(rawDataset, d => d.count);
    if (totalVolume === 0) return;

    rawDataset.forEach(d => { d.share = d.count / totalVolume; });
    rawDataset.sort((a, b) => b.share - a.share);

    let dataset = rawDataset.slice(0, 10);
    const tailRecords = rawDataset.slice(10);

    if (tailRecords.length > 0) {
        dataset.push({
            category: "OTHERS",
            count: d3.sum(tailRecords, d => d.count),
            share: d3.sum(tailRecords, d => d.share)
        });
    }

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${cfg.w} ${cfg.h}`)
        .style("width", "100%")
        .style("height", "auto")
        .style("overflow", "visible")
        .append("g")
        .attr("transform", `translate(${cfg.margin.left}, ${cfg.margin.top})`);

    const xScale = d3.scaleLinear().domain([0, d3.max(dataset, cfg.x) * 1.08]).range([0, cfg.innerWidth]);
    const yScale = d3.scaleBand().domain(dataset.map(cfg.y)).range([0, cfg.innerHeight]).padding(0.22);

    svg.append("g")
        .attr("class", "chart-grid")
        .selectAll("line")
        .data(xScale.ticks(5))
        .enter().append("line")
        .attr("x1", d => xScale(d)).attr("x2", d => xScale(d))
        .attr("y1", 0).attr("y2", cfg.innerHeight)
        .attr("stroke", cfg.colorTail).attr("stroke-width", 0.4).attr("opacity", 0.15).attr("stroke-dasharray", "3 3");

    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${cfg.innerHeight})`)
        .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => d3.format(".0%")(d)).tickSizeOuter(0))
        .call(g => g.select(".domain").attr("stroke", cfg.colorTail).attr("stroke-width", 0.8).attr("opacity", 0.4))
        .call(g => g.selectAll(".tick text").attr("fill", cfg.colorTail).attr("font-family", "var(--mono, monospace)").attr("font-size", "11px").attr("dy", "10px"));

    svg.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale).tickSize(0))
        .call(g => g.select(".domain").attr("stroke", cfg.colorTail).attr("stroke-width", 0.6).attr("opacity", 0.3))
        .call(g => g.selectAll(".tick text")
            .attr("fill", cfg.colorTail).attr("font-family", "var(--sans, system-ui, sans-serif)").attr("font-size", "11px").attr("font-weight", "500").attr("dx", "-8px")
            .text(t => {
                const str = t || "Unknown";
                return str.toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase());
            })
        );

    const barGroups = svg.selectAll(".bar-group").data(dataset).enter().append("g").attr("class", "bar-group");

    barGroups.append("rect")
        .attr("x", 0).attr("y", d => yScale(cfg.y(d))).attr("width", d => xScale(cfg.x(d))).attr("height", yScale.bandwidth())
        .attr("fill", (d, i) => i === dataset.length - 1 && tailRecords.length > 0 ? cfg.colorTail : cfg.colorTop10)
        .attr("opacity", (d, i) => i === dataset.length - 1 && tailRecords.length > 0 ? 0.45 : 0.9)
        .style("transition", "opacity 0.2s ease")
        .on("mouseover", function() { d3.select(this).attr("opacity", 1); })
        .on("mouseout", function(event, d) {
            const idx = dataset.indexOf(d);
            d3.select(this).attr("opacity", idx === dataset.length - 1 && tailRecords.length > 0 ? 0.45 : 0.9);
        });

    barGroups.append("text")
        .attr("x", d => xScale(cfg.x(d)) + 6).attr("y", d => yScale(cfg.y(d)) + yScale.bandwidth() / 2).attr("dy", "0.36em")
        .attr("fill", cfg.colorTail).attr("font-family", "var(--mono, monospace)").attr("font-size", "11px").attr("font-weight", "500")
        .text(d => d3.format(".1%")(cfg.x(d)));
}