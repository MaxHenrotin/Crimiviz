import * as d3 from 'd3';

export function initSeasonalityChart(data, containerSelector) {
    const container = d3.select(containerSelector);
    container.selectAll("*").remove();

    if (!data || data.length === 0) return;

    const cfg = {
        w: 760,
        h: 340,
        margin: { top: 25, right: 30, bottom: 40, left: 55 },
        colorRaw: "#2a1f12",
        colorSmooth: "#7a1010",
        x: d => d.date,
        y: d => d.volume,
        ySmooth: d => d.rollingMean
    };

    cfg.innerWidth = cfg.w - cfg.margin.left - cfg.margin.right;
    cfg.innerHeight = cfg.h - cfg.margin.top - cfg.margin.bottom;

    // MATCHING LOGIC: Combine numeric year and month into a true JavaScript Date
    let dataset = data.map(d => ({
        date: new Date(+d.year, (+d.month) - 1, 1),
        volume: +(d.n || d.volume || d.value || 0)
    })).filter(d => !isNaN(d.date.getTime()));

    if (dataset.length === 0) {
        console.error("Seasonality parsing yielded zero valid records.");
        return;
    }

    dataset.sort((a, b) => a.date - b.date);

    dataset.forEach((d, i) => {
        if (i >= 11) {
            const slice = dataset.slice(i - 11, i + 1);
            d.rollingMean = d3.mean(slice, x => x.volume);
        } else {
            d.rollingMean = null;
        }
    });

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${cfg.w} ${cfg.h}`)
        .style("width", "100%")
        .style("height", "auto")
        .style("overflow", "visible")
        .append("g")
        .attr("transform", `translate(${cfg.margin.left}, ${cfg.margin.top})`);

    const xScale = d3.scaleTime().domain(d3.extent(dataset, cfg.x)).range([0, cfg.innerWidth]);
    const yScale = d3.scaleLinear().domain([0, d3.max(dataset, d => Math.max(cfg.y(d), d.rollingMean || 0)) * 1.05]).range([cfg.innerHeight, 0]);

    svg.append("g")
        .attr("class", "chart-grid")
        .selectAll("line")
        .data(yScale.ticks(5))
        .enter().append("line")
        .attr("x1", 0).attr("x2", cfg.innerWidth)
        .attr("y1", d => yScale(d)).attr("y2", d => yScale(d))
        .attr("stroke", cfg.colorRaw).attr("stroke-width", 0.4).attr("opacity", 0.2).attr("stroke-dasharray", "3 3");

    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${cfg.innerHeight})`)
        .call(d3.axisBottom(xScale).ticks(8).tickSizeOuter(0))
        .call(g => g.select(".domain").attr("stroke", cfg.colorRaw).attr("stroke-width", 0.8).attr("opacity", 0.4))
        .call(g => g.selectAll(".tick text").attr("fill", cfg.colorRaw).attr("font-family", "var(--mono, monospace)").attr("font-size", "11px").attr("dy", "10px"));

    svg.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => d >= 1000 ? `${d / 1000}k` : d))
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick text").attr("fill", cfg.colorRaw).attr("font-family", "var(--mono, monospace)").attr("font-size", "11px"));

    svg.append("path").datum(dataset).attr("fill", "none").attr("stroke", cfg.colorRaw).attr("stroke-width", 1.2).attr("opacity", 0.35).attr("d", d3.line().x(d => xScale(cfg.x(d))).y(d => yScale(cfg.y(d))).curve(d3.curveMonotoneX));
    svg.append("path").datum(dataset).attr("fill", "none").attr("stroke", cfg.colorSmooth).attr("stroke-width", 2.2).attr("stroke-linecap", "round").attr("d", d3.line().defined(d => cfg.ySmooth(d) !== null).x(d => xScale(cfg.x(d))).y(d => yScale(cfg.y(d))));

    const focus = svg.append("g").attr("class", "focus").style("display", "none");
    focus.append("line").attr("class", "v-track").attr("y1", 0).attr("y2", cfg.innerHeight).attr("stroke", cfg.colorSmooth).attr("stroke-width", 0.6).attr("stroke-dasharray", "2 2");
    const focusCircleRaw = focus.append("circle").attr("r", 4).attr("fill", cfg.colorRaw);
    const focusCircleSmooth = focus.append("circle").attr("r", 5).attr("fill", cfg.colorSmooth).attr("stroke", "#f5eedf").attr("stroke-width", 1.5);

    svg.append("rect")
        .attr("class", "mouse-capture").attr("width", cfg.innerWidth).attr("height", cfg.innerHeight).attr("fill", "none").attr("pointer-events", "all").style("cursor", "crosshair")
        .on("mouseover", () => focus.style("display", null))
        .on("mouseout", () => focus.style("display", "none"))
        .on("mousemove", function(event) {
            const mouseX = d3.pointer(event, this)[0];
            const xDate = xScale.invert(mouseX);
            const idx = d3.bisector(cfg.x).left(dataset, xDate, 1);
            const d0 = dataset[idx - 1], d1 = dataset[idx];
            if (!d0 || !d1) return;
            const d = (xDate - cfg.x(d0) > cfg.x(d1) - xDate) ? d1 : d0;
            focus.attr("transform", `translate(${xScale(cfg.x(d))}, 0)`);
            focusCircleRaw.attr("cy", yScale(cfg.y(d)));
            if (cfg.ySmooth(d) !== null) {
                focusCircleSmooth.style("display", null).attr("cy", yScale(cfg.ySmooth(d)));
            } else {
                focusCircleSmooth.style("display", "none");
            }
        });
}