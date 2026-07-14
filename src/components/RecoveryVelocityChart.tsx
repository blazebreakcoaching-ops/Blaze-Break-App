import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export const RecoveryVelocityChart = ({ data }: { data: { day: string, score: number, meetings: number }[] }) => {
  const d3Container = useRef(null);

  useEffect(() => {
    if (data && d3Container.current) {
      const margin = { top: 20, right: 30, bottom: 30, left: 40 };
      const width = 600 - margin.left - margin.right;
      const height = 180 - margin.top - margin.bottom;

      // Clear previous
      d3.select(d3Container.current).selectAll('*').remove();

      const svg = d3.select(d3Container.current)
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

      // Add gradients and glow filter
      const defs = svg.append('defs');
      
      // Neon glow filter
      const filter = defs.append('filter')
        .attr('id', 'neon-glow')
        .attr('x', '-20%')
        .attr('y', '-20%')
        .attr('width', '140%')
        .attr('height', '140%');
      filter.append('feGaussianBlur')
        .attr('stdDeviation', '4')
        .attr('result', 'blur');
      filter.append('feMerge')
        .append('feMergeNode')
        .attr('in', 'blur');
      filter.select('feMerge')
        .append('feMergeNode')
        .attr('in', 'SourceGraphic');

      // Gradient for score line area
      const areaGrad = defs.append('linearGradient')
        .attr('id', 'score-area-grad')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');
      areaGrad.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#818cf8')
        .attr('stop-opacity', '0.24');
      areaGrad.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#818cf8')
        .attr('stop-opacity', '0.0');

      // Gradient for bars
      const barGrad = defs.append('linearGradient')
        .attr('id', 'bar-grad')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');
      barGrad.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#1e293b')
        .attr('stop-opacity', '0.85');
      barGrad.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#0f172a')
        .attr('stop-opacity', '0.4');

      // X scale
      const x = d3.scalePoint()
        .domain(data.map(d => d.day))
        .range([0, width])
        .padding(0.5);

      // Y1 scale (Score - higher is better)
      const y1 = d3.scaleLinear()
        .domain([0, 100])
        .range([height, 0]);

      // Y2 scale (Meetings - invert bar height, or just standard bar)
      const y2 = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.meetings) || 10])
        .range([height, 0]);

      // Add X axis
      svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .attr('color', '#475569') // slate-600
        .selectAll('text')
        .attr('font-family', 'var(--font-mono)')
        .attr('font-weight', 'bold')
        .attr('font-size', '9px')
        .attr('fill', '#94a3b8');
      
      // Remove domain line for cleaner look
      svg.selectAll('.domain').remove();
      svg.selectAll('.tick line').remove();

      // Add bars for meetings with micro-metallic borders
      const barWidth = 20;
      svg.selectAll('.bar-rect')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar-rect')
        .attr('x', d => (x(d.day) as number) - barWidth / 2)
        .attr('y', d => y2(d.meetings))
        .attr('width', barWidth)
        .attr('height', d => height - y2(d.meetings))
        .attr('fill', 'url(#bar-grad)')
        .attr('stroke', 'rgba(255, 255, 255, 0.05)')
        .attr('stroke-width', 1)
        .attr('rx', 3);

      // Add area chart under line
      const area = d3.area<any>()
        .x(d => x(d.day) as number)
        .y0(height)
        .y1(d => y1(d.score))
        .curve(d3.curveMonotoneX);

      svg.append('path')
        .datum(data)
        .attr('fill', 'url(#score-area-grad)')
        .attr('d', area);

      // Add line for score with glow filter
      const line = d3.line<any>()
        .x(d => x(d.day) as number)
        .y(d => y1(d.score))
        .curve(d3.curveMonotoneX);

      // Blurred shadow path for neon emission
      svg.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', '#6366f1')
        .attr('stroke-width', 4)
        .attr('opacity', 0.4)
        .attr('filter', 'url(#neon-glow)')
        .attr('d', line);

      svg.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', '#818cf8') // lighter neon indigo on top
        .attr('stroke-width', 2.5)
        .attr('stroke-linecap', 'round')
        .attr('d', line);

      // Add dots for score
      svg.selectAll('.dot')
        .data(data)
        .enter()
        .append('circle')
        .attr('class', 'dot')
        .attr('cx', d => x(d.day) as number)
        .attr('cy', d => y1(d.score))
        .attr('r', 4.5)
        .attr('fill', '#818cf8')
        .attr('stroke', '#02040a') // pristine obsidian background color
        .attr('stroke-width', 2);
    }
  }, [data]);

  return (
    <div className="w-full relative">
       <div ref={d3Container} className="w-full h-full min-h-[180px]" />
       <div className="absolute top-0 right-0 flex items-center gap-4 text-xs font-black uppercase text-text-muted">
         <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-primary rounded-full"></div> Recovery Velocity</div>
         <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-muted-foreground rounded-sm"></div> Meetings Count</div>
       </div>
    </div>
  );
};
