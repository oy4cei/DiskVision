import React from 'react';
import { HardDrive, Folder } from '../Icons';
import { formatSize, getCategoryColor, getCategoryDisplayName } from '../utils';

const Sidebar = React.memo(function Sidebar({
  apiSupported,
  isScanning,
  rootDirectory,
  currentDirId,
  activeNode,
  sidebarFoldersList,
  categoryStats,
  handleScanDirectoryPicker,
  handleScanEntireDisk,
  triggerFileInput,
  enterDirectory,
  selectedCategory,
  setSelectedCategory,
  onRootDeviceClick,
  diskSpace,
}) {
  const getBadgeClass = (size) => {
    const GB = 1e9;
    if (size > 100 * GB) return 'red';
    if (size > 10 * GB) return 'amber';
    return 'green';
  };

  const isRootDevice = rootDirectory && (rootDirectory.id === '/' || !rootDirectory.id.includes('/'));
  const deviceSize = (diskSpace && diskSpace.used && isRootDevice) 
    ? diskSpace.used 
    : (rootDirectory?.size || 0);

  return (
    <div className="sidebar">
      {/* Drag region for window title bar area */}
      <div className="sidebar-drag-region">
        <span className="sidebar-app-name">DiskVision</span>
      </div>

      {/* Scan buttons */}
      <div className="sidebar-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <button 
          className="sidebar-scan-btn" 
          onClick={handleScanEntireDisk}
          disabled={isScanning}
        >
          <HardDrive size={16} />
          {isScanning ? 'Scanning…' : 'Scan Entire Disk'}
        </button>
        <button 
          className="sidebar-scan-btn-secondary" 
          onClick={apiSupported ? handleScanDirectoryPicker : triggerFileInput}
          disabled={isScanning}
        >
          Select Folder
        </button>
      </div>

      {rootDirectory && (
        <>
          {/* Root device */}
          <div className="sidebar-label">Device</div>
          <div className="sidebar-nav" style={{ maxHeight: 'none' }}>
            <div 
              className={`sidebar-nav-item ${currentDirId === rootDirectory.id ? 'active' : ''}`}
              onClick={onRootDeviceClick}
            >
              <div className="sidebar-nav-left">
                <HardDrive size={14} />
                <span>{rootDirectory.name}</span>
              </div>
              <div className="sidebar-nav-right">
                <span className={`badge ${getBadgeClass(deviceSize)}`}>
                  {formatSize(deviceSize)}
                </span>
              </div>
            </div>
          </div>

          {/* Top-level folders */}
          <div className="sidebar-label">Folders</div>
          <div className="sidebar-nav">
            {sidebarFoldersList.map(folder => {
              const isActive = currentDirId === folder.id;
              const percent = rootDirectory.size > 0 
                ? ((folder.size / rootDirectory.size) * 100).toFixed(0) 
                : 0;
              return (
                <div 
                  className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  key={folder.id}
                  onClick={() => enterDirectory(folder.id)}
                >
                  <div className="sidebar-nav-left">
                    <Folder size={14} color="#60a5fa" fill="#60a5fa" fillOpacity={0.12} />
                    <span>{folder.name}</span>
                  </div>
                  <div className="sidebar-nav-right">
                    <span className={`badge ${getBadgeClass(folder.size)}`}>
                      {formatSize(folder.size).split(' ')[0]}
                    </span>
                    <span className="badge muted">{percent}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Storage summary */}
          <div className="sidebar-label">Overview</div>
          <div className="sidebar-stats">
            <div className="stat-row">
              <span className="label">Total</span>
              <span className="value">{formatSize(activeNode?.size || 0)}</span>
            </div>
            <div className="stat-row">
              <span className="label">Files</span>
              <span className="value">{(activeNode?.filesCount || 0).toLocaleString()}</span>
            </div>
            <div className="stat-row">
              <span className="label">Folders</span>
              <span className="value">{(activeNode?.foldersCount || 0).toLocaleString()}</span>
            </div>
          </div>

          {/* File categories */}
          <div className="sidebar-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Categories</span>
            <span style={{ fontSize: '9px', textTransform: 'none', fontWeight: 400, opacity: 0.6 }}>in folder</span>
          </div>
          <div className="sidebar-categories">
            {categoryStats.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '11.5px', textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>
                No categories larger than 5 GB
              </div>
            ) : (
              categoryStats.map(cat => (
                <div 
                  className={`category-row ${selectedCategory === cat.name ? 'active' : ''}`}
                  key={cat.name}
                  onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
                  title={selectedCategory === cat.name ? "Reset filter" : `Show ${getCategoryDisplayName(cat.name)} files`}
                >
                  <div className="category-dot" style={{ background: getCategoryColor(cat.name) }} />
                  <div className="category-info">
                    <div className="category-metadata">
                      <span className="category-name">
                        {getCategoryDisplayName(cat.name)}
                      </span>
                      <span className="category-count">
                        {(cat.count || 0).toLocaleString()} files
                      </span>
                    </div>
                    <span className="category-value">
                      {formatSize(cat.size)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
})

export default Sidebar;
