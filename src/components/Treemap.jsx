import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Folder, File, HardDrive } from '../Icons';
import { formatSize, getFileCategory, getNodeColors } from '../utils';

const Treemap = React.memo(function Treemap({ activeNode, enterDirectory, showToast }) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [hoveredTile, setHoveredTile] = useState(null);

  // Resize listener
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: Math.max(width, 100),
        height: Math.max(height, 100)
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Limit display to top 40 items + group others
  const items = useMemo(() => {
    if (!activeNode || !activeNode.children) return [];
    const sorted = [...activeNode.children].sort((a, b) => b.size - a.size);

    if (sorted.length <= 40) return sorted;

    const top = sorted.slice(0, 39);
    const rest = sorted.slice(39);
    const restSize = rest.reduce((acc, c) => acc + c.size, 0);
    const restFilesCount = rest.reduce((acc, c) => acc + (c.filesCount || 0), 0);
    const restFoldersCount = rest.reduce((acc, c) => acc + (c.foldersCount || 0), 0);

    top.push({
      id: `${activeNode.id}/_treemap_others`,
      name: `Others (${rest.length} items)`,
      kind: 'skipped',
      size: restSize,
      filesCount: restFilesCount,
      foldersCount: restFoldersCount,
    });

    return top;
  }, [activeNode]);

  // Binary partition layout algorithm
  const tiles = useMemo(() => {
    if (items.length === 0) return [];

    function partition(list, x, y, w, h) {
      if (list.length === 0) return [];
      if (list.length === 1) {
        return [{ ...list[0], x, y, w, h }];
      }

      const subTotal = list.reduce((sum, item) => sum + (item.size || 1), 0);
      let currentSum = 0;
      let splitIdx = 0;
      for (let i = 0; i < list.length; i++) {
        currentSum += list[i].size || 1;
        if (currentSum >= subTotal / 2 || i === list.length - 2) {
          splitIdx = i + 1;
          break;
        }
      }

      const leftPart = list.slice(0, splitIdx);
      const rightPart = list.slice(splitIdx);

      const leftWeight = leftPart.reduce((sum, item) => sum + (item.size || 1), 0);
      const results = [];

      if (w > h) {
        // Split horizontally (left/right columns)
        const w1 = leftWeight > 0 ? (leftWeight / subTotal) * w : 0;
        const w2 = w - w1;
        results.push(...partition(leftPart, x, y, w1, h));
        results.push(...partition(rightPart, x + w1, y, w2, h));
      } else {
        // Split vertically (top/bottom rows)
        const h1 = leftWeight > 0 ? (leftWeight / subTotal) * h : 0;
        const h2 = h - h1;
        results.push(...partition(leftPart, x, y, w, h1));
        results.push(...partition(rightPart, x, y + h1, w, h2));
      }
      return results;
    }

    return partition(items, 0, 0, dimensions.width, dimensions.height);
  }, [items, dimensions]);

  const handleTileClick = useCallback((tile, e) => {
    e.stopPropagation();
    if (tile.kind === 'directory') {
      enterDirectory(tile.id);
    }
  }, [enterDirectory]);

  const handleTileDoubleClick = useCallback(async (tile, e) => {
    e.stopPropagation();
    if (tile.kind === 'skipped') return;
    try {
      await invoke('open_in_finder', { path: tile.id });
      showToast(`Opened "${tile.name}" in Finder`);
    } catch (err) {
      showToast(`Failed to open in Finder: ${err}`);
    }
  }, [showToast]);

  return (
    <div className="treemap-container">
      <div className="treemap-wrapper" ref={containerRef}>
        {tiles.map((tile) => {
          const isDir = tile.kind === 'directory';
          const isSkipped = tile.kind === 'skipped';
          const colors = getNodeColors(tile);
          const accentColor = colors.solid;

          // Calculate dimensions and filter out degenerately small rectangles
          const tileWidth = Math.max(tile.w - 4, 0);
          const tileHeight = Math.max(tile.h - 4, 0);

          if (tileWidth < 15 || tileHeight < 15) return null;

          const isHovered = hoveredTile === tile.id;
          const showDetailedLabel = tileWidth > 75 && tileHeight > 48;

          return (
            <div
              key={tile.id}
              className={`treemap-tile ${isDir ? 'is-directory' : ''} ${isSkipped ? 'is-skipped' : ''}`}
              style={{
                position: 'absolute',
                left: `${tile.x + 2}px`,
                top: `${tile.y + 2}px`,
                width: `${tileWidth}px`,
                height: `${tileHeight}px`,
                backgroundColor: colors.bg,
                borderColor: isHovered ? colors.solid : colors.border,
                borderWidth: '1px',
                borderStyle: 'solid',
                boxShadow: isHovered ? `0 6px 18px ${colors.solid}30, 0 0 12px ${colors.solid}18` : 'none',
                '--accent-color': accentColor,
              }}
              onClick={(e) => handleTileClick(tile, e)}
              onDoubleClick={(e) => handleTileDoubleClick(tile, e)}
              onMouseEnter={() => setHoveredTile(tile.id)}
              onMouseLeave={() => setHoveredTile(null)}
              title={`${tile.name}\nSize: ${formatSize(tile.size)}${isDir ? '\nClick to enter' : ''}\nDouble-click to open in Finder`}
            >
              <div 
                className="treemap-tile-gradient" 
                style={{
                  background: `linear-gradient(135deg, rgba(255,255,255,0.02) 0%, ${accentColor}10 100%)`
                }}
              />
              <div 
                className="treemap-tile-indicator" 
                style={{ backgroundColor: accentColor }}
              />
              <div className="treemap-tile-content">
                {showDetailedLabel ? (
                  <>
                    <div className="treemap-tile-header">
                      {isDir ? (
                        <Folder size={16} color={accentColor} />
                      ) : isSkipped ? (
                        <HardDrive size={16} />
                      ) : (
                        <File size={16} color={accentColor} />
                      )}
                      <span className="treemap-tile-name">{tile.name}</span>
                    </div>
                    <div className="treemap-tile-size">{formatSize(tile.size)}</div>
                  </>
                ) : tileWidth > 35 && tileHeight > 25 ? (
                  <div className="treemap-tile-compact">
                    <span className="treemap-tile-size">{formatSize(tile.size)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
})

export default Treemap;
