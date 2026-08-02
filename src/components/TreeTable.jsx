import React, { useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, ChevronDown, Folder, File, Info, Trash } from '../Icons';
import { formatSize, getFileCategory, getCategoryColor } from '../utils';
import { invoke } from '@tauri-apps/api/core';

const TreeTable = React.memo(function TreeTable({
  visibleRows,
  activeNode,
  expandedPaths,
  selectedPath,
  setSelectedPath,
  toggleExpand,
  handleDeleteNode,
  requestSort,
  sortConfig,
  showToast
}) {
  const parentRef = useRef(null);

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 42,
    overscan: 12,
  });

  const handleRowClick = useCallback((row, e) => {
    if (row.kind === 'skipped') return;
    setSelectedPath(row.id);
    // If it's a directory, also toggle expansion
    if (row.kind === 'directory') {
      toggleExpand(row.id, e);
    }
  }, [setSelectedPath, toggleExpand]);

  const handleRowDoubleClick = useCallback(async (row, e) => {
    e.stopPropagation();
    if (row.kind === 'skipped') return;
    try {
      await invoke('open_in_finder', { path: row.id });
      showToast(`Opened "${row.name}" in Finder`);
    } catch (err) {
      showToast(`Failed to open in Finder: ${err}`);
    }
  }, [showToast]);

  const getSortIndicator = (key) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return sortConfig.direction === 'desc' ? ' ↓' : ' ↑';
  };

  return (
    <div className="tree-table-wrapper">
      <div className="tree-table-header-grid">
        <div className="th" onClick={() => requestSort('name')}>
          Name{getSortIndicator('name')}
        </div>
        <div className="th col-size" onClick={() => requestSort('size')}>
          Size{getSortIndicator('size')}
        </div>
        <div className="th col-files" onClick={() => requestSort('filesCount')}>
          Files{getSortIndicator('filesCount')}
        </div>
        <div className="th col-folders" onClick={() => requestSort('foldersCount')}>
          Folders{getSortIndicator('foldersCount')}
        </div>
        <div className="th col-percent">% of Parent</div>
        <div className="th col-actions"></div>
      </div>

      <div ref={parentRef} className="tree-table-scroll-container">
        <div 
          className="tree-table-inner"
          style={{ 
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative'
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = visibleRows[virtualRow.index];
            const isDir = row.kind === 'directory';
            const isSkipped = row.kind === 'skipped';
            const isSystemInfo = row.kind === 'system_info';
            const percentOfParent = activeNode && activeNode.size > 0 
              ? ((row.size / activeNode.size) * 100) 
              : 0;
            const isExpanded = expandedPaths.has(row.id);
            const isRowSelected = selectedPath === row.id;

            let rowClass = 'tree-table-row-grid';
            if (isRowSelected) rowClass += ' selected';
            if (isSkipped) rowClass += ' skipped-files-row';
            if (isSystemInfo) rowClass += ' system-info-row';

            const category = getFileCategory(row.name, isDir, row.id);
            const color = getCategoryColor(category);

            return (
              <div
                key={row.id}
                className={rowClass}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`
                }}
                onClick={(e) => (isSkipped || isSystemInfo) ? null : handleRowClick(row, e)}
                onDoubleClick={(e) => (isSkipped || isSystemInfo) ? null : handleRowDoubleClick(row, e)}
                title={isDir 
                  ? 'Click to expand · Double-click to open in Finder' 
                  : isSystemInfo
                  ? 'APFS local snapshots, swap files (/System/Volumes/VM), and macOS protected system data'
                  : 'Double-click to open in Finder'}
              >
                {/* Name Column */}
                <div className="td col-name" style={{ paddingLeft: `${12 + row.depth * 18}px` }}>
                  {isDir ? (
                    <div className="expander" onClick={(e) => { e.stopPropagation(); toggleExpand(row.id, e); }}>
                      {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </div>
                  ) : (
                    <div className="expander hidden"><ChevronRight size={11} /></div>
                  )}

                  <span className="node-icon">
                    {isDir ? (
                      <Folder size={14} color="#60a5fa" fill="#60a5fa" fillOpacity={0.12} />
                    ) : isSkipped ? (
                      <Info size={14} color="var(--text-muted)" />
                    ) : isSystemInfo ? (
                      <Info size={14} color="#f59e0b" />
                    ) : (
                      <File size={14} color={color} />
                    )}
                  </span>

                  <span className={`name-text ${isDir ? 'dir' : ''} ${isSystemInfo ? 'system-info' : ''}`}>
                    {row.name}
                  </span>
                </div>
                
                {/* Size */}
                <div className="td col-size">{formatSize(row.size)}</div>
                
                {/* Files */}
                <div className="td col-files">
                  {isSkipped ? '–' : row.filesCount.toLocaleString()}
                </div>
                
                {/* Folders */}
                <div className="td col-folders">
                  {isDir ? row.foldersCount.toLocaleString() : '–'}
                </div>
                
                {/* Percent of parent */}
                <div className="td col-percent">
                  {!isSkipped && (
                    <div className="progress-container">
                      <div className="progress-track">
                        <div 
                          className="progress-fill" 
                          style={{ 
                            width: `${percentOfParent}%`,
                            background: `${color}cc`
                          }}
                        >
                          {percentOfParent >= 15 && `${percentOfParent.toFixed(0)}%`}
                        </div>
                      </div>
                      <span className="progress-text">
                        {percentOfParent >= 0.1 ? percentOfParent.toFixed(1) : '< 0.1'}%
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Actions */}
                <div className="td col-actions">
                  {!isSkipped && (
                    <button 
                      className="row-action-btn"
                      onClick={(e) => { e.stopPropagation(); handleDeleteNode(row, e); }}
                      title="Delete"
                    >
                      <Trash size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
})

export default TreeTable;
