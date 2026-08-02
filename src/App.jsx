import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { formatSize, getFileCategory, getCategoryColor } from './utils';
import { HardDrive } from './Icons';
import './App.css';
import Sidebar from './components/Sidebar';
import DiskBar from './components/DiskBar';
import Header from './components/Header';
import TreeTable from './components/TreeTable';
import Treemap from './components/Treemap';
import Sunburst from './components/Sunburst';

// ─── Tree Utilities ───

/** Recursively removes a node from the tree and recomputes sizes/counts */
function removeNodeFromTree(node, targetId) {
  if (node.id === targetId) return null;
  if (!node.children) return node;

  const newChildren = node.children
    .map(child => removeNodeFromTree(child, targetId))
    .filter(Boolean);

  let newSize = 0;
  let newFilesCount = 0;
  let newFoldersCount = 0;

  for (const child of newChildren) {
    if (child.kind === 'directory') {
      newFoldersCount += 1 + child.foldersCount;
      newFilesCount += child.filesCount;
    } else {
      newFilesCount += 1;
    }
    newSize += child.size;
  }

  return { ...node, children: newChildren, size: newSize, filesCount: newFilesCount, foldersCount: newFoldersCount };
}

/** Recursively sorts a copy of the tree */
function sortTree(node, key, direction) {
  if (!node.children) return node;

  const sortedChildren = [...node.children].map(child => sortTree(child, key, direction));

  sortedChildren.sort((a, b) => {
    let valA = a[key];
    let valB = b[key];

    if (key === 'name') {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    }

    if (typeof valA === 'string') {
      return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return direction === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
  });

  return { ...node, children: sortedChildren };
}




function findNodeInTree(node, id) {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeInTree(child, id);
      if (found) return found;
    }
  }
  return null;
}

function mergeSubtree(node, targetId, newNode) {
  if (!node) return null;
  if (node.id === targetId) {
    return newNode;
  }
  if (node.children) {
    return {
      ...node,
      children: node.children.map(child => mergeSubtree(child, targetId, newNode))
    };
  }
  return node;
}

function filterNodeByCategory(node, category) {
  if (!node) return null;
  if (node.kind === 'file') {
    const fileCat = getFileCategory(node.name, false, node.id);
    return fileCat === category ? node : null;
  }

  const catSize = node.categorySizes?.[category] || 0;
  if (catSize === 0) return null;

  const filteredChildren = (node.children || [])
    .map(child => filterNodeByCategory(child, category))
    .filter(Boolean);

  return {
    ...node,
    size: catSize,
    filesCount: node.categoryFilesCount?.[category] || 0,
    children: filteredChildren
  };
}

// ─── App Component ───

function App() {
  const [rootDirectory, setRootDirectory] = useState(null);
  const [currentDirId, setCurrentDirId] = useState('');
  const [activeNode, setActiveNode] = useState(null);
  const [isFallbackScan, setIsFallbackScan] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [selectedPath, setSelectedPath] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStats, setScanStats] = useState({ filesCount: 0, foldersCount: 0, totalSize: 0, currentPath: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'size', direction: 'desc' });
  const [toast, setToast] = useState(null);
  const [diskSpace, setDiskSpace] = useState({ total: 500 * 1e9, used: 250 * 1e9, free: 250 * 1e9 });
  const [currentView, setView] = useState(() => localStorage.getItem('diskvision_view') || 'table');
  const [showFdaModal, setShowFdaModal] = useState(false);
  const [extraTrashNode, setExtraTrashNode] = useState(null);

  const fileInputRef = useRef(null);
  const abortSignalRef = useRef(null);

  // Check Full Disk Access on launch — skip if already granted or previously dismissed
  useEffect(() => {
    async function checkFdaOnLaunch() {
      try {
        const hasFda = await invoke('check_full_disk_access');
        if (hasFda) {
          // FDA is granted — clear any old dismissal flag
          localStorage.removeItem('diskvision_fda_dismissed');
          return;
        }
        // Only show modal if user hasn't dismissed it before
        const dismissed = localStorage.getItem('diskvision_fda_dismissed');
        if (!dismissed) {
          setShowFdaModal(true);
        }
      } catch (err) {
        console.error("FDA auto-check failed:", err);
      }
    }
    checkFdaOnLaunch();
  }, []);

  useEffect(() => {
    localStorage.setItem('diskvision_view', currentView);
  }, [currentView]);

  const showToast = useCallback((message) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (!currentDirId) return;
    
    if (isFallbackScan) {
      if (rootDirectory) {
        const found = findNodeInTree(rootDirectory, currentDirId);
        setActiveNode(found || rootDirectory);
      }
      return;
    }

    let active = true;
    const fetchNode = async () => {
      try {
        const node = await invoke('get_directory_node', { path: currentDirId, depth: 2 });
        if (active) {
          setActiveNode(node);
        }
      } catch (err) {
        console.error("Failed to fetch directory node:", err);
      }
    };
    fetchNode();
    
    return () => { active = false; };
  }, [currentDirId, isFallbackScan]);

  // Fetch disk space and Trash node from Rust backend
  useEffect(() => {
    const fetchDiskSpace = async () => {
      const path = rootDirectory ? rootDirectory.id : '/';
      try {
        const space = await invoke('get_disk_space', { path });
        setDiskSpace(space);
      } catch (err) {
        console.error("Failed to fetch disk space:", err);
      }
    };
    const fetchTrash = async () => {
      try {
        const trash = await invoke('get_trash_node');
        console.log('[Trash] Got trash node:', trash?.size, 'bytes');
        if (trash) {
          setExtraTrashNode(trash);
        }
      } catch (err) {
        console.error('[Trash] Failed to get trash node:', err);
      }
    };
    fetchDiskSpace();
    fetchTrash();
  }, [rootDirectory]);

  // ─── Scan Actions ───

  const startScanProcess = (folderName) => {
    setIsScanning(true);
    setRootDirectory(null);
    setActiveNode(null);
    setSelectedPath('');
    setScanStats({ filesCount: 0, foldersCount: 0, totalSize: 0, currentPath: folderName });
  };

  const runScan = async (scanPath) => {
    try {
      setIsFallbackScan(false);
      startScanProcess(scanPath);

      const unlisten = await listen('scan-progress', (event) => {
        setScanStats(event.payload);
      });

      const rootNode = await invoke('scan_directory', { path: scanPath });
      unlisten();

      if (rootNode) {
        // When scanning root '/', cap total size at OS-reported used space.
        // APFS clones share physical blocks but report full st_blocks per inode,
        // so per-file sums can exceed actual disk usage by ~10-15 GB.
        if (scanPath === '/') {
          try {
            const space = await invoke('get_disk_space', { path: '/' });
            if (space && space.used > 0 && rootNode.size > space.used) {
              rootNode.size = space.used;
            }
            setDiskSpace(space);
          } catch (e) {
            console.warn('Could not fetch disk space for cap:', e);
          }
        }

        setRootDirectory(rootNode);
        setActiveNode(rootNode);
        setCurrentDirId(rootNode.id);
        setExpandedPaths(new Set([rootNode.id]));
        setScanStats({
          filesCount: rootNode.filesCount || 0,
          foldersCount: rootNode.foldersCount || 0,
          totalSize: rootNode.size || 0,
          currentPath: rootNode.name || scanPath
        });

        // Query backend for Trash node anywhere in the scanned tree
        try {
          const trash = await invoke('get_trash_node');
          console.log('[Trash] Got trash node:', trash?.size, 'bytes, children:', trash?.children?.length);
          if (trash) {
            setExtraTrashNode(trash);
          } else {
            setExtraTrashNode(null);
          }
        } catch (e) {
          console.error('[Trash] Failed to get trash node:', e);
          setExtraTrashNode(null);
        }
      }
      setIsScanning(false);
    } catch (err) {
      console.error("Scan failed:", err);
      showToast(`Scan Error: ${err}`);
      setIsScanning(false);
    }
  };

  const handleScanDirectoryPicker = async () => {
    const selectedPath = await open({ directory: true, multiple: false });
    if (!selectedPath) return;
    await runScan(selectedPath);
  };

  const handleScanEntireDisk = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: 'Select Disk or Folder to Scan'
      });
      if (selectedPath) {
        await runScan(selectedPath);
      }
    } catch (e) {
      await runScan('/');
    }
  };

  const handleFallbackScan = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const rootName = files[0].webkitRelativePath.split('/')[0] || 'Selected Folder';
    setIsFallbackScan(true);
    startScanProcess(rootName);

    let index = 0;
    const batchSize = 100;
    const totalFiles = files.length;
    let sizeAccumulated = 0;

    const interval = setInterval(() => {
      const limit = Math.min(index + batchSize, totalFiles);
      for (let i = index; i < limit; i++) sizeAccumulated += files[i].size;
      index = limit;

      setScanStats({
        filesCount: index,
        foldersCount: Math.round(index * 0.1),
        totalSize: sizeAccumulated,
        currentPath: files[index - 1]?.webkitRelativePath || ''
      });

      if (index >= totalFiles) {
        clearInterval(interval);
        const tree = buildTreeFromFileList(files, rootName);
        setRootDirectory(tree);
        setActiveNode(tree);
        setCurrentDirId(tree.id);
        setExpandedPaths(new Set([tree.id]));
        setIsScanning(false);
      }
    }, 50);

    abortSignalRef.current = {
      cancelled: false,
      cancel: () => { clearInterval(interval); setIsScanning(false); }
    };
  };

  const handleCancelScan = () => {
    if (abortSignalRef.current) {
      if (typeof abortSignalRef.current.cancel === 'function') {
        abortSignalRef.current.cancel();
      } else {
        abortSignalRef.current.cancelled = true;
      }
      setIsScanning(false);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  // Build tree from webkit file list (fallback)
  const buildTreeFromFileList = (files, rootName) => {
    const rootNode = { id: rootName, name: rootName, kind: 'directory', size: 0, filesCount: 0, foldersCount: 0, children: [] };
    const dirMap = { '': rootNode };

    for (const file of files) {
      const parts = file.webkitRelativePath.split('/');
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (isLast) {
          const parentNode = dirMap[parentPath];
          if (parentNode) {
            parentNode.children.push({ id: currentPath, name: part, kind: 'file', size: file.size, filesCount: 1, foldersCount: 0 });
          }
        } else if (!dirMap[currentPath]) {
          const parentNode = dirMap[parentPath];
          const newDir = { id: currentPath, name: part, kind: 'directory', size: 0, filesCount: 0, foldersCount: 0, children: [] };
          dirMap[currentPath] = newDir;
          if (parentNode) parentNode.children.push(newDir);
        }
      }
    }

    function computeSizes(node) {
      let size = 0, filesCount = 0, foldersCount = 0;
      const categorySizes = {};
      const categoryFilesCount = {};

      for (const child of node.children) {
        if (child.kind === 'directory') {
          foldersCount++;
          const sub = computeSizes(child);
          size += sub.size; 
          filesCount += sub.filesCount; 
          foldersCount += sub.foldersCount;
          
          if (sub.categorySizes) {
            for (const [cat, sz] of Object.entries(sub.categorySizes)) {
              categorySizes[cat] = (categorySizes[cat] || 0) + sz;
            }
          }
          if (sub.categoryFilesCount) {
            for (const [cat, count] of Object.entries(sub.categoryFilesCount)) {
              categoryFilesCount[cat] = (categoryFilesCount[cat] || 0) + count;
            }
          }
        } else {
          filesCount++; 
          size += child.size;
          
          const cat = getFileCategory(child.name, false, child.id);
          categorySizes[cat] = (categorySizes[cat] || 0) + child.size;
          categoryFilesCount[cat] = (categoryFilesCount[cat] || 0) + 1;
          
          child.categorySizes = { [cat]: child.size };
          child.categoryFilesCount = { [cat]: 1 };
        }
      }
      node.size = size; 
      node.filesCount = filesCount; 
      node.foldersCount = foldersCount;
      node.categorySizes = categorySizes;
      node.categoryFilesCount = categoryFilesCount;
      node.children.sort((a, b) => b.size - a.size);
      return node;
    }

    computeSizes(rootNode);
    return rootNode;
  };

  // ─── Computed State ───

  const unfilteredActiveNode = activeNode;

  const filteredActiveNode = useMemo(() => {
    if (!activeNode) return null;
    if (!selectedCategory) return activeNode;
    return filterNodeByCategory(activeNode, selectedCategory);
  }, [activeNode, selectedCategory]);

  const sortedTree = useMemo(() => {
    if (!filteredActiveNode) return null;
    return sortTree(filteredActiveNode, sortConfig.key, sortConfig.direction);
  }, [filteredActiveNode, sortConfig]);

  // Visible rows with 80% file threshold
  const visibleRows = useMemo(() => {
    if (!sortedTree) return [];

    function getRows(node, depth = 0) {
      if (!node) return [];

      let children = node.children || [];
      let rows = [];
      const dirs = children.filter(c => c.kind === 'directory');
      dirs.sort((a, b) => b.size - a.size);

      const files = children.filter(c => c.kind === 'file');
      files.sort((a, b) => b.size - a.size);

      // 80% file threshold filter for files
      const totalFilesSize = files.reduce((acc, f) => acc + f.size, 0);
      const filteredFiles = [];
      let runningSum = 0;

      for (const file of files) {
        if (runningSum < totalFilesSize * 0.8 || filteredFiles.length === 0) {
          filteredFiles.push(file);
          runningSum += file.size;
        } else break;
      }

      const skippedFileCount = files.length - filteredFiles.length;
      const skippedFileSize = totalFilesSize - runningSum;

      // Render ALL directories (sorted by size) + significant files
      const childrenToRender = [...dirs, ...filteredFiles];

      for (const child of childrenToRender) {
        const matchesSearch = child.name.toLowerCase().includes(searchQuery.toLowerCase());
        if (matchesSearch || searchQuery === '') {
          rows.push({ ...child, depth });
        }
        if (child.kind === 'directory' && expandedPaths.has(child.id)) {
          rows.push(...getRows(child, depth + 1));
        }
      }

      // Skipped small files row
      if (skippedFileCount > 0 && searchQuery === '') {
        rows.push({
          id: `${node.id}/_skipped`,
          name: `... and ${skippedFileCount.toLocaleString()} more small files (${formatSize(skippedFileSize)})`,
          kind: 'skipped',
          size: skippedFileSize,
          filesCount: skippedFileCount,
          foldersCount: 0,
          depth
        });
      }

      return rows;
    }

    const rows = getRows(sortedTree, 0);

    // Append system overhead row if viewing root directory and there is unaccounted OS storage
    if (rootDirectory && activeNode && activeNode.id === rootDirectory.id && diskSpace && diskSpace.used > rootDirectory.size) {
      const systemOverhead = diskSpace.used - rootDirectory.size;
      if (systemOverhead > 1e9) {
        rows.push({
          id: 'virtual:system_overhead',
          name: 'System Data & APFS Snapshots (local Time Machine snapshots, swap /System/Volumes/VM, macOS protection)',
          kind: 'system_info',
          size: systemOverhead,
          filesCount: 0,
          foldersCount: 0,
          depth: 0
        });
      }
    }

    return rows;
  }, [sortedTree, expandedPaths, searchQuery, selectedCategory, rootDirectory, activeNode, diskSpace]);

  // Optimized category stats retrieval using pre-calculated map properties (O(1) in JS)
  const categoryStats = useMemo(() => {
    if (!unfilteredActiveNode) return [];
    
    const sizes = unfilteredActiveNode.categorySizes || {};
    const counts = unfilteredActiveNode.categoryFilesCount || {};

    return Object.keys(sizes)
      .map(cat => ({
        name: cat,
        size: sizes[cat] || 0,
        count: counts[cat] || 0
      }))
      .filter(cat => cat.size >= 5 * 1e9)
      .sort((a, b) => b.size - a.size);
  }, [unfilteredActiveNode]);

  // Top-level folders for sidebar (+ Trash from system/AppleScript)
  const sidebarFoldersList = useMemo(() => {
    if (!rootDirectory || !rootDirectory.children) return [];
    
    // Filter out any scan-tree Trash nodes (which have incomplete metadata due to TCC)
    const topDirs = rootDirectory.children.filter(
      c => c.kind === 'directory' && c.name !== '.Trash' && c.name !== '.Trashes' && c.name !== 'Trash'
    );
    
    const result = [...topDirs];
    if (extraTrashNode) {
      result.push(extraTrashNode);
    }
    
    // Sort all folders including Trash by size descending
    return result.sort((a, b) => b.size - a.size);
  }, [rootDirectory, extraTrashNode]);

  // ─── Event Handlers ───

  const toggleExpand = useCallback(async (id, e) => {
    if (e) e.stopPropagation();

    const isExpanding = !expandedPaths.has(id);
    if (isExpanding && !isFallbackScan && activeNode) {
      const found = findNodeInTree(activeNode, id);
      const needsFetch = !found || (found.kind === 'directory' && (!found.children || found.children.length === 0));

      if (needsFetch) {
        try {
          const fetchedNode = await invoke('get_directory_node', { path: id, depth: 2 });
          if (fetchedNode) {
            setActiveNode(prev => mergeSubtree(prev, id, fetchedNode));
          }
        } catch (err) {
          console.error("Failed to load lazy folder node:", err);
        }
      }
    }

    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [expandedPaths, isFallbackScan, activeNode]);

  const enterDirectory = useCallback((id) => {
    setCurrentDirId(id);
    setExpandedPaths(new Set([id]));
    setSelectedPath('');
  }, []);

  const handleRootDeviceClick = useCallback(() => {
    if (rootDirectory) {
      setCurrentDirId(rootDirectory.id);
      setActiveNode(rootDirectory);
      setExpandedPaths(new Set([rootDirectory.id]));
      setSelectedPath('');
      setSelectedCategory(null);
      setSearchQuery('');
    }
  }, [rootDirectory]);

  const handleDeleteNode = useCallback(async (node, e) => {
    e.stopPropagation();
    const isFile = node.kind === 'file';
    const msg = `Permanently delete ${isFile ? 'file' : 'folder'} "${node.name}" (${formatSize(node.size)})?`;
    if (!window.confirm(msg)) return;

    try {
      if (node.handle && typeof node.handle.remove === 'function') {
        await node.handle.remove({ recursive: true });
      }
      
      let newRoot;
      if (isFallbackScan) {
        newRoot = removeNodeFromTree(rootDirectory, node.id);
      } else {
        newRoot = await invoke('delete_node', { path: node.id });
      }
      
      setRootDirectory(newRoot);
      if (currentDirId === node.id || currentDirId.startsWith(node.id + '/')) {
        setCurrentDirId(newRoot.id);
        setActiveNode(newRoot);
      } else {
        if (isFallbackScan) {
          const found = findNodeInTree(newRoot, currentDirId);
          setActiveNode(found || newRoot);
        } else {
          const updatedNode = await invoke('get_directory_node', { path: currentDirId, depth: 2 });
          setActiveNode(updatedNode);
        }
      }
      setSelectedPath('');
    } catch (err) {
      console.error("Delete failed:", err);
      showToast(`Delete failed: ${err.message || err}`);
    }
  }, [rootDirectory, currentDirId, isFallbackScan, showToast]);

  const requestSort = useCallback((key) => {
    setSortConfig(prev => {
      let direction = 'desc';
      if (prev.key === key && prev.direction === 'desc') direction = 'asc';
      return { key, direction };
    });
  }, []);

  const breadcrumbs = useMemo(() => {
    if (!rootDirectory || !activeNode) return [];
    const rootId = rootDirectory.id;
    if (activeNode.id === rootId) return [{ name: rootDirectory.name, id: rootId }];

    if (activeNode.id === "virtual:trash") {
      return [{ name: rootDirectory.name, id: rootId }, { name: "Trash", id: "virtual:trash" }];
    }
    if (activeNode.id.startsWith("trash:")) {
      return [
        { name: rootDirectory.name, id: rootId },
        { name: "Trash", id: "virtual:trash" },
        { name: activeNode.name, id: activeNode.id }
      ];
    }

    const relativePath = activeNode.id.replace(rootId + '/', '');
    const segments = relativePath.split('/');
    const crumbs = [{ name: rootDirectory.name, id: rootId }];
    let currentPath = rootId;

    for (const segment of segments) {
      currentPath = `${currentPath}/${segment}`;
      crumbs.push({ name: segment, id: currentPath });
    }
    return crumbs;
  }, [rootDirectory, activeNode]);

  // ─── Render ───

  return (
    <div className="app-container">
      {/* Hidden file input for fallback */}
      <input
        type="file"
        ref={fileInputRef}
        webkitdirectory="true"
        directory="true"
        onChange={handleFallbackScan}
        style={{ display: 'none' }}
      />

      <Sidebar
        apiSupported={true}
        isScanning={isScanning}
        rootDirectory={rootDirectory}
        currentDirId={currentDirId}
        activeNode={activeNode}
        sidebarFoldersList={sidebarFoldersList}
        categoryStats={categoryStats}
        handleScanDirectoryPicker={handleScanDirectoryPicker}
        handleScanEntireDisk={handleScanEntireDisk}
        triggerFileInput={triggerFileInput}
        enterDirectory={enterDirectory}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        onRootDeviceClick={handleRootDeviceClick}
        diskSpace={diskSpace}
      />

      <div className="main-content">
        {/* Title Bar */}
        <div className="window-titlebar" data-tauri-drag-region>
          {activeNode ? activeNode.name : 'DiskVision'}
        </div>

        <DiskBar diskSpace={rootDirectory ? diskSpace : null} rootDirectory={rootDirectory} />

        <Header
          breadcrumbs={breadcrumbs}
          enterDirectory={enterDirectory}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          isScanning={isScanning}
          handleCancelScan={handleCancelScan}
          currentView={currentView}
          setView={setView}
          hasData={!!rootDirectory}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
        />

        {/* Tree Table or Empty State */}
        {rootDirectory ? (
          <>
            {activeNode && (activeNode.name === '.Trash' || activeNode.name === '.Trashes') && visibleRows.length === 0 && (
              <div style={{
                margin: '32px auto',
                padding: '28px',
                maxWidth: '460px',
                background: 'linear-gradient(145deg, rgba(32,32,40,0.95), rgba(24,24,30,0.98))',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px',
                textAlign: 'center',
                boxShadow: '0 12px 32px rgba(0,0,0,0.4)'
              }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔒</div>
                <h4 style={{ color: '#fff', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>
                  Содержимое Корзины заблокировано macOS
                </h4>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: '0 0 20px' }}>
                  Система безопасности macOS защищает папки Корзины.
                  Чтобы сканировать и просматривать удаленные файлы, включите тумблер <b>DiskVision</b> в открывшемся окне настроек.
                </p>
                <button 
                  className="sidebar-scan-btn"
                  style={{ width: '100%', padding: '11px 16px', fontSize: '13px', justifyContent: 'center' }}
                  onClick={() => invoke('open_full_disk_access_settings')}
                >
                  ⚙ Включить Полный доступ к диску
                </button>
              </div>
            )}
            {currentView === 'table' && (
              <TreeTable
                visibleRows={visibleRows}
                activeNode={filteredActiveNode}
                expandedPaths={expandedPaths}
                selectedPath={selectedPath}
                setSelectedPath={setSelectedPath}
                toggleExpand={toggleExpand}
                handleDeleteNode={handleDeleteNode}
                requestSort={requestSort}
                sortConfig={sortConfig}
                showToast={showToast}
              />
            )}
            {currentView === 'treemap' && (
              <Treemap
                activeNode={filteredActiveNode}
                enterDirectory={enterDirectory}
                showToast={showToast}
              />
            )}
            {currentView === 'sunburst' && (
              <Sunburst
                activeNode={filteredActiveNode}
                enterDirectory={enterDirectory}
                showToast={showToast}
              />
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-card">
              <HardDrive className="empty-state-icon" size={56} />
              <h3 className="empty-state-title">Analyze Your Storage</h3>
              <p className="empty-state-desc">
                Scan your entire disk or choose a specific folder to see what's taking up space.
                Everything happens locally — nothing leaves your machine.
              </p>
              <button className="empty-state-btn" onClick={handleScanEntireDisk}>
                <HardDrive size={16} />
                Scan Entire Disk
              </button>
              <button className="empty-state-btn-secondary" onClick={handleScanDirectoryPicker}>
                Select Folder
              </button>
            </div>
          </div>
        )}

        {/* Status Bar */}
        {rootDirectory && !isScanning && (
          <div className="status-bar">
            <div className="status-bar-left">
              <span>{visibleRows.length.toLocaleString()} items</span>
              <div className="status-bar-sep" />
              <span>{formatSize(activeNode?.size || 0)}</span>
            </div>
            <div className="status-bar-right">
              <span>{(activeNode?.filesCount || 0).toLocaleString()} files</span>
              <div className="status-bar-sep" />
              <span>{(activeNode?.foldersCount || 0).toLocaleString()} folders</span>
            </div>
          </div>
        )}

        {/* Scan Progress Overlay */}
        {isScanning && (
          <div className="scan-overlay">
            <div className="scan-overlay-header">
              <span className="scan-overlay-title">Scanning…</span>
              <div className="spinner" />
            </div>
            <div className="scan-stat-line">
              <span className="label">Files</span>
              <span className="value">{scanStats.filesCount.toLocaleString()}</span>
            </div>
            <div className="scan-stat-line">
              <span className="label">Folders</span>
              <span className="value">{scanStats.foldersCount.toLocaleString()}</span>
            </div>
            <div className="scan-stat-line">
              <span className="label">Size</span>
              <span className="value">{formatSize(scanStats.totalSize)}</span>
            </div>
            <div className="scan-path" title={scanStats.currentPath}>
              {scanStats.currentPath ? `…/${scanStats.currentPath.split('/').slice(-2).join('/')}` : ''}
            </div>
          </div>
        )}
      </div>

      {/* Full Disk Access Modal */}
      {showFdaModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, rgba(32,32,40,0.97), rgba(24,24,30,0.99))',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '32px 28px 28px',
            maxWidth: '420px', width: '100%',
            boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
            textAlign: 'center'
          }}>
            {/* Icon */}
            <div style={{
              width: '56px', height: '56px', margin: '0 auto 16px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.15))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '28px'
            }}>🛡️</div>

            {/* Title */}
            <h3 style={{
              fontSize: '17px', fontWeight: 600,
              color: '#fff', margin: '0 0 10px', letterSpacing: '-0.01em'
            }}>Full Disk Access</h3>

            {/* Description */}
            <p style={{
              fontSize: '13px', color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.6, margin: '0 0 8px'
            }}>
              DiskVision analyzes storage usage on your Mac.
              Without Full Disk Access, macOS will show
              a separate permission dialog for <b style={{ color: 'rgba(255,255,255,0.75)' }}>each protected folder</b> (Desktop, Documents, Photos…).
            </p>
            <p style={{
              fontSize: '12px', color: 'rgba(255,255,255,0.4)',
              lineHeight: 1.5, margin: '0 0 22px'
            }}>
              Grant access once to scan your entire disk without interruptions.
              DiskVision works 100% offline — no data leaves your Mac.
            </p>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                style={{
                  width: '100%', padding: '12px 20px',
                  borderRadius: '12px', border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: '#fff', fontSize: '14px', fontWeight: 600,
                  transition: 'opacity 0.15s, transform 0.15s'
                }}
                onMouseEnter={e => { e.target.style.opacity = '0.9'; e.target.style.transform = 'scale(0.98)'; }}
                onMouseLeave={e => { e.target.style.opacity = '1'; e.target.style.transform = 'scale(1)'; }}
                onClick={() => {
                  invoke('open_full_disk_access_settings');
                  setShowFdaModal(false);
                }}
              >
                Open System Settings
              </button>
              <button
                style={{
                  width: '100%', padding: '10px 20px',
                  borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)',
                  cursor: 'pointer', background: 'transparent',
                  color: 'rgba(255,255,255,0.45)', fontSize: '13px', fontWeight: 500,
                  transition: 'color 0.15s'
                }}
                onMouseEnter={e => e.target.style.color = 'rgba(255,255,255,0.7)'}
                onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.45)'}
                onClick={() => {
                  localStorage.setItem('diskvision_fda_dismissed', 'true');
                  setShowFdaModal(false);
                }}
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
