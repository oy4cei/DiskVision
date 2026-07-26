import React, { useState, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { formatSize, getFileCategory, getNodeColors } from '../utils';

// Helper to calculate SVG path for arcs
function getArcPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
  let diff = endAngle - startAngle;
  if (diff <= 0) return '';
  if (diff >= Math.PI * 2) {
    diff = Math.PI * 1.9999; // Cap to avoid degenerate circles
  }
  const sAngle = startAngle - Math.PI / 2;
  const eAngle = startAngle + diff - Math.PI / 2;

  const x1 = cx + outerRadius * Math.cos(sAngle);
  const y1 = cy + outerRadius * Math.sin(sAngle);
  const x2 = cx + outerRadius * Math.cos(eAngle);
  const y2 = cy + outerRadius * Math.sin(eAngle);

  const x3 = cx + innerRadius * Math.cos(eAngle);
  const y3 = cy + innerRadius * Math.sin(eAngle);
  const x4 = cx + innerRadius * Math.cos(sAngle);
  const y4 = cy + innerRadius * Math.sin(sAngle);

  const largeArc = diff > Math.PI ? 1 : 0;

  return `
    M ${x1} ${y1}
    A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}
    L ${x3} ${y3}
    A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}
    Z
  `;
}

const Sunburst = React.memo(function Sunburst({ activeNode, enterDirectory, showToast }) {
  const [hoveredNode, setHoveredNode] = useState(null);

  const cx = 300;
  const cy = 300;
  const r0 = 100;  // Center circle radius
  const r1 = 190;  // Ring 1 outer radius (direct children)
  const r2 = 275;  // Ring 2 outer radius (grandchildren)

  // 1. Process Ring 1 (direct children)
  const ring1Data = useMemo(() => {
    if (!activeNode || !activeNode.children || activeNode.children.length === 0) return [];
    
    const sorted = [...activeNode.children].sort((a, b) => b.size - a.size);
    const total = activeNode.size || 1;

    // Cap Ring 1 at 30 items
    const limit = 30;
    let items = [];
    if (sorted.length <= limit) {
      items = sorted;
    } else {
      const top = sorted.slice(0, limit - 1);
      const rest = sorted.slice(limit - 1);
      const restSize = rest.reduce((acc, d) => acc + d.size, 0);
      const restFiles = rest.reduce((acc, d) => acc + (d.filesCount || 0), 0);
      const restFolders = rest.reduce((acc, d) => acc + (d.foldersCount || 0), 0);

      items = [
        ...top,
        {
          id: `${activeNode.id}/_sunburst_others`,
          name: `Others (${rest.length} items)`,
          kind: 'skipped',
          size: restSize,
          filesCount: restFiles,
          foldersCount: restFolders,
          children: []
        }
      ];
    }

    let currentAngle = 0;
    return items.map((item) => {
      const angleSpan = (item.size / total) * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angleSpan;
      currentAngle = endAngle;

      return {
        ...item,
        startAngle,
        endAngle,
      };
    });
  }, [activeNode]);

  // 2. Process Ring 2 (grandchildren)
  const ring2Data = useMemo(() => {
    const results = [];
    
    ring1Data.forEach((parent) => {
      if (parent.kind !== 'directory' || !parent.children || parent.children.length === 0) {
        return;
      }

      const parentSpan = parent.endAngle - parent.startAngle;
      if (parentSpan < 0.05) return; // Skip drawing grandchildren if the parent slice is too thin (~3 deg)

      const sortedChildren = [...parent.children].sort((a, b) => b.size - a.size);
      const parentTotalSize = parent.size || 1;

      // Filter out grandchildren that are less than 1% of parent size
      const visibleChildren = sortedChildren.filter(c => (c.size / parentTotalSize) >= 0.01);
      if (visibleChildren.length === 0) return;

      let currentAngle = parent.startAngle;
      // Re-scale angles to fit exactly within parent span
      const visibleSizeSum = visibleChildren.reduce((acc, c) => acc + c.size, 0);
      
      visibleChildren.forEach((child) => {
        const childSpan = (child.size / visibleSizeSum) * parentSpan;
        const startAngle = currentAngle;
        const endAngle = currentAngle + childSpan;
        currentAngle = endAngle;

        results.push({
          ...child,
          startAngle,
          endAngle,
          parentName: parent.name
        });
      });
    });

    return results;
  }, [ring1Data]);

  const handleSliceClick = useCallback((node, e) => {
    e.stopPropagation();
    if (node.kind === 'directory') {
      enterDirectory(node.id);
    }
  }, [enterDirectory]);

  const handleSliceDoubleClick = useCallback(async (node, e) => {
    e.stopPropagation();
    if (node.kind === 'skipped') return;
    try {
      await invoke('open_in_finder', { path: node.id });
      showToast(`Opened "${node.name}" in Finder`);
    } catch (err) {
      showToast(`Failed to open in Finder: ${err}`);
    }
  }, [showToast]);

  // Render info in the center circle
  const activeInfo = hoveredNode || activeNode;
  const percentage = hoveredNode 
    ? ((hoveredNode.size / (activeNode.size || 1)) * 100).toFixed(1) + '%' 
    : '100%';

  return (
    <div className="sunburst-container">
      <div className="sunburst-content">
        <svg 
          viewBox="0 0 600 600" 
          className="sunburst-svg"
          width="100%" 
          height="100%"
        >
          {/* Ring 2: Grandchildren (Outer) */}
          {ring2Data.map((node) => {
            const colors = getNodeColors(node);
            const color = colors.solid;
            const path = getArcPath(cx, cy, r1 + 3, r2, node.startAngle, node.endAngle);
            if (!path) return null;

            return (
              <path
                key={node.id}
                d={path}
                fill={color}
                opacity={hoveredNode?.id === node.id ? 0.98 : 0.5}
                className="sunburst-slice ring-outer"
                style={{
                  transition: 'all 0.15s ease',
                  cursor: node.kind === 'directory' ? 'pointer' : 'default'
                }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={(e) => handleSliceClick(node, e)}
                onDoubleClick={(e) => handleSliceDoubleClick(node, e)}
              />
            );
          })}

          {/* Ring 1: Direct Children (Inner) */}
          {ring1Data.map((node) => {
            const isDir = node.kind === 'directory';
            const colors = getNodeColors(node);
            const color = colors.solid;
            const path = getArcPath(cx, cy, r0 + 3, r1, node.startAngle, node.endAngle);
            if (!path) return null;

            return (
              <path
                key={node.id}
                d={path}
                fill={color}
                opacity={hoveredNode?.id === node.id ? 0.98 : 0.85}
                className="sunburst-slice ring-inner"
                style={{
                  transition: 'all 0.15s ease',
                  cursor: isDir ? 'pointer' : 'default'
                }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={(e) => handleSliceClick(node, e)}
                onDoubleClick={(e) => handleSliceDoubleClick(node, e)}
              />
            );
          })}

          {/* Center Circle (Current active directory details) */}
          <circle
            cx={cx}
            cy={cy}
            r={r0}
            className="sunburst-center"
            fill="var(--bg-surface)"
            stroke="var(--border)"
            strokeWidth="1"
          />
        </svg>

        {/* Text details rendered absolutely on top of the SVG center circle */}
        <div className="sunburst-center-details">
          <div className="sunburst-center-percent">{percentage}</div>
          <div className="sunburst-center-name" title={activeInfo?.name || ''}>
            {activeInfo?.name || 'Disk'}
          </div>
          <div className="sunburst-center-size">
            {formatSize(activeInfo?.size || 0)}
          </div>
          {hoveredNode && (
            <div className="sunburst-center-hint">
              {hoveredNode.kind === 'directory' ? 'Click to open' : 'Double-click to open in Finder'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
})

export default Sunburst;
