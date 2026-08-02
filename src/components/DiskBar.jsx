import React from 'react';
import { HardDrive } from '../Icons';
import { formatSize } from '../utils';

const DiskBar = React.memo(function DiskBar({ diskSpace, rootDirectory }) {
  if (!diskSpace) return null;

  const usedPercent = Math.min((diskSpace.used / diskSpace.total) * 100, 100);
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
          <span style={{ color: usageColor, fontWeight: 600 }}>{formatSize(diskSpace.used)}</span>
          {' used · '}
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
        alignItems: 'center',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)',
      }}>
        <span>{usedPercent.toFixed(1)}% used</span>
        {rootDirectory && diskSpace.used > rootDirectory.size && (diskSpace.used - rootDirectory.size) > 1e9 && (
          <span style={{ color: '#f59e0b', fontSize: '10.5px' }} title="Local APFS Time Machine snapshots, swap memory (/System/Volumes/VM), and macOS protected system files">
            ℹ️ {formatSize(diskSpace.used - rootDirectory.size)} System Data & APFS Snapshots
          </span>
        )}
        <span>{freePercent.toFixed(1)}% free</span>
      </div>
    </div>
  );
})

export default DiskBar;
