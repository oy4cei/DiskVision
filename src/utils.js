/**
 * Formats a file size in bytes into a human-readable string.
 * Uses SI/decimal units (base-1000) to match macOS System Settings.
 * 1 GB = 1,000,000,000 bytes (not 1,073,741,824).
 */
export function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  if (isNaN(bytes) || bytes < 0) return '0 B';
  const k = 1000;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Gets file category based on extension.
 * Categories are user-facing (Photos, Video, Music, etc.)
 */
/**
 * Gets file category based on extension and path heuristics.
 * Categories are user-facing (Photos, Video, Music, etc.)
 */
export function getFileCategory(name, isDirectory, path = '') {
  if (isDirectory) return 'directory';
  const ext = name.split('.').pop().toLowerCase();
  
  // 1. Path-based heuristics (very powerful on macOS for cache, metadata, and developer files with no or weird extensions)
  if (path) {
    const lowerPath = path.toLowerCase();
    if (
      lowerPath.includes('/library/developer/') ||
      lowerPath.includes('/deriveddata/') ||
      lowerPath.includes('/node_modules/') ||
      lowerPath.includes('/.git/') ||
      lowerPath.includes('/.npm/') ||
      lowerPath.includes('/.cargo/') ||
      lowerPath.includes('/.pnpm/') ||
      lowerPath.includes('/.vscode/') ||
      lowerPath.includes('/modulecache/')
    ) {
      return 'developer';
    }
    
    if (
      lowerPath.includes('/library/caches/') ||
      lowerPath.includes('/library/logs/') ||
      lowerPath.includes('/library/containers/') ||
      lowerPath.includes('/library/group containers/') ||
      lowerPath.includes('/library/preferences/') ||
      lowerPath.includes('/var/db/') ||
      lowerPath.includes('/private/var/') ||
      lowerPath.includes('/diagnostics/') ||
      lowerPath.includes('/uuidtext/')
    ) {
      return 'system';
    }
  }

  const categories = {
    photos:    [
      'jpg', 'jpeg', 'jpe', 'png', 'gif', 'webp', 'svg', 'svgz', 'ico', 'tiff', 'tif', 'heic', 'heif', 
      'raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'orf', 'rw2', 'psd', 'psb', 'ai', 'eps', 'xcf', 'sketch', 'fig'
    ],
    video:     [
      'mp4', 'mkv', 'avi', 'mov', 'qt', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', 'm2v', 'ts', 'mts', 
      'm2ts', '3gp', '3g2', 'vob', 'ogv', 'divx', 'asf', 'prproj', 'aep'
    ],
    music:     [
      'mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'wma', 'm4a', 'aiff', 'aif', 'alac', 'opus', 'mid', 'midi', 
      'mka', 'ape', 'mpc', 'caf'
    ],
    documents: [
      'pdf', 'doc', 'docx', 'docm', 'dot', 'dotx', 'xls', 'xlsx', 'xlsm', 'xlt', 'xltx', 'ppt', 'pptx', 
      'pptm', 'pot', 'potx', 'txt', 'rtf', 'csv', 'tsv', 'pages', 'numbers', 'keynote', 'epub', 'mobi', 
      'azw', 'azw3', 'odt', 'ods', 'odp', 'odg', 'odf', 'rtx', 'tex'
    ],
    apps:      [
      'app', 'dmg', 'pkg', 'exe', 'msi', 'ipa', 'apk', 'deb', 'rpm', 'appimage', 'jar', 'run'
    ],
    archives:  [
      'zip', 'rar', 'tar', 'gz', 'gzip', '7z', 'bz2', 'bzip2', 'xz', 'tgz', 'iso', 'img', 'cab', 'wim', 
      'z', 'sit', 'sitx', 'vdi', 'vmdk', 'qcow2', 'ova', 'vhd', 'vhdx', 'pvm', 'hdd'
    ],
    developer: [
      'js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'xhtml', 'css', 'sass', 'scss', 'less', 'py', 'pyc', 'pyd', 
      'pyo', 'go', 'rs', 'cpp', 'cc', 'cxx', 'c', 'h', 'hpp', 'java', 'class', 'cs', 'sh', 'bash', 'zsh', 
      'php', 'rb', 'swift', 'kt', 'kts', 'scala', 'pl', 'pm', 'lua', 'sql', 'ddl', 'sqlitedb', 'json', 
      'xml', 'yaml', 'yml', 'md', 'markdown', 'toml', 'gradle', 'pom', 'lock', 'dockerfile', 'vagrantfile', 
      'makefile', 'map', 'a', 'o', 'la', 'lo', 'pcm', 'mdb'
    ],
    system:    [
      'sys', 'dll', 'dylib', 'so', 'kext', 'bin', 'dat', 'log', 'plist', 'cache', 'db', 'sqlite', 
      'sqlite3', 'localstorage', 'tmp', 'temp', 'bak', 'old', 'localized', 'ds_store', 'telemetry', 
      'crash', 'diag', 'config', 'conf', 'properties', 'backup', 'tracev3', 'dsc', 'uuidtext'
    ]
  };

  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(ext)) return category;
  }
  return 'other';
}

/**
 * Returns color tokens for file categories
 */
export function getCategoryColor(category) {
  const colors = {
    directory: '#4f8df7', // blue
    photos:    '#f0c020', // gold
    video:     '#b06af0', // purple
    music:     '#f05da3', // pink
    documents: '#30d870', // green
    apps:      '#4fc3f7', // sky blue
    archives:  '#ff8528', // orange
    developer: '#18c8e0', // cyan
    system:    '#f05050', // red
    other:     '#a0a8b8'  // grey
  };
  return colors[category] || colors.other;
}

/**
 * Returns user-friendly English display name for a category
 */
export function getCategoryDisplayName(category) {
  const names = {
    directory: 'Folders',
    photos:    'Photos',
    video:     'Video',
    music:     'Music',
    documents: 'Documents',
    apps:      'Applications',
    archives:  'Archives',
    developer: 'Development',
    system:    'System',
    other:     'Other'
  };
  return names[category] || category;
}

/**
 * Returns color configurations for a node (solid, bg, border)
 * Direct files use category colors. Directories use a dynamic stable HSL color based on their path hash.
 */
export function getNodeColors(node) {
  if (node.kind === 'skipped') {
    return {
      solid: '#4b5563',
      bg: 'rgba(75, 85, 99, 0.15)',
      border: 'rgba(75, 85, 99, 0.3)'
    };
  }

  if (node.kind === 'directory') {
    let hash = 0;
    const str = node.id || node.name || '';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    const baseColor = `hsl(${hue}, 72%, 56%)`;
    return {
      solid: baseColor,
      bg: `hsla(${hue}, 72%, 56%, 0.14)`,
      border: `hsla(${hue}, 72%, 56%, 0.4)`
    };
  }

  const category = getFileCategory(node.name, false, node.id);
  const hex = getCategoryColor(category);
  return {
    solid: hex,
    bg: `${hex}15`,
    border: `${hex}40`
  };
}


/**
 * Scans a folder recursively and updates state incrementally
 * @param {FileSystemDirectoryHandle} dirHandle 
 * @param {string} path 
 * @param {function} onUpdate - callback for periodic updates
 * @param {object} abortSignal - to support cancellation
 */
export async function scanDirectoryIncremental(dirHandle, path = '', onUpdate, abortSignal = { cancelled: false }) {
  let stats = {
    filesCount: 0,
    foldersCount: 0,
    totalSize: 0,
    currentPath: dirHandle.name
  };

  // Internal recursive scan
  async function scan(handle, currentPath) {
    if (abortSignal.cancelled) return null;

    const node = {
      id: currentPath || handle.name,
      name: handle.name,
      kind: 'directory',
      size: 0,
      filesCount: 0,
      foldersCount: 0,
      children: [],
      handle: handle
    };

    try {
      for await (const entry of handle.values()) {
        if (abortSignal.cancelled) return null;

        const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        
        if (entry.kind === 'file') {
          try {
            const file = await entry.getFile();
            const fileSize = file.size;

            stats.filesCount++;
            stats.totalSize += fileSize;
            
            node.size += fileSize;
            node.filesCount++;
            node.children.push({
              id: entryPath,
              name: entry.name,
              kind: 'file',
              size: fileSize,
              filesCount: 1,
              foldersCount: 0,
              handle: entry
            });

            // Periodically report progress to avoid freezing UI
            if (stats.filesCount % 50 === 0) {
              stats.currentPath = entryPath;
              onUpdate({ ...stats });
            }
          } catch (e) {
            console.warn(`Could not read file size: ${entryPath}`, e);
          }
        } else if (entry.kind === 'directory') {
          stats.foldersCount++;
          node.foldersCount++;
          
          const subDir = await scan(entry, entryPath);
          if (subDir) {
            node.size += subDir.size;
            node.filesCount += subDir.filesCount;
            node.foldersCount += subDir.foldersCount;
            node.children.push(subDir);
          }
        }
      }
    } catch (e) {
      console.warn(`Error scanning directory: ${currentPath || handle.name}`, e);
    }

    // Sort children by size descending
    node.children.sort((a, b) => b.size - a.size);
    return node;
  }

  const rootNode = await scan(dirHandle, path);
  return { rootNode, stats };
}
