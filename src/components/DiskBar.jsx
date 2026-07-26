import React from 'react';
import { HardDrive } from '../Icons';
import { formatSize } from '../utils';

const DiskBar = React.memo(function DiskBar({ diskSpace, rootDirectory }) {
  if (!diskSpace) return null;

  const isRootScan = rootDirectory && (rootDirectory.id === '/' || rootDirectory.id === '/System/Volumes/Data');
  const scannedSize = rootDirectory?.size || 0;
  
  const usedPercent = Math.min((diskSpace.used / diskSpace.total) * 100, 100);
  const scannedPercent = Math.min((scannedSize / diskSpace.total) * 100, 100);
  const freePercent = 100 - usedPercent;
  
  // Color based on usage level
  const usageColor = usedPercent > 90 ? '#f05050' 
    : usedPercent > 75 ? '#ff8528' 
    : usedPercent > 50 ? '#4f8df7' 
    : '#30d870';

  return (
    <div className="disk-bar">
      <div className="disk-bar-info">
        <div className="disk-bar-title">
          <HardDrive size={15} />
          <span>{formatSize(diskSpace.total)} SSD</span>
        </div>
        <div className="disk-bar-detail">
          {!isRootScan && rootDirectory && (
            <span style={{ color: '#60a5fa', fontWeight: 600, marginRight: '6px' }}>
              {formatSize(scannedSize)} in {rootDirectory.name} ·
            </span>
          )}
          <span style={{ color: usageColor, fontWeight: 600 }}>{formatSize(diskSpace.used)}</span>
          {' SSD used · '}
          <span style={{ color: '#30d870', fontWeight: 600 }}>{formatSize(diskSpace.free)}</span>
          {' free'}
        </div>
      </div>
      <div className="disk-bar-track">
        <div 
          className="disk-bar-fill" 
          style={{ 
            width: `${usedPercent}%`,
            background: `linear-gradient(90deg, #30d870 0%, ${usageColor} ${Math.min(usedPercent * 1.2, 100)}%, ${usedPercent > 75 ? '#f05050' : usageColor} 100%)`
          }}
        />
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)',
      }}>
        <span>
          {!isRootScan && rootDirectory ? `${formatSize(scannedSize)} (${scannedPercent.toFixed(1)}% of SSD)` : `${usedPercent.toFixed(1)}% used`}
        </span>
        <span>{freePercent.toFixed(1)}% free</span>
      </div>
    </div>
  );
})

export default DiskBar;
